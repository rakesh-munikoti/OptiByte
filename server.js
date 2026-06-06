import 'dotenv/config';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

// Initialize Sentry before anything else
Sentry.init({
  dsn: process.env.SENTRY_DSN || '',
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0, 
  profilesSampleRate: 1.0,
});

import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import compression from 'compression';
import { exec } from 'child_process';

import { logger } from './services/logger.js';
import { globalLimiter } from './middlewares/rateLimiters.js';
import { checkPythonEnvironment } from './services/pythonService.js';
import passport from 'passport';
import apiRoutes from './routes/api.js';
import authRoutes from './routes/auth.js';
import googleAuthRoutes from './routes/googleAuth.js';
import paymentRoutes from './routes/payment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = __dirname;

const app = express();
app.disable('x-powered-by');
const PORT = process.env.PORT || 3000;

// Enable trust proxy for express-rate-limit behind reverse proxies (Render)
app.set('trust proxy', 1);

// Enable compression
app.use(compression());

// Support JSON bodies globally (DoS protection limit set to 1MB)
app.use(express.json({ limit: '1mb' }));

// Initialize Passport (no sessions — JWT-only)
app.use(passport.initialize());

// Mount Payment routes (Razorpay)
app.use('/api/payment', paymentRoutes);

// Mount general Auth routes
app.use('/api/auth', authRoutes);

// Mount Google OAuth routes
app.use('/api/auth', googleAuthRoutes);

// CORS Lockdown: allow specific origins in production
const allowedOrigin = process.env.NODE_ENV === 'production'
    ? 'https://optibyte-ypd6.onrender.com'
    : '*';

app.use(cors({
    origin: allowedOrigin,
    methods: ['GET', 'POST'],
}));

// Configure Helmet with secure CSP that allows required external CDNs, Google Analytics, Razorpay, and Google OAuth
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    "https://cdnjs.cloudflare.com",
                    "https://unpkg.com",
                    "https://www.googletagmanager.com",
                    "https://checkout.razorpay.com",
                    "https://accounts.google.com"
                ],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                connectSrc: [
                    "'self'",
                    "https://unpkg.com",
                    "https://www.google-analytics.com",
                    "https://region1.google-analytics.com",
                    "https://api.razorpay.com",
                    "https://accounts.google.com",
                    "https://oauth2.googleapis.com"
                ],
                imgSrc: [
                    "'self'",
                    "data:",
                    "blob:",
                    "https://www.google-analytics.com",
                    "https://www.googletagmanager.com",
                    "https://checkout.razorpay.com",
                    "https://lh3.googleusercontent.com"
                ],
                frameSrc: [
                    "'self'",
                    "https://api.razorpay.com",
                    "https://checkout.razorpay.com",
                    "https://accounts.google.com"
                ]
            }
        }
    })
);

// Redirect HTTP to HTTPS in production & enforce HSTS
app.use((req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
        return res.redirect(`https://${req.hostname}${req.url}`);
    }
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }
    next();
});

// Apply global rate limiter
if (globalLimiter) {
    app.use(globalLimiter);
}

// Block access to sensitive server-side files and directories, allowing shared browser services
app.use((req, res, next) => {
    const blockedFiles = ['/server.js', '/package.json', '/package-lock.json', '/test.js', '/dockerfile'];
    const blockedDirs = ['/temp', '/node_modules', '/controllers', '/routes', '/services', '/middlewares', '/prisma'];
    const urlLower = req.path.toLowerCase();
    const isSharedBrowserService = urlLower === '/services/tokenizer.js' || urlLower === '/services/compressor.js';

    if (
        blockedFiles.includes(urlLower) || 
        (blockedDirs.some(dir => urlLower.startsWith(dir)) && !isSharedBrowserService) ||
        urlLower.includes('.git') ||
        urlLower.includes('.env') ||
        urlLower.endsWith('.db') ||
        urlLower.endsWith('.sqlite') ||
        (urlLower.endsWith('.json') && urlLower !== '/manifest.json')
    ) {
        return res.status(403).json({ success: false, error: 'Access Denied', code: 'ACCESS_DENIED' });
    }
    next();
});

// Serve frontend static files
app.use(express.static(__dirname));

// Set up temporary upload directory
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Automatically sweep temp files older than 1 hour every 30 minutes
if (process.env.NODE_ENV !== 'test') {
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
                    if (statErr) return;
                    
                    if (now - stats.mtimeMs > ageThresholdMs) {
                        fs.unlink(filePath, (unlinkErr) => {
                            if (unlinkErr) {
                                logger.error(`Failed to delete stale file: ${filePath}`, unlinkErr);
                            } else {
                                logger.info(`Clean sweep deleted stale file: ${filePath}`);
                            }
                        });
                    }
                });
            });
        });
    }, 30 * 60 * 1000);
}

// Mount main API routes
app.use('/api', apiRoutes);

// Trigger Python check on startup
checkPythonEnvironment().catch(err => logger.error('Failed to run initial Python environment check', err));

// Health check endpoint
app.get('/api/health', (req, res) => {
    checkPythonEnvironment().then((status) => {
        const memory = process.memoryUsage();
        res.json({
            status: status.hasMarkItDown ? 'ok' : 'warning',
            message: status.message,
            memory: {
                rss: `${Math.round(memory.rss / 1024 / 1024)} MB`
            }
        });
    }).catch((err) => {
        logger.error('Health check dynamic environment resolution failed', err);
        res.status(500).json({ status: 'error', message: err.message });
    });
});

// Sentry Express error handler
Sentry.setupExpressErrorHandler(app);

// Global error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled request error occurred', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error',
        code: err.code || 'INTERNAL_ERROR'
    });
});

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        logger.info(`OptiByte Backend starting up on port ${PORT}...`);
    });
}

export default app;
