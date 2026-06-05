import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

// API Key Validation Middleware
export const authenticateApiKey = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized. API key missing or format invalid (Bearer <key>).',
            code: 'UNAUTHORIZED'
        });
    }

    const key = authHeader.substring(7).trim();
    const user = await prisma.user.findUnique({ where: { apiKey: key } });

    if (!user) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden. Invalid API key.',
            code: 'INVALID_API_KEY'
        });
    }

    req.apiKey = key;
    req.apiUser = user;
    next();
};

// Standard JWT Validation Middleware
export const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Access token missing or invalid.' });
    }

    const token = authHeader.substring(7).trim();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ success: false, error: 'Invalid or expired token.' });
    }
};
