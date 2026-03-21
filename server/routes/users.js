const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const { verifyToken } = require('../middleware/auth');

// ============================================
// GET /api/users/profile
// ============================================
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        res.json({
            success: true,
            data: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile'
        });
    }
});

// ============================================
// PUT /api/users/profile
// ============================================
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { name, phone, address, notifications } = req.body;
        const updateFields = {};
        if (name !== undefined) updateFields.name = name;
        if (phone !== undefined) updateFields.phone = phone;
        if (address !== undefined) updateFields.address = address;
        if (notifications !== undefined) updateFields.notifications = notifications;

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateFields,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

// ============================================
// PUT /api/users/password  –  Change Password
// ============================================
router.put('/password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Both current and new passwords are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }

        const user = await User.findById(req.user.id).select('+password');
        const isValid = await user.matchPassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        user.password = newPassword;
        await user.save();

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('❌ Change password error:', error);
        res.status(500).json({ success: false, message: 'Failed to change password' });
    }
});

// ============================================
// GET /api/users/wishlist
// ============================================
router.get('/wishlist', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).populate('wishlist');

        res.json({
            success: true,
            data: user.wishlist
        });
    } catch (error) {
        console.error('❌ Get wishlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch wishlist'
        });
    }
});

// ============================================
// POST /api/users/wishlist/:productId  –  Toggle Wishlist
// ============================================
router.post('/wishlist/:productId', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const productId = req.params.productId;
        const idx = user.wishlist.findIndex(id => id.toString() === productId);
        let action;

        if (idx !== -1) {
            user.wishlist.splice(idx, 1);
            action = 'removed';
        } else {
            user.wishlist.push(productId);
            action = 'added';
        }

        await user.save();

        res.json({
            success: true,
            message: `Product ${action} ${action === 'added' ? 'to' : 'from'} wishlist`,
            data: user.wishlist,
            action
        });
    } catch (error) {
        console.error('❌ Wishlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update wishlist'
        });
    }
});

// ============================================
// GET /api/users/orders  –  User's Order History
// ============================================
router.get('/orders', verifyToken, async (req, res) => {
    try {
        const { status, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { userId: req.user.id };
        if (status) query.status = status;

        const [orders, total] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('items.productId', 'name thumbnail')
                .lean(),
            Order.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ User orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// ============================================
// POST /api/users/orders/:id/return  –  Request Return
// ============================================
router.post('/orders/:id/return', verifyToken, async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) {
            return res.status(400).json({ success: false, message: 'Return reason is required' });
        }

        const order = await Order.findOne({ _id: req.params.id, userId: req.user.id });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        if (order.status !== 'delivered') {
            return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
        }

        order.refund = { status: 'requested', reason, amount: order.total };
        order.status = 'returned';
        await order.save();

        res.json({ success: true, message: 'Return request submitted', data: order });
    } catch (error) {
        console.error('❌ Return request error:', error);
        res.status(500).json({ success: false, message: 'Failed to submit return request' });
    }
});

module.exports = router;
