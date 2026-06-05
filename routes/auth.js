import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { logger } from '../services/logger.js';

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

// JWT Generation helper
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, email: user.email, plan: user.plan },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};

// Register Route
router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!email || typeof email !== 'string' || !emailRegex.test(email.trim()) || !password || password.length < 6) {
            return res.status(400).json({ success: false, error: 'Valid email and password (min 6 chars) required.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        // Check existing user
        const existingUser = await prisma.user.findUnique({ where: { email: sanitizedEmail } });
        if (existingUser) {
            return res.status(409).json({ success: false, error: 'Email already registered.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Generate default API key for new free user
        const { randomUUID } = await import('crypto');
        const newKey = `ob_${randomUUID().replace(/-/g, '')}`;

        // Create user
        const newUser = await prisma.user.create({
            data: {
                email: sanitizedEmail,
                passwordHash,
                plan: 'Free',
                dailyLimit: 5000,
                usedToday: 0,
                lastUsedDate: new Date().toISOString().split('T')[0],
                apiKey: newKey
            }
        });

        const token = generateToken(newUser);
        
        logger.info('New user registered', { email: newUser.email });
        
        res.status(201).json({
            success: true,
            token,
            user: { id: newUser.id, email: newUser.email, plan: newUser.plan, apiKey: newUser.apiKey }
        });
    } catch (err) {
        logger.error('Registration error', err);
        res.status(500).json({ success: false, error: 'Server error during registration.' });
    }
});

// Login Route
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || typeof email !== 'string' || !password) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const sanitizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({ where: { email: sanitizedEmail } });
        if (!user || !user.passwordHash) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, error: 'Invalid email or password.' });
        }

        const token = generateToken(user);
        
        res.json({
            success: true,
            token,
            user: { id: user.id, email: user.email, plan: user.plan, apiKey: user.apiKey }
        });
    } catch (err) {
        logger.error('Login error', err);
        res.status(500).json({ success: false, error: 'Server error during login.' });
    }
});

// Auth Middleware (can be exported and used in server.js or used here)
export const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).json({ success: false, error: 'Token expired or invalid.', code: 'INVALID_TOKEN' });
            }
            req.user = decoded;
            next();
        });
    } else {
        res.status(401).json({ success: false, error: 'Authentication token required.', code: 'UNAUTHORIZED' });
    }
};

// Get current user profile and stats
router.get('/me', authenticateJWT, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: { email: true, plan: true, dailyLimit: true, usedToday: true, apiKey: true, lastUsedDate: true }
        });
        
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        
        res.json({ success: true, user });
    } catch (err) {
        logger.error('Error fetching user profile', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

export default router;
