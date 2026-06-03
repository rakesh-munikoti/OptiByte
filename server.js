import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Block access to sensitive server-side files and directories
app.use((req, res, next) => {
    const blockedFiles = ['/server.js', '/package.json', '/package-lock.json', '/test.js'];
    const blockedDirs = ['/temp', '/node_modules'];
    const urlLower = req.path.toLowerCase();

    if (
        blockedFiles.includes(urlLower) || 
        blockedDirs.some(dir => urlLower.startsWith(dir)) ||
        urlLower.includes('.git') ||
        urlLower.includes('.env')
    ) {
        return res.status(403).send('Access Denied');
    }
    next();
});

// Serve frontend static files (index.html, styles.css, app.js, etc.)
app.use(express.static(__dirname));

// Set up temporary upload directory
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Filename sanitizer to block command injection patterns and path traversal
function sanitizeFilename(filename) {
    if (!filename) return 'unnamed_file';
    // Remove characters that might act as shell metacharacters: ;, &, |, `, $, etc.
    const cleaned = filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    // Prevent path traversal and multiple dots
    return cleaned.replace(/\.+/g, '.');
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempDir);
    },
    filename: (req, file, cb) => {
        // Keep original extension so markitdown knows how to parse it
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const safeName = sanitizeFilename(file.originalname);
        cb(null, uniqueSuffix + '-' + safeName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});

// Detect which Python command works on this machine
function getPythonCommand(callback) {
    exec('python --version', (err) => {
        if (!err) return callback('python');
        exec('py --version', (err2) => {
            if (!err2) return callback('py');
            callback(null); // No python found
        });
    });
}

// Ping endpoint to verify server is active and check for markitdown package
app.get('/api/health', (req, res) => {
    getPythonCommand((pythonCmd) => {
        if (!pythonCmd) {
            return res.json({
                status: 'warning',
                message: 'Python is not installed or not on PATH.',
                hasMarkItDown: false
            });
        }
        exec(`${pythonCmd} -c "import markitdown; print('ok')"`, (pyErr, stdout) => {
            if (pyErr) {
                return res.json({
                    status: 'warning',
                    message: 'Server is running, but markitdown is not installed.',
                    error: 'Please run: pip install markitdown',
                    hasMarkItDown: false
                });
            }
            return res.json({
                status: 'ok',
                message: `Server running. MarkItDown ready via ${pythonCmd}.`,
                hasMarkItDown: true,
                runMethod: `${pythonCmd} -m markitdown`
            });
        });
    });
});

// Conversion endpoint
app.post('/api/convert', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded.' });
    }

    const filePath = req.file.path;

    getPythonCommand((pythonCmd) => {
        if (!pythonCmd) {
            fs.unlink(filePath, () => {});
            return res.status(500).json({
                success: false,
                error: 'Python is not installed or not on PATH. Please install Python 3.'
            });
        }

        const args = ['-m', 'markitdown', filePath];
        console.log(`OptiByte Server: Spawning safe process: ${pythonCmd} -m markitdown "${filePath}"`);

        execFile(pythonCmd, args, { maxBuffer: 10 * 1024 * 1024 }, (execErr, stdout, stderr) => {
            // Clean up temp file regardless of outcome
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) console.error(`Could not delete temp file: ${filePath}`);
            });

            if (execErr) {
                console.error('MarkItDown error:', stderr || execErr.message);
                return res.status(500).json({
                    success: false,
                    error: 'Conversion failed. Please verify that python package markitdown is installed.',
                    details: stderr || execErr.message
                });
            }

            const safeOriginalName = sanitizeFilename(req.file.originalname);
            console.log(`OptiByte: Converted ${safeOriginalName} → ${stdout.length} chars`);
            res.json({
                success: true,
                filename: safeOriginalName,
                markdown: stdout
            });
        });
    });
});

// Setup feedback directory
const feedbackDir = path.join(__dirname, 'feedback');

// Feedback submission endpoint
app.post('/api/feedback', (req, res) => {
    const { rating, message } = req.body;

    // Validate inputs
    const parsedRating = parseInt(rating);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ success: false, error: 'Rating must be a number between 1 and 5.' });
    }
    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ success: false, error: 'Feedback message cannot be empty.' });
    }

    try {
        // Create feedback directory if it does not exist
        if (!fs.existsSync(feedbackDir)) {
            fs.mkdirSync(feedbackDir, { recursive: true });
        }

        const filePath = path.join(feedbackDir, 'submissions.json');
        let submissions = [];

        // Read existing submissions if file exists
        if (fs.existsSync(filePath)) {
            try {
                const rawData = fs.readFileSync(filePath, 'utf8');
                submissions = JSON.parse(rawData);
                if (!Array.isArray(submissions)) {
                    submissions = [];
                }
            } catch (readErr) {
                console.error('Error parsing feedback file, resetting:', readErr);
                submissions = [];
            }
        }

        // Build new feedback entry (purely anonymous)
        const newFeedback = {
            rating: parsedRating,
            message: message.trim().substring(0, 5000), // Cap length at 5000 chars
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent'] || 'Unknown'
        };

        submissions.push(newFeedback);

        // Write back to file with pretty print
        fs.writeFileSync(filePath, JSON.stringify(submissions, null, 2), 'utf8');

        console.log(`OptiByte Server: Received anonymous feedback (Rating: ${parsedRating})`);
        res.json({ success: true, message: 'Feedback submitted successfully!' });
    } catch (err) {
        console.error('Error saving feedback:', err);
        res.status(500).json({ success: false, error: 'Failed to save feedback on the server.' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`OptiByte Backend running on: http://localhost:${PORT}`);
    console.log(`Checking for markitdown installation...`);
    console.log(`=======================================================`);
});
