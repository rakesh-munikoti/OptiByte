import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { logger } from '../services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const sanitizeFilename = (name) => {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
};

export const convertFile = (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const tempPath = req.file.path;
    
    // We use the full path to python directly to ensure it works in PM2/cron environments
    // In Render, `python` is aliased to python3 automatically.
    execFile('python', ['-m', 'markitdown', tempPath], (execErr, stdout, stderr) => {
        // Clean up the temporary uploaded file asynchronously
        fs.unlink(tempPath, (unlinkErr) => {
            if (unlinkErr) logger.error('Error deleting temp file', unlinkErr);
        });

        if (execErr) {
            logger.error('File conversion failed', { error: execErr, stderr });
            return res.status(500).json({
                success: false,
                error: 'Conversion failed. Please verify that python package markitdown is installed.',
                details: stderr || execErr.message
            });
        }

        const safeOriginalName = sanitizeFilename(req.file.originalname);
        logger.info(`Converted file successfully`, { filename: safeOriginalName, size: stdout.length });
        res.json({
            success: true,
            filename: safeOriginalName,
            markdown: stdout
        });
    });
};
