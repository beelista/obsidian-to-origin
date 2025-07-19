import { Plugin, Notice, Modal, App, ButtonComponent } from 'obsidian';

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

		modalEl.classList.add('sync-modal'); // <--- add to outer modal
		contentEl.empty();

		contentEl.createEl('div', { text: 'What would you like to do?', cls: 'sync-modal-title' });

		const buttonContainer = contentEl.createDiv('sync-button-container');

		new ButtonComponent(buttonContainer)
			.setButtonText('Upload to Origin')
			.setClass('sync-button')
			.onClick(() => {
				new Notice('Backing up to origin');
				this.close();
			});

		new ButtonComponent(buttonContainer)
			.setButtonText('Sync with Origin')
			.setClass('sync-button')
			.onClick(() => {
				new Notice('Downloading origin data');
				this.close();
			});
	}


	onClose() {
		this.contentEl.empty();
	}
}
