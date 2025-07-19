const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'changeme';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
);

// Enable CORS for Obsidian desktop
app.use(cors({
  origin: 'app://obsidian.md',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Too many requests. Please try again later.'
  }
});
app.use(limiter);

// Set up uploads folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `temp-${Date.now()}.zip`)
});
const upload = multer({ storage });

// Authorization middleware
const authenticate = (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  const token = req.headers.authorization?.split(' ')[1];
  if (token !== AUTH_TOKEN) {
    console.log("Unauthorized access attempt.");
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
app.use(authenticate);

// Upload Route - Ensures only one zip per vault
app.post('/upload', upload.single('vault'), async (req, res) => {
  const vaultName = req.query.vaultName;
  if (!vaultName) return res.status(400).json({ error: 'Missing vaultName query param' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const fileName = `vaults/${vaultName}.zip`; // Only one ZIP per vault

  try {
    const fileBuffer = fs.readFileSync(filePath);

    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(fileName, fileBuffer, {
        contentType: 'application/zip',
        upsert: true // Overwrite existing file
      });

    fs.unlinkSync(filePath); // Clean up temp file

    if (uploadError) {
      console.error('Upload failed:', uploadError);
      return res.status(500).json({ error: 'Failed to upload to Supabase' });
    }

    const { data, error: urlError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(fileName, 60 * 60); // 1 hour

    if (urlError) {
      console.error('Signed URL error:', urlError);
      return res.status(500).json({ error: 'Failed to generate download link' });
    }

    return res.json({
      status: 'ok',
      message: `Vault '${vaultName}' uploaded successfully`,
      downloadUrl: data.signedUrl
    });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Download Route
app.get('/download/:vaultName', async (req, res) => {
  const vaultName = req.params.vaultName;
  const filePath = `vaults/${vaultName}.zip`;

  try {
    const { data, error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .createSignedUrl(filePath, 60 * 60);

    if (error || !data?.signedUrl) {
      console.error('Signed URL error:', error?.message || 'No signed URL');
      return res.status(404).json({ error: 'File not found or inaccessible' });
    }

    return res.json({
      status: 'ok',
      downloadUrl: data.signedUrl
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Please pay me @abhinakka1912@okicici
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
