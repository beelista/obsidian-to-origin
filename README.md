# Obsidian 2 Origin

This is a custom plugin for [Obsidian](https://obsidian.md/) that allows you to upload the entire content of your vault to a remote Supabase DB and later sync it back from the origin - making it useful for remote backups, synchronization, or collaboration workflows.

---

## Features:

- Upload your entire Obsidian vault to a remote backend.
- Download and synchronize changes from the backend into your local vault:
  - Deletes local files that no longer exist in the origin version.
  - Downloads files from the origin that are missing locally.
  - Replicates the entire file structure one-to-one.
- Maintains a single copy of each vault in the database, which gets updated every time you upload.
- Provides a simple user interface via a ribbon icon and modal inside Obsidian for easy interaction.

---

## Deployment

To install and use this plugin in your Obsidian vault:

1. **Locate Your Vault Folder**
   Open your vault in Obsidian, and open its folder on disk.

2. **Navigate to the Plugins Directory**
   Go to:
   ```
   YourVault/.obsidian/plugins/
   ```
   
3. **Create Plugin Folder**
   Create a new folder named:
   ```
   obsidian-2-origin
   ```
   
4. **Add Plugin Files**
   Place all 3 files from the `deploy/` folder into the `obsidian-2-origin` directory:
   ```
   YourVault/.obsidian/plugins/obsidian-2-origin/
   ├── manifest.json
   ├── main.js
   └── styles.css
   ```
   
5. **Enable the Plugin**
   - Open Obsidian.
   - Go to **Settings/Community plugins**.
   - Enable `Obsidian 2 Origin`.

---

## Authentication

You need an authentication token to use the plugin.

### Steps:

1. In the **root folder** of your vault, create a file named:
   ```
   super-important-key.json
   ```

2. Add the following content to it:
   ```json
   {
     "AUTH_TOKEN": "your-auth-token-goes-here"
   }
   ```
   > Keep this token safe. It will be automatically excluded from uploads.

---

## Usage

Once the plugin is installed and enabled:

1. Click on the 🔁 **Sync ribbon icon** in the left toolbar.

2. A modal will open with two options:

   - **Upload to Origin** – zips and uploads your vault.
   - **Sync with Origin** – downloads and syncs your vault with the version from Origin.

---

## Backend Configuration

For my personal use, this plugin was configured to use the deployed backend hosted at:

```
https://obsidian-to-origin.onrender.com
```

with the endpoints:
- **Upload**: `POST /upload?vaultName=yourVaultName`
- **Download**: `GET /download/yourVaultName`

You will need to set up your own instances of Render and Supabase to use this plugin. If you need help with the setup, or if you'd prefer that I add your key to my existing infrastructure, feel free to reach out to me @beelista on Discord.

---

## Warnings

- This plugin will delete local files that are no longer in the Origin version during sync.
- Make sure you have a backup before syncing if you're unsure.
- One zip is stored per vault on the backend.

---

## Development Notes

The main plugin logic is written in `main.ts` and compiled into `main.js` (placed inside `deploy/`). If you are modifying the plugin, rebuild the plugin and copy the output files into the `deploy/` folder before placing it in your vault.

---
