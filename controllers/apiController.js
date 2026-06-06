import { logger } from '../services/logger.js';
import { compressText } from '../services/compressor.js';
import { countTokens } from '../services/tokenizer.js';
import { prisma } from '../services/prisma.js';
import fs from 'fs';

export const optimizeText = async (req, res) => {
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
    await prisma.user.update({
        where: { id: user.id },
        data: {
            usedToday: user.usedToday + inputTokens,
            lastUsedDate: user.lastUsedDate
        }
    });

    res.json({
        success: true,
        originalTokens: inputTokens,
        compressedTokens: outputTokens,
        savedTokens,
        savingsPercent,
        compressedText
    });
};

export const submitFeedback = async (req, res) => {
    const { rating, message } = req.body;

    // Validate inputs
    const parsedRating = parseInt(rating);
    if (!parsedRating || parsedRating < 1 || parsedRating > 5) {
        return res.status(400).json({ success: false, error: 'Invalid rating.' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Message is required.' });
    }

    try {
        // Build new feedback entry (purely anonymous), sanitizing message to prevent HTML/XSS injection
        const sanitizedMessage = message.trim()
            .substring(0, 5000)
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');

        await prisma.feedback.create({
            data: {
                rating: parsedRating,
                message: sanitizedMessage
            }
        });

        logger.info(`Received anonymous feedback`, { rating: parsedRating });
        res.json({ success: true, message: 'Feedback submitted successfully!' });
    } catch (err) {
        logger.error('Error saving feedback', err);
        res.status(500).json({ success: false, error: 'Failed to save feedback on the server.' });
    }
};

export const logClientError = (req, res) => {
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
};

export const getConfig = (req, res) => {
    res.json({
        gaTrackingId: process.env.GA_TRACKING_ID || 'G-XXXXXXXXXX'
    });
};
