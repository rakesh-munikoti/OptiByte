import Razorpay from 'razorpay';
import crypto from 'crypto';
import { prisma } from '../services/prisma.js';
import { logger } from '../services/logger.js';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'dummy_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

export const createOrder = async (req, res) => {
    try {
        const { plan, userId } = req.body;
        
        let amount = 0;
        let dailyLimit = 5000;

        if (plan === 'pro') {
            amount = 2900; // $29.00 -> 2900 cents
            dailyLimit = 500000;
        } else if (plan === 'enterprise') {
            amount = 19900; // $199.00 -> 19900 cents
            dailyLimit = 10000000;
        } else {
            return res.status(400).json({ success: false, error: 'Invalid plan selected' });
        }

        const options = {
            amount: amount, 
            currency: 'USD', // You can change this to INR if needed
            receipt: `receipt_user_${userId || 'guest'}`,
            notes: {
                plan,
                userId: userId || 'anonymous'
            }
        };

        const order = await razorpay.orders.create(options);
        
        res.json({
            success: true,
            order_id: order.id,
            amount: order.amount,
            currency: order.currency,
            key_id: process.env.RAZORPAY_KEY_ID
        });

    } catch (err) {
        logger.error('Error creating Razorpay order', err);
        res.status(500).json({ success: false, error: 'Failed to create payment order.' });
    }
};

export const verifyWebhook = async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers['x-razorpay-signature'];
    
    // Calculate the signature
    const shasum = crypto.createHmac('sha256', webhookSecret);
    shasum.update(JSON.stringify(req.body));
    const digest = shasum.digest('hex');

    if (digest !== signature) {
        logger.warn('Razorpay webhook signature verification failed');
        return res.status(400).json({ status: 'ignored', reason: 'Invalid signature' });
    }

    const event = req.body;
    
    try {
        // Idempotency check
        const eventId = req.headers['x-razorpay-event-id'];
        if (eventId) {
            const existingEvent = await prisma.webhookEvent.findUnique({
                where: { id: eventId }
            });
            if (existingEvent) {
                logger.info(`Idempotent webhook bypassed: ${eventId}`);
                return res.status(200).send('duplicate_event_bypassed');
            }
        }

        // Process successful payment
        if (event.event === 'payment.captured' || event.event === 'order.paid') {
            // Note: Razorpay payments belong to orders. We can extract notes from the payment entity.
            const paymentEntity = event.payload.payment.entity;
            const notes = paymentEntity.notes || {};
            const plan = notes.plan || 'pro';
            const userId = notes.userId;

            let dailyLimit = 500000;
            if (plan === 'enterprise') {
                dailyLimit = 10000000;
            }

            const { randomUUID } = await import('crypto');
            const newKey = `ob_${randomUUID().replace(/-/g, '')}`;

            if (userId && userId !== 'anonymous') {
                // Update existing user
                await prisma.user.update({
                    where: { id: userId },
                    data: { plan, dailyLimit, apiKey: newKey }
                });
                logger.info(`Razorpay Webhook: Provisioned ${plan} for user ${userId}`);
            } else {
                // Create a guest user based on email if provided
                const email = paymentEntity.email || `guest_${Date.now()}@example.com`;
                
                // check if exists
                let user = await prisma.user.findUnique({ where: { email } });
                if (user) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { plan, dailyLimit, apiKey: newKey }
                    });
                } else {
                    const salt = await import('bcryptjs').then(bcrypt => bcrypt.genSalt(10));
                    const passwordHash = await import('bcryptjs').then(bcrypt => bcrypt.hash('default_razorpay_password', salt));
                    
                    await prisma.user.create({
                        data: {
                            email,
                            passwordHash,
                            plan,
                            dailyLimit,
                            usedToday: 0,
                            lastUsedDate: new Date().toISOString().split('T')[0],
                            apiKey: newKey
                        }
                    });
                }
                logger.info(`Razorpay Webhook: Provisioned ${plan} for new guest email ${email}`);
            }
        }

        // Save idempotency record
        if (eventId) {
            await prisma.webhookEvent.create({
                data: {
                    id: eventId,
                    type: event.event
                }
            });
        }

        res.status(200).send('success');
    } catch (err) {
        logger.error('Razorpay Webhook Error', err);
        // Razorpay expects a 200 response to acknowledge receipt. If you send 500, they will retry.
        res.status(500).send('Webhook Processing Failed');
    }
};

export const retrieveKey = async (req, res) => {
    try {
        let paymentId = req.query.payment_id;
        
        // Guard against HTTP Parameter Pollution (array input)
        if (Array.isArray(paymentId)) {
            paymentId = paymentId[0];
        }
        
        if (!paymentId || typeof paymentId !== 'string') {
            return res.status(400).json({ success: false, error: 'Missing or invalid payment_id' });
        }

        // Strip characters that are not alphanumeric or standard separators
        paymentId = paymentId.replace(/[^a-zA-Z0-9_\-]/g, '');
        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'Invalid payment_id format' });
        }

        // Fetch payment details from Razorpay to get the email or user details
        const payment = await razorpay.payments.fetch(paymentId);
        
        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        const email = payment.email;
        if (!email) {
            return res.status(404).json({ success: false, error: 'No email associated with payment' });
        }

        const user = await prisma.user.findUnique({ where: { email } });
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User provisioning delayed, please refresh.' });
        }

        res.json({
            success: true,
            apiKey: user.apiKey,
            plan: user.plan,
            dailyLimit: user.dailyLimit
        });
    } catch (err) {
        logger.error('Error retrieving key from Razorpay payment', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
