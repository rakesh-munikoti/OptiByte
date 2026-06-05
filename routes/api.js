import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

import { convertLimiter, feedbackLimiter, errorLogLimiter } from '../middlewares/rateLimiters.js';
import { authenticateApiKey } from '../middlewares/auth.js';
import { optimizeText, submitFeedback, logClientError, getConfig } from '../controllers/apiController.js';
import { convertFile } from '../controllers/fileController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const tempDir = path.join(projectRoot, 'temp');

const router = express.Router();

// Setup Multer for document uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempDir),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'application/pdf', 
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain', 'text/markdown', 'text/html', 'text/csv', 'application/json'
        ];
        const allowedExtensions = ['.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.ppt', '.txt', '.md', '.html', '.csv', '.json'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Unsupported file type'), false);
        }
    }
});

// Document Conversion Endpoint
router.post('/upload', convertLimiter, upload.single('document'), convertFile);

// Programmatic optimization API route
router.post('/optimize', authenticateApiKey, optimizeText);

// Config endpoint for client-side environment variables
router.get('/config', getConfig);

// Feedback submission endpoint
router.post('/feedback', feedbackLimiter, submitFeedback);

// Endpoint to receive and log client-side JavaScript errors
router.post('/log-error', errorLogLimiter, logClientError);

export default router;
