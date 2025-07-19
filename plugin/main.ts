import { Plugin, Notice, Modal, App, ButtonComponent, TFile } from 'obsidian';
import JSZip from 'jszip';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import FormData from 'form-data';
import { FileSystemAdapter } from 'obsidian';

const BACKEND_URL = 'https://obsidian-to-origin.onrender.com';
const AUTH_TOKEN = 'supersecret123';

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

		new Notice(`Downloading latest ${vaultName} from Origin...`);

		try {
			const { data } = await axios.get(`${BACKEND_URL}/download/${encodeURIComponent(vaultName)}`, {
				headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
			});

			if (!data.downloadUrl) throw new Error('No download URL');

			console.log('🔗 Signed download URL:', data.downloadUrl);

			const zipRes = await axios.get(data.downloadUrl, { responseType: 'arraybuffer' });

			const downloadPath = path.join(vaultPath, 'origin-download.zip');
			await fs.writeFile(downloadPath, Buffer.from(zipRes.data));

			new Notice(`✅ Zip saved as origin-download.zip in your vault folder`);
			console.log(`Downloaded zip saved to: ${downloadPath}`);
		} catch (err) {
			console.error(err);
			new Notice('❌ Download failed');
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
