import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { exec, execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import compression from 'compression';
import Stripe from 'stripe';
import { logger } from './logger.js';
import { compressText } from './compressor.js';
import { countTokens } from './tokenizer.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Enable trust proxy for express-rate-limit behind reverse proxies (Render)
app.set('trust proxy', 1);

// Enable compression
app.use(compression());

// Stripe Webhook Endpoint (requires raw request body parser)
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder');
    } catch (err) {
        logger.error('Stripe webhook signature verification failed', err);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const customerEmail = session.customer_details ? session.customer_details.email : 'unknown@domain.com';
        
        let plan = 'Pro';
        let dailyLimit = 500000;
        
        if (session.metadata && session.metadata.plan) {
            plan = session.metadata.plan;
            if (plan.toLowerCase() === 'enterprise') {
                dailyLimit = 10000000;
            }
        }

        import('crypto').then(({ randomUUID }) => {
            const newKey = `ob_${randomUUID().replace(/-/g, '')}`;
            const keys = readKeys();
            
            keys[newKey] = {
                plan,
                dailyLimit,
                usedToday: 0,
                lastUsedDate: new Date().toISOString().split('T')[0],
                email: customerEmail,
                createdAt: new Date().toISOString(),
                sessionId: session.id
            };
            
            writeKeys(keys);
            logger.info(`Successfully provisioned API key for subscription`, { email: customerEmail, plan });
        }).catch(err => {
            logger.error('Error generating api key on webhook success', err);
        });
    }

    res.json({ received: true });
});

app.use(express.json());

// CORS Lockdown: allow specific origins in production
const allowedOrigin = process.env.NODE_ENV === 'production'
    ? 'https://optibyte-ypd6.onrender.com'
    : '*';

app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
}));

// Configure Helmet with secure CSP that allows required external CDNs and Google Analytics
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    // Removed 'unsafe-eval' to mitigate XSS risks (Mammoth and js-tiktoken checked)
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

// Redirect HTTP to HTTPS in production & enforce HSTS
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});

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

// Specific limit for client error logging: 30 logs per 15 minutes
const errorLogLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    message: { success: false, error: 'Too many error logs sent.' },
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
        return res.status(403).json({ success: false, error: 'Access Denied', code: 'ACCESS_DENIED' });
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

// Automatically sweep temp files older than 1 hour every 30 minutes
setInterval(() => {
    logger.info('Running background clean sweep for stale temp files...');
    const now = Date.now();
    const ageThresholdMs = 60 * 60 * 1000; // 1 hour
    
    fs.readdir(tempDir, (err, files) => {
        if (err) {
            logger.error('Error reading temp directory during clean sweep', err);
            return;
        }
        
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            fs.stat(filePath, (statErr, stats) => {
                if (statErr) {
                    logger.error(`Error statting file: ${filePath}`, statErr);
                    return;
                }
                
                const fileAgeMs = now - stats.mtimeMs;
                if (fileAgeMs > ageThresholdMs) {
                    fs.unlink(filePath, (unlinkErr) => {
                        if (unlinkErr) {
                            logger.error(`Could not delete stale temp file: ${filePath}`, unlinkErr);
                        } else {
                            logger.info(`Deleted stale temp file: ${file}`);
                        }
                    });
                }
            });
        });
    });
}, 30 * 60 * 1000); // 30 minutes

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

// Helper to calculate total size of temp folder in bytes (cross-platform, non-blocking)
function getTempFolderSize(callback) {
    fs.readdir(tempDir, (err, files) => {
        if (err) return callback(err, 0);
        let totalSize = 0;
        let pending = files.length;
        if (pending === 0) return callback(null, 0);
        
        files.forEach(file => {
            fs.stat(path.join(tempDir, file), (statErr, stats) => {
                if (!statErr) {
                    totalSize += stats.size;
                }
                pending--;
                if (pending === 0) {
                    callback(null, totalSize);
                }
            });
        });
    });
}

// Ping endpoint to verify server is active and check for markitdown package
app.get('/api/health', (req, res) => {
    checkPythonEnvironment((status) => {
        const memory = process.memoryUsage();
        const memoryLimit = 512 * 1024 * 1024; // 512 MB threshold
        const memoryStatus = memory.rss > memoryLimit ? 'high' : 'ok';
        
        getTempFolderSize((err, tempSize) => {
            const tempLimit = 500 * 1024 * 1024; // 500 MB threshold
            const diskStatus = tempSize > tempLimit ? 'full' : 'ok';
            
            const isHealthy = !err && status.hasMarkItDown && memoryStatus === 'ok' && diskStatus === 'ok';
            
            res.json({
                status: isHealthy ? 'ok' : 'warning',
                message: status.message,
                hasMarkItDown: status.hasMarkItDown,
                runMethod: status.runMethod,
                diagnostics: {
                    memory: {
                        rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
                        status: memoryStatus
                    },
                    tempFolder: {
                        size: `${Math.round(tempSize / 1024 / 1024)} MB`,
                        status: diskStatus
                    }
                }
            });
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

// Keys database management helpers
const keysFilePath = path.join(__dirname, 'keys.json');

function readKeys() {
    try {
        if (fs.existsSync(keysFilePath)) {
            const raw = fs.readFileSync(keysFilePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        logger.error('Error reading API keys file', err);
    }
    return {};
}

function writeKeys(keys) {
    try {
        fs.writeFileSync(keysFilePath, JSON.stringify(keys, null, 2), 'utf8');
    } catch (err) {
        logger.error('Error writing API keys file', err);
    }
}

// API Key Validation Middleware
const authenticateApiKey = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized. API key missing or format invalid (Bearer <key>).',
            code: 'UNAUTHORIZED'
        });
    }

    const key = authHeader.substring(7).trim();
    const keys = readKeys();

    if (!keys[key]) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden. Invalid API key.',
            code: 'INVALID_API_KEY'
        });
    }

    req.apiKey = key;
    req.apiUser = keys[key];
    next();
};

// Programmatic optimization API route
app.post('/api/optimize', authenticateApiKey, (req, res) => {
    const { text, level, rules } = req.body;

    if (!text || typeof text !== 'string') {
        return res.status(400).json({
            success: false,
            error: 'Input text is missing or invalid.',
            code: 'INVALID_INPUT_TEXT'
        });
    }

    const activeLevel = parseInt(level) || 3;
    const activeRules = rules || {};

    const inputTokens = countTokens(text);
    const dateStr = new Date().toISOString().split('T')[0];

    const user = req.apiUser;
    
    // Reset daily token usage if date has changed
    if (user.lastUsedDate !== dateStr) {
        user.usedToday = 0;
        user.lastUsedDate = dateStr;
    }

    if (user.usedToday + inputTokens > user.dailyLimit) {
        return res.status(429).json({
            success: false,
            error: `Rate limit exceeded. Plan: ${user.plan}. Daily limit: ${user.dailyLimit} tokens. Used today: ${user.usedToday} tokens. Requested: ${inputTokens} tokens.`,
            code: 'DAILY_LIMIT_EXCEEDED'
        });
    }

    // Process compression
    const compressedText = compressText(text, activeLevel, activeRules);
    const outputTokens = countTokens(compressedText);
    const savedTokens = Math.max(0, inputTokens - outputTokens);
    const savingsPercent = inputTokens > 0 ? Math.round((savedTokens / inputTokens) * 100) : 0;

    // Update usage metrics
    user.usedToday += inputTokens;
    const keys = readKeys();
    keys[req.apiKey] = user;
    writeKeys(keys);

    res.json({
        success: true,
        originalTokens: inputTokens,
        compressedTokens: outputTokens,
        savedTokens,
        savingsPercent,
        compressedText
    });
});

// Config endpoint for client-side environment variables (e.g. GA ID)
app.get('/api/config', (req, res) => {
    res.json({
        gaTrackingId: process.env.GA_TRACKING_ID || 'G-XXXXXXXXXX'
    });
});

// Create Stripe Checkout Session endpoint
app.post('/api/checkout', (req, res) => {
    const { plan } = req.body;
    
    let planName = 'Pro';
    let priceAmount = 1900; // $19.00
    
    if (plan && plan.toLowerCase() === 'enterprise') {
        planName = 'Enterprise';
        priceAmount = 19900; // $199.00
    }

    stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
            price_data: {
                currency: 'usd',
                product_data: {
                    name: `OptiByte ${planName} Plan`,
                    description: `Lossless Prompt Token Compressor API (${planName} tier)`,
                },
                unit_amount: priceAmount,
                recurring: {
                    interval: 'month',
                },
            },
            quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/pricing.html?session_id={CHECKOUT_SESSION_ID}&success=true`,
        cancel_url: `${req.protocol}://${req.get('host')}/pricing.html?success=false`,
        metadata: {
            plan: planName
        }
    }).then(session => {
        res.json({ success: true, url: session.url });
    }).catch(err => {
        logger.error('Error creating Stripe checkout session', err);
        res.status(500).json({ success: false, error: 'Failed to initialize payment gateway.' });
    });
});

// Securely retrieve the newly generated API key after Stripe redirect
app.get('/api/retrieve-key', (req, res) => {
    const { session_id } = req.query;
    if (!session_id) {
        return res.status(400).json({ success: false, error: 'Session ID is required.' });
    }

    const keys = readKeys();
    const match = Object.entries(keys).find(([k, val]) => val.sessionId === session_id);

    if (!match) {
        return res.status(404).json({ success: false, error: 'API key not found for this checkout session.' });
    }

    const [apiKey, data] = match;

    // Clear sessionId reference so the key cannot be fetched again via this endpoint
    data.sessionId = undefined;
    keys[apiKey] = data;
    writeKeys(keys);

    res.json({
        success: true,
        apiKey,
        plan: data.plan,
        dailyLimit: data.dailyLimit
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

        // Build new feedback entry (purely anonymous), sanitizing message to prevent HTML/XSS injection
        const sanitizedMessage = message.trim()
            .substring(0, 5000)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        const newFeedback = {
            rating: parsedRating,
            message: sanitizedMessage,
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

// Endpoint to receive and log client-side JavaScript errors
app.post('/api/log-error', errorLogLimiter, (req, res) => {
    const { message, url, line, column, errorObj, userAgent } = req.body;
    
    logger.error('Client-side JavaScript Error', {
        clientMessage: message,
        clientUrl: url,
        clientLine: line,
        clientColumn: column,
        errorDetails: errorObj,
        userAgent: userAgent || req.headers['user-agent']
    });
    
    res.json({ success: true });
});

// Global error handling middleware (standardizing JSON error responses)
app.use((err, req, res, next) => {
    logger.error('Unhandled request error occurred', err);
    
    // Handle Multer upload errors specifically
    if (err.message === 'Unsupported file type') {
        return res.status(400).json({
            success: false,
            error: 'Unsupported file type. Please upload a valid document format.',
            code: 'INVALID_FILE_TYPE'
        });
    }
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            error: `Upload error: ${err.message}`,
            code: 'UPLOAD_ERROR'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        code: err.code || 'INTERNAL_ERROR'
    });
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
