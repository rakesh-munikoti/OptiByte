import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../server.js';

const prisma = new PrismaClient();

describe('Auth API Routes', () => {
    const testUser = {
        email: `test_${Date.now()}@example.com`,
        password: 'password123'
    };

    afterAll(async () => {
        // Cleanup test user
        await prisma.user.deleteMany({
            where: { email: testUser.email }
        });
        await prisma.$disconnect();
    });

    it('should register a new user successfully', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        expect(res.statusCode).toEqual(201);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toBeDefined();
        expect(res.body.user.email).toBe(testUser.email);
        expect(res.body.user.plan).toBe('Free');
    });

    it('should fail to register with the same email', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send(testUser);

        expect(res.statusCode).toEqual(409);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('Email already registered.');
    });

    it('should login successfully with correct credentials', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send(testUser);

        expect(res.statusCode).toEqual(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.email).toBe(testUser.email);
    });

    it('should fail to login with incorrect password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: testUser.email,
                password: 'wrongpassword'
            });

        expect(res.statusCode).toEqual(401);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('Invalid email or password.');
    });
});
