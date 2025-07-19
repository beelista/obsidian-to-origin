const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simple auth using an env token
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'changeme';

// Store uploaded files in "uploads/" dir
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Set up multer to handle file uploads
const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadDir),
	filename: (req, file, cb) => {
		const timestamp = Date.now();
		cb(null, `vault-${timestamp}.zip`);
	}
});

const upload = multer({ storage });

// Auth middleware
app.use((req, res, next) => {
	console.log(`${req.method} ${req.url}`);
	const token = req.headers.authorization?.split(' ')[1];
	if (token !== AUTH_TOKEN) {
		console.log("Unauthorized access attempt.");
		return res.status(401).json({ error: 'Unauthorized' });
	}
	next();
});


// Upload endpoint
app.post('/upload', upload.single('vault'), (req, res) => {
	if (!req.file) {
		return res.status(400).json({ error: 'No file uploaded' });
	}
	const fileUrl = `/uploads/${req.file.filename}`;
	console.log('Uploaded file:', req.file.filename);
	res.json({ status: 'ok', file: fileUrl });
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadDir));

app.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`);
});
