import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';
import { logger } from '../services/logger.js';

let redisStore;
if (process.env.REDIS_URL || process.env.NODE_ENV === 'production') {
    const redisClient = createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    redisClient.connect().catch((err) => logger.error('Redis connection error', err));
    
    redisStore = new RedisStore({
        sendCommand: (...args) => redisClient.sendCommand(args),
    });
    logger.info('Redis rate limiting enabled.');
} else {
    logger.info('Redis URL not found. Falling back to memory-based rate limiting.');
}

// Global rate limiting: maximum of 150 requests per 15 minutes per IP
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 150,
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: redisStore,
});

// Specific stricter limit for file conversion: 15 requests per 15 minutes
export const convertLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    message: { success: false, error: 'Too many document conversion attempts. Please try again after 15 minutes.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: redisStore,
});

// Specific limit for submitting feedback: 5 submissions per 15 minutes
export const feedbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { success: false, error: 'Too many feedback submissions. Please try again after 15 minutes.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: redisStore,
});

// Stricter rate limit for error logging endpoint to prevent log flood attacks
export const errorLogLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 50,
    message: { success: false, error: 'Too many errors logged.' },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: redisStore,
});
