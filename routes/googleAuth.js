import express from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import { prisma } from '../services/prisma.js';
import { logger } from '../services/logger.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Base callback URL — works both locally and on Render
const BASE_URL = process.env.NODE_ENV === 'production'
    ? 'https://optibyte-ypd6.onrender.com'
    : 'http://localhost:3000';

// Only configure Google strategy if credentials are provided
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: `${BASE_URL}/api/auth/google/callback`,
            scope: ['profile', 'email']
        },
        async (_accessToken, _refreshToken, profile, done) => {
            try {
                const email = profile.emails?.[0]?.value;
                if (!email) {
                    return done(new Error('No email returned from Google'), null);
                }

                // Find or create the user
                let user = await prisma.user.findUnique({ where: { email } });

                if (user) {
                    // If registered via password but not linked to Google, link now
                    if (!user.googleId) {
                        user = await prisma.user.update({
                            where: { email },
                            data: { googleId: profile.id }
                        });
                    }
                } else {
                    // New user via Google — generate API key and create record
                    const { randomUUID } = await import('crypto');
                    const newKey = `ob_${randomUUID().replace(/-/g, '')}`;

                    user = await prisma.user.create({
                        data: {
                            email,
                            googleId: profile.id,
                            plan: 'Free',
                            dailyLimit: 5000,
                            usedToday: 0,
                            lastUsedDate: new Date().toISOString().split('T')[0],
                            apiKey: newKey
                        }
                    });

                    logger.info('New user registered via Google OAuth', { email });
                }

                return done(null, user);
            } catch (err) {
                logger.error('Google OAuth strategy error', err);
                return done(err, null);
            }
        }
    ));

    // Serialize/deserialize minimal user info into session (we use JWTs so this is minimal)
    passport.serializeUser((user, done) => done(null, user.id));
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await prisma.user.findUnique({ where: { id } });
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    });
}

// GET /api/auth/google — redirect to Google consent screen
router.get('/google', (req, res, next) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return res.status(503).json({
            success: false,
            error: 'Google OAuth is not configured on this server.'
        });
    }
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })(req, res, next);
});

// GET /api/auth/google/callback — Google redirects here after consent
router.get('/google/callback',
    (req, res, next) => {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
            return res.redirect('/login.html?error=google_not_configured');
        }
        passport.authenticate('google', {
            session: false,
            failureRedirect: '/login.html?error=google_failed'
        })(req, res, next);
    },
    (req, res) => {
        try {
            const user = req.user;
            const token = jwt.sign(
                { id: user.id, email: user.email, plan: user.plan },
                JWT_SECRET,
                { expiresIn: '7d' }
            );

            // Redirect to a success page that stores the token and redirects to dashboard
            res.redirect(`/auth-callback.html?token=${encodeURIComponent(token)}`);
        } catch (err) {
            logger.error('Google OAuth callback error', err);
            res.redirect('/login.html?error=google_failed');
        }
    }
);

export default router;
