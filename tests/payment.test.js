import { jest } from '@jest/globals';

// Store mocks on globalThis before the hoisted mock factory runs
globalThis.__mockCreateOrder = jest.fn();
globalThis.__mockFetchPayment = jest.fn();

jest.unstable_mockModule('razorpay', () => {
    return {
        default: jest.fn().mockImplementation(() => {
            return {
                orders: {
                    create: globalThis.__mockCreateOrder
                },
                payments: {
                    fetch: globalThis.__mockFetchPayment
                }
            };
        })
    };
});

// Dynamic imports
const { default: Razorpay } = await import('razorpay');
const { default: app } = await import('../server.js');
const { PrismaClient } = await import('@prisma/client');
const { default: request } = await import('supertest');
const { default: crypto } = await import('crypto');

const prisma = new PrismaClient();

describe('Payment API Routes', () => {
    beforeAll(() => {
        process.env.RAZORPAY_KEY_ID = 'test_key_id';
        process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
        process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        // Clean up any test users created by the webhook tests
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: ['test_webhook_guest@example.com', 'test_existing_webhook@example.com']
                }
            }
        });
        await prisma.$disconnect();
        delete globalThis.__mockCreateOrder;
        delete globalThis.__mockFetchPayment;
    });

    describe('POST /api/payment/create-order', () => {
        it('should successfully create an order for pro plan', async () => {
            globalThis.__mockCreateOrder.mockResolvedValue({
                id: 'order_pro_123',
                amount: 2900,
                currency: 'USD'
            });

            const res = await request(app)
                .post('/api/payment/create-order')
                .send({ plan: 'pro', userId: 1 });

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.order_id).toBe('order_pro_123');
            expect(res.body.amount).toBe(2900);
            expect(res.body.currency).toBe('USD');
            expect(res.body.key_id).toBe('test_key_id');
        });

        it('should successfully create an order for enterprise plan', async () => {
            globalThis.__mockCreateOrder.mockResolvedValue({
                id: 'order_ent_456',
                amount: 19900,
                currency: 'USD'
            });

            const res = await request(app)
                .post('/api/payment/create-order')
                .send({ plan: 'enterprise', userId: 2 });

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.order_id).toBe('order_ent_456');
            expect(res.body.amount).toBe(19900);
        });

        it('should return 400 for an invalid plan', async () => {
            const res = await request(app)
                .post('/api/payment/create-order')
                .send({ plan: 'premium', userId: 1 });

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Invalid plan selected');
        });
    });

    describe('POST /api/payment/webhook', () => {
        const getSignature = (bodyStr) => {
            return crypto
                .createHmac('sha256', 'test_webhook_secret')
                .update(bodyStr)
                .digest('hex');
        };

        it('should reject requests with invalid signature', async () => {
            const body = { event: 'payment.captured' };
            const res = await request(app)
                .post('/api/payment/webhook')
                .set('x-razorpay-signature', 'invalid_signature')
                .send(body);

            expect(res.statusCode).toEqual(400);
            expect(res.body.status).toBe('ignored');
            expect(res.body.reason).toBe('Invalid signature');
        });

        it('should process payment.captured event and create new guest user', async () => {
            const body = {
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: 'pay_123',
                            email: 'test_webhook_guest@example.com',
                            notes: {
                                plan: 'pro',
                                userId: 'anonymous'
                            }
                        }
                    }
                }
            };

            const bodyStr = JSON.stringify(body);
            const signature = getSignature(bodyStr);
            const eventId = 'evt_' + Date.now();

            const res = await request(app)
                .post('/api/payment/webhook')
                .set('x-razorpay-signature', signature)
                .set('x-razorpay-event-id', eventId)
                .set('Content-Type', 'application/json')
                .send(bodyStr);

            expect(res.statusCode).toEqual(200);
            expect(res.text).toBe('success');

            // Verify user was created in the database
            const user = await prisma.user.findUnique({
                where: { email: 'test_webhook_guest@example.com' }
            });
            expect(user).toBeTruthy();
            expect(user.plan).toBe('pro');
            expect(user.apiKey).toMatch(/^ob_[a-f0-9]{32}$/);
        });

        it('should prevent duplicate webhook processing via idempotency', async () => {
            const body = {
                event: 'payment.captured',
                payload: {
                    payment: {
                        entity: {
                            id: 'pay_123',
                            email: 'test_webhook_guest@example.com',
                            notes: {
                                plan: 'pro',
                                userId: 'anonymous'
                            }
                        }
                    }
                }
            };

            const bodyStr = JSON.stringify(body);
            const signature = getSignature(bodyStr);
            const eventId = 'evt_duplicate_test';

            // First request
            const res1 = await request(app)
                .post('/api/payment/webhook')
                .set('x-razorpay-signature', signature)
                .set('x-razorpay-event-id', eventId)
                .set('Content-Type', 'application/json')
                .send(bodyStr);
            expect(res1.statusCode).toEqual(200);

            // Second request with same event ID
            const res2 = await request(app)
                .post('/api/payment/webhook')
                .set('x-razorpay-signature', signature)
                .set('x-razorpay-event-id', eventId)
                .set('Content-Type', 'application/json')
                .send(bodyStr);
            
            expect(res2.statusCode).toEqual(200);
            expect(res2.text).toBe('duplicate_event_bypassed');
        });
    });

    describe('GET /api/payment/retrieve-key', () => {
        it('should return error if payment_id is missing', async () => {
            const res = await request(app)
                .get('/api/payment/retrieve-key');

            expect(res.statusCode).toEqual(400);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Missing or invalid payment_id');
        });

        it('should fetch payment details from Razorpay and return the API key', async () => {
            // Setup user
            const email = 'test_existing_webhook@example.com';
            const existingUser = await prisma.user.create({
                data: {
                    email,
                    passwordHash: 'somehash',
                    plan: 'enterprise',
                    dailyLimit: 10000000,
                    apiKey: 'ob_testapikey123456789012345678',
                    usedToday: 0,
                    lastUsedDate: '2026-06-05'
                }
            });

            globalThis.__mockFetchPayment.mockResolvedValue({
                id: 'pay_fetch_123',
                email: email
            });

            const res = await request(app)
                .get('/api/payment/retrieve-key')
                .query({ payment_id: 'pay_fetch_123' });

            expect(res.statusCode).toEqual(200);
            expect(res.body.success).toBe(true);
            expect(res.body.apiKey).toBe('ob_testapikey123456789012345678');
            expect(res.body.plan).toBe('enterprise');
        });
    });
});
