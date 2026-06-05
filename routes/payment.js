import express from 'express';
import { createOrder, verifyWebhook, retrieveKey } from '../controllers/paymentController.js';

const router = express.Router();

// Route for creating a Razorpay order before checkout
router.post('/create-order', createOrder);

// Route for fetching the provisioned API Key after successful payment
router.get('/retrieve-key', retrieveKey);

// Razorpay webhook handler
// Note: Razorpay sends standard JSON, so express.json() is fine, but we'll 
// map the webhook securely.
router.post('/webhook', express.json(), verifyWebhook);

export default router;
