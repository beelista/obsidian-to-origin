import { Plugin, Notice, Modal, App, ButtonComponent } from 'obsidian';
import JSZip from 'jszip';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import FormData from 'form-data';
import { FileSystemAdapter } from 'obsidian';
import dotenv from 'dotenv';

dotenv.config();

const BACKEND_URL = 'https://obsidian-to-origin.onrender.com';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

if (!AUTH_TOKEN) {
	console.error("❌ AUTH_TOKEN not found in .env file");
}

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

	onOpen() {
		const { contentEl, modalEl } = this;

		modalEl.classList.add('sync-modal');
		contentEl.empty();

		contentEl.createEl('div', { text: 'What would you like to do?', cls: 'sync-modal-title' });

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
				this.downloadVault();
				this.close();
			});
	}

	async uploadVault() {
		const vault = this.app.vault;
		const vaultName = vault.getName();
		const vaultPath = (vault.adapter as FileSystemAdapter).getBasePath();

		const zip = new JSZip();

		new Notice(`Zipping ${vaultName}...`);

		try {
			const allEntries = await fs.readdir(vaultPath);
			await this.addFilesToZip(zip, vaultPath, allEntries);

			const zipBlob = await zip.generateAsync({ type: 'nodebuffer' });

			const formData = new FormData();
			formData.append('vault', new Blob([zipBlob]), 'vault.zip');

			new Notice(`Uploading ${vaultName} to Origin...`);

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

			new Notice('✅ Upload complete!');
			console.log(response.data);
		} catch (err) {
			console.error(err);
			new Notice('❌ Upload failed');
		}
	}

	async downloadVault() {
		const vault = this.app.vault;
		const vaultName = vault.getName();
		const vaultPath = (vault.adapter as FileSystemAdapter).getBasePath();

		new Notice(`Downloading and syncing ${vaultName} from Origin...`);

		try {
			const { data } = await axios.get(`${BACKEND_URL}/download/${encodeURIComponent(vaultName)}`, {
				headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
			});

			if (!data.downloadUrl) throw new Error('No download URL');

			const zipRes = await axios.get(data.downloadUrl, { responseType: 'arraybuffer' });

			const tempZipPath = path.join(vaultPath, 'origin-download.zip');
			const extractPath = path.join(vaultPath, '__origin_tmp_extract__');

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
				.filter(f => !f.includes('__origin_tmp_extract__') && !f.endsWith('.zip'));

			const extractedFiles = await walk(extractPath);

			const extractedRelPaths = extractedFiles.map(f => path.relative(extractPath, f));
			const localRelPaths = localFiles.map(f => path.relative(vaultPath, f));

			for (const rel of localRelPaths) {
				if (!extractedRelPaths.includes(rel)) {
					const toDelete = path.join(vaultPath, rel);
					await fs.remove(toDelete);
					console.log(`🗑️ Deleted: ${rel}`);
				}
			}

			for (const rel of extractedRelPaths) {
				const fromPath = path.join(extractPath, rel);
				const toPath = path.join(vaultPath, rel);
				await fs.ensureDir(path.dirname(toPath));
				await fs.copy(fromPath, toPath, { overwrite: true });
				console.log(`📁 Synced: ${rel}`);
			}

			await fs.remove(extractPath);
			await fs.remove(tempZipPath);

			new Notice('✅ Sync complete!');
		} catch (err) {
			console.error(err);
			new Notice('❌ Sync failed');
		}
	}

	async addFilesToZip(zip: JSZip, basePath: string, entries: string[]) {
		for (const entry of entries) {
			const fullPath = path.join(basePath, entry);
			const stat = await fs.stat(fullPath).catch(() => null);

			if (!stat) {
				console.warn(`⚠️ Skipping missing file: ${fullPath}`);
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

	onClose() {
		this.contentEl.empty();
	}
}
