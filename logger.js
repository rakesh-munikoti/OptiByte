/**
 * OptiByte Production-Grade Logger (logger.js)
 * 
 * Provides structured JSON logging in production for easy parsing by platforms like Render, Sentry, or Logtail.
 * Falls back to clean, colorized-looking text logging in development.
 */

const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';

export const logger = {
    info(message, meta = {}) {
        log('info', message, meta);
    },
    
    warn(message, meta = {}) {
        log('warn', message, meta);
    },
    
    error(message, errorOrMeta = {}) {
        let meta = {};
        if (errorOrMeta instanceof Error) {
            meta = {
                errorMessage: errorOrMeta.message,
                stack: errorOrMeta.stack
            };
        } else {
            meta = errorOrMeta;
        }
        log('error', message, meta);
    }
};

function log(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    
    if (isProd) {
        // Structured JSON log for production log aggregators
        const logEntry = {
            timestamp,
            level,
            message,
            ...meta
        };
        console.log(JSON.stringify(logEntry));
    } else {
        // Clean, readable log for local console
        const colorMap = {
            info: '\x1b[36mINFO\x1b[0m',  // Cyan
            warn: '\x1b[33mWARN\x1b[0m',  // Yellow
            error: '\x1b[31mERROR\x1b[0m' // Red
        };
        const levelLabel = colorMap[level] || level.toUpperCase();
        const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
        console.log(`[${timestamp}] [${levelLabel}] ${message}${metaStr}`);
    }
}

// Global Exception Handlers
process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception thrown', err);
    // Graceful shutdown in production
    if (isProd) {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
    });
});
