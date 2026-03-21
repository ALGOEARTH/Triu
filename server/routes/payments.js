const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyToken } = require('../middleware/auth');
const Order = require('../models/Order');

// Lazily initialise Razorpay only when keys are configured
const getRazorpay = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        return null;
    }
    const Razorpay = require('razorpay');
    return new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET
    });
};

// ============================================
// POST /api/payments/razorpay/create
// ============================================
router.post('/razorpay/create', verifyToken, async (req, res) => {
    try {
        const razorpay = getRazorpay();
        if (!razorpay) {
            return res.status(503).json({ success: false, message: 'Razorpay is not configured' });
        }

        const { orderId, amount } = req.body;

        const options = {
            amount: amount * 100, // Convert to paise
            currency: 'INR',
            receipt: orderId,
            payment_capture: 1
        };

        const razorpayOrder = await razorpay.orders.create(options);

        res.json({
            success: true,
            data: razorpayOrder
        });
    } catch (error) {
        console.error('❌ Razorpay order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order'
        });
    }
});

// ============================================
// POST /api/payments/razorpay/verify
// ============================================
router.post('/razorpay/verify', verifyToken, async (req, res) => {
    try {
        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(503).json({ success: false, message: 'Razorpay is not configured' });
        }

        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

        // Verify signature
        const body = razorpay_order_id + '|' + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: 'Payment signature verification failed'
            });
        }

        // Update order payment status
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        order.payment.razorpayPaymentId = razorpay_payment_id;
        order.payment.razorpayOrderId = razorpay_order_id;
        order.payment.status = 'completed';
        order.status = 'confirmed';
        await order.save();

        res.json({
            success: true,
            message: 'Payment verified successfully',
            data: order
        });
    } catch (error) {
        console.error('❌ Payment verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
});

module.exports = router;
