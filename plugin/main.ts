import { Plugin, Notice, Modal, App, ButtonComponent } from 'obsidian';
import JSZip from 'jszip';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import FormData from 'form-data';
import { FileSystemAdapter } from 'obsidian';
import * as os from 'os';

const BACKEND_URL = 'https://obsidian-to-origin.onrender.com';
const TOKEN_FILE_NAME = 'super-important-key.json'; // Create your own key file and store it in the root of your vault

export default class MyPlugin extends Plugin {
	async onload() {
		const ribbonIconEl = this.addRibbonIcon('sync', 'Sync Plugin', () => {
			new SyncOptionsModal(this.app).open();
		});
		ribbonIconEl.addClass('sync-plugin-ribbon');
	}

	onunload() {
		console.log('Sync Plugin unloaded');
	}
}

class SyncOptionsModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	// UI Instantiation
	onOpen() {
		const { contentEl, modalEl } = this;

		modalEl.classList.add('sync-modal');
		contentEl.empty();

		contentEl.createEl('div', { text: 'Choose your action', cls: 'sync-modal-title' });

		const buttonContainer = contentEl.createDiv('sync-button-container');

		new ButtonComponent(buttonContainer)
			.setButtonText('Upload to Origin')
			.setClass('sync-button')
			.onClick(() => {
				this.uploadVault();
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('Sync with Origin')
			.setClass('sync-button')
			.onClick(() => {
				this.syncVault();
				this.close();
			});
	}

	// Get AUTH_TOKEN value from your key file
	async getAuthToken(vaultPath: string): Promise<string> {
		const tokenFile = path.join(vaultPath, TOKEN_FILE_NAME);
		try {
			const raw = await fs.readFile(tokenFile, 'utf-8');
			const json = JSON.parse(raw);
			if (!json.AUTH_TOKEN) throw new Error('Missing AUTH_TOKEN in token file');
			return json.AUTH_TOKEN;
		} catch (e) {
			console.error('Failed to read AUTH_TOKEN:', e);
			throw new Error('AUTH_TOKEN not found or invalid');
		}
	}

	// Upload vault content to the Supabase bucket
	async uploadVault() {
		const vault = this.app.vault;
		const vaultName = vault.getName();
		const vaultPath = (vault.adapter as FileSystemAdapter).getBasePath();
		const AUTH_TOKEN = await this.getAuthToken(vaultPath);

		const zip = new JSZip();
		new Notice(`Zipping your vault`);

		try {
			const allEntries = await fs.readdir(vaultPath);
			await this.addFilesToZip(zip, vaultPath, allEntries);

			const zipBlob = await zip.generateAsync({ type: 'nodebuffer' });

			const formData = new FormData();
			formData.append('vault', new Blob([zipBlob]), 'vault.zip');

			new Notice(`Uploading vault to origin`);

			const response = await axios.post(
				`${BACKEND_URL}/upload?vaultName=${encodeURIComponent(vaultName)}`,
				formData,
				{
					headers: {
						Authorization: `Bearer ${AUTH_TOKEN}`,
						...formData.getHeaders?.(),
					},
					maxContentLength: Infinity,
					maxBodyLength: Infinity
				}
			);

			new Notice('Upload complete :)');
			console.log(response.data);
		} catch (err) {
			console.error(err);
			new Notice('Upload failed :(');
		}
	}

	// Download and sync remote vault to your current vault - After which the downloaded data is deleted
	async syncVault() {
		const vault = this.app.vault;
		const vaultName = vault.getName();
		const vaultPath = (vault.adapter as FileSystemAdapter).getBasePath();
		const AUTH_TOKEN = await this.getAuthToken(vaultPath);

		new Notice(`Downloading and syncing vault data from Origin...`);

		try {
			const { data } = await axios.get(`${BACKEND_URL}/download/${encodeURIComponent(vaultName)}`, {
				headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
			});

			if (!data.downloadUrl) throw new Error('No download URL');

			const zipRes = await axios.get(data.downloadUrl, { responseType: 'arraybuffer' });

			const tempZipPath = path.join(vaultPath, 'origin-download.zip');
			const extractPath = path.join(os.tmpdir(), `__origin_tmp_extract___${vaultName}`);

			await fs.writeFile(tempZipPath, Buffer.from(zipRes.data));

			const zip = await JSZip.loadAsync(Buffer.from(zipRes.data));
			await fs.ensureDir(extractPath);

			const promises: Promise<any>[] = [];

			zip.forEach((relativePath, zipEntry) => {
				const fullExtractedPath = path.join(extractPath, relativePath);
				if (zipEntry.dir) {
					promises.push(fs.ensureDir(fullExtractedPath));
				} else {
					promises.push(
						zipEntry.async('nodebuffer').then(content => {
							return fs.outputFile(fullExtractedPath, content);
						})
					);
				}
			});

			await Promise.all(promises);

			const walk = async (dir: string): Promise<string[]> => {
				const subdirs = await fs.readdir(dir);
				const files = await Promise.all(subdirs.map(async subdir => {
					const res = path.resolve(dir, subdir);
					return (await fs.stat(res)).isDirectory() ? walk(res) : res;
				}));
				return files.flat();
			};

			const localFiles = (await walk(vaultPath))
				.filter(f =>
					!f.includes('__origin_tmp_extract__') &&
					!f.endsWith('.zip') &&
					!f.endsWith(TOKEN_FILE_NAME)
				);

			const extractedFiles = await walk(extractPath);
			const extractedRelPaths = extractedFiles.map(f => path.relative(extractPath, f));
			const localRelPaths = localFiles.map(f => path.relative(vaultPath, f));

			for (const rel of localRelPaths) {
				if (!extractedRelPaths.includes(rel)) {
					const toDelete = path.join(vaultPath, rel);
					await fs.remove(toDelete);
					await this.removeEmptyDirsRecursively(path.dirname(toDelete), vaultPath);
				}
			}

			for (const rel of extractedRelPaths) {
				const fromPath = path.join(extractPath, rel);
				const toPath = path.join(vaultPath, rel);
				await fs.ensureDir(path.dirname(toPath));
				await fs.copy(fromPath, toPath, { overwrite: true });
			}
			console.log("Synced completely")

			await fs.remove(extractPath);
			await fs.remove(tempZipPath);

			new Notice('Sync complete!');
		} catch (err) {
			console.error(err);
			new Notice('Sync failed');
		}
	}

	// BUG: Removes empty folders post sync
	async removeEmptyDirsRecursively(dir: string, stopAt: string) {
		if (dir === stopAt) return;

		const files = await fs.readdir(dir).catch(() => []);
		if (files.length === 0) {
			await fs.rmdir(dir).catch(() => { });
			await this.removeEmptyDirsRecursively(path.dirname(dir), stopAt);
		}
	}

	// Helper function to queue data for upload
	async addFilesToZip(zip: JSZip, basePath: string, entries: string[]) {
		for (const entry of entries) {
			if (entry === TOKEN_FILE_NAME) continue;

			const fullPath = path.join(basePath, entry);
			const stat = await fs.stat(fullPath).catch(() => null);

			if (!stat) {
				console.warn(`Skipping missing file: ${fullPath}`);
				continue;
			}

			if (stat.isDirectory()) {
				const folder = zip.folder(entry);
				const subEntries = await fs.readdir(fullPath);
				await this.addFilesToZip(folder!, fullPath, subEntries);
			} else {
				const content = await fs.readFile(fullPath);
				zip.file(entry, content);
			}
		}
	}

	// Please pay me @abhinakka1912@okicici
	onClose() {
		this.contentEl.empty();
	}
}