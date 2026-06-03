import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Configure Helmet with secure CSP that allows required external CDNs and Google Analytics
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'", // js-tiktoken/mammoth.js dynamic code requirements
                    "https://cdnjs.cloudflare.com",
                    "https://unpkg.com",
                    "https://www.googletagmanager.com"
                ],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: [
                    "'self'",
                    "https://unpkg.com",
                    "https://www.google-analytics.com",
                    "https://region1.google-analytics.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https://www.google-analytics.com",
                    "https://www.googletagmanager.com"
                ]
            }
        }
    })
);

// Global rate limiting: maximum of 150 requests per 15 minutes per IP
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 150,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});
app.use(globalLimiter);

// Specific stricter limit for file conversion: 15 requests per 15 minutes
const convertLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    message: { success: false, error: 'Too many document conversion attempts. Please try again after 15 minutes.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

// Specific limit for submitting feedback: 5 submissions per 15 minutes
const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { success: false, error: 'Too many feedback submissions. Please try again after 15 minutes.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
});

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

// Cached python environment status to avoid spawning shell processes on every health check
let pythonStatus = {
    checked: false,
    cmd: null,
    hasMarkItDown: false,
    message: 'Checking...',
    runMethod: ''
};

// Perform check once on startup/first load
function checkPythonEnvironment(callback) {
    if (pythonStatus.checked) {
        if (callback) callback(pythonStatus);
        return;
    }

    const isWin = process.platform === 'win32';
    const commands = isWin ? ['python', 'py', 'python3'] : ['python3', 'python'];

    let index = 0;
    function tryNext() {
        if (index >= commands.length) {
            pythonStatus.checked = true;
            pythonStatus.cmd = null;
            pythonStatus.hasMarkItDown = false;
            pythonStatus.message = 'Python is not installed or not on PATH.';
            if (callback) callback(pythonStatus);
            return;
        }
        const cmd = commands[index++];
        exec(`${cmd} --version`, (err) => {
            if (!err) {
                // Found python command, now check for markitdown
                exec(`${cmd} -c "import markitdown; print('ok')"`, (pyErr) => {
                    pythonStatus.checked = true;
                    pythonStatus.cmd = cmd;
                    if (pyErr) {
                        pythonStatus.hasMarkItDown = false;
                        pythonStatus.message = 'Server is running, but markitdown is not installed.';
                    } else {
                        pythonStatus.hasMarkItDown = true;
                        pythonStatus.message = `Server running. MarkItDown ready via ${cmd}.`;
                        pythonStatus.runMethod = `${cmd} -m markitdown`;
                    }
                    if (callback) callback(pythonStatus);
                });
                return;
            }
            tryNext();
        });
    }
    tryNext();
}

// Detect which Python command works on this machine
function getPythonCommand(callback) {
    checkPythonEnvironment((status) => {
        callback(status.cmd);
    });
}

// Ping endpoint to verify server is active and check for markitdown package
app.get('/api/health', (req, res) => {
    checkPythonEnvironment((status) => {
        if (!status.cmd) {
            return res.json({
                status: 'warning',
                message: status.message,
                hasMarkItDown: false
            });
        }
        if (!status.hasMarkItDown) {
            return res.json({
                status: 'warning',
                message: status.message,
                error: 'Please run: pip install markitdown',
                hasMarkItDown: false
            });
        }
        return res.json({
            status: 'ok',
            message: status.message,
            hasMarkItDown: true,
            runMethod: status.runMethod
        });
    });
});

// Status endpoint returning detailed system diagnostics
app.get('/api/status', (req, res) => {
    checkPythonEnvironment((status) => {
        const memory = process.memoryUsage();
        res.json({
            status: 'ok',
            version: '2.0.0',
            uptime: Math.floor(process.uptime()),
            platform: process.platform,
            nodeVersion: process.version,
            memory: {
                rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`
            },
            pythonEnvironment: {
                available: !!status.cmd,
                command: status.cmd,
                hasMarkItDown: status.hasMarkItDown,
                message: status.message
            }
        });
    });
});

// Conversion endpoint
app.post('/api/convert', convertLimiter, upload.single('file'), (req, res) => {
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
        logger.info(`Spawning process: ${pythonCmd} -m markitdown "${filePath}"`);

        execFile(pythonCmd, args, { maxBuffer: 10 * 1024 * 1024 }, (execErr, stdout, stderr) => {
            // Clean up temp file regardless of outcome
            fs.unlink(filePath, (unlinkErr) => {
                if (unlinkErr) logger.error(`Could not delete temp file: ${filePath}`, unlinkErr);
            });

            if (execErr) {
                logger.error('MarkItDown conversion error', execErr);
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
    });
});

// Setup feedback directory
const feedbackDir = path.join(__dirname, 'feedback');

// Feedback submission endpoint
app.post('/api/feedback', feedbackLimiter, (req, res) => {
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
                logger.error('Error parsing feedback file, resetting', readErr);
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

        logger.info(`Received anonymous feedback`, { rating: parsedRating });
        res.json({ success: true, message: 'Feedback submitted successfully!' });
    } catch (err) {
        logger.error('Error saving feedback', err);
        res.status(500).json({ success: false, error: 'Failed to save feedback on the server.' });
    }
});

// Start server
app.listen(PORT, () => {
    logger.info(`OptiByte Backend starting up on port ${PORT}...`);
    // Warm up the python environment check cache
    checkPythonEnvironment((status) => {
        logger.info(`Python environment status: ${status.message}`, {
            hasMarkItDown: status.hasMarkItDown,
            cmd: status.cmd
        });
    });
});
