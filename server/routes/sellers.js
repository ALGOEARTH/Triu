const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { verifyToken, verifySeller } = require('../middleware/auth');

// ============================================
// POST /api/sellers/apply
// ============================================
router.post('/apply', verifyToken, async (req, res) => {
    try {
        const { businessName, description, businessType, gstNumber, panNumber } = req.body;
        const userId = req.user.id;

        // Validation
        if (!businessName || !description) {
            return res.status(400).json({
                success: false,
                message: 'Business name and description are required'
            });
        }

        const user = await User.findById(userId);

        // Check if already a seller
        if (user.role === 'seller') {
            return res.status(400).json({
                success: false,
                message: 'You are already a seller'
            });
        }

        // Update user with seller info
        user.role = 'seller';
        user.seller = {
            businessName,
            description,
            businessType,
            gstNumber,
            panNumber,
            status: 'pending',
            verified: false
        };

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Seller application submitted successfully',
            data: user.toJSON()
        });
    } catch (error) {
        console.error('❌ Seller apply error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit application'
        });
    }
});

// ============================================
// GET /api/sellers/dashboard  –  Seller Dashboard Stats
// ============================================
router.get('/dashboard', verifyToken, verifySeller, async (req, res) => {
    try {
        const sellerId = req.user.id;
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const [
            totalProducts,
            activeProducts,
            productIds,
            recentOrderItems,
            monthlySales
        ] = await Promise.all([
            Product.countDocuments({ sellerId }),
            Product.countDocuments({ sellerId, status: 'active' }),
            Product.find({ sellerId }).select('_id').lean(),
            Order.find({
                'items.sellerId': sellerId,
                createdAt: { $gte: since30d }
            }).select('items status total createdAt').lean(),
            Order.aggregate([
                { $match: { 'items.sellerId': sellerId, 'payment.status': 'completed' } },
                { $unwind: '$items' },
                { $match: { 'items.sellerId': sellerId } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                        revenue: { $sum: '$items.total' },
                        units: { $sum: '$items.quantity' }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 6 }
            ])
        ]);

        // Compute seller-specific totals from orders
        let totalRevenue = 0;
        let totalOrders = 0;
        let pendingOrders = 0;

        recentOrderItems.forEach(order => {
            const sellerItems = order.items.filter(
                i => String(i.sellerId) === String(sellerId)
            );
            if (sellerItems.length > 0) {
                totalOrders++;
                totalRevenue += sellerItems.reduce((sum, i) => sum + (i.total || 0), 0);
                if (['pending', 'confirmed', 'processing'].includes(order.status)) {
                    pendingOrders++;
                }
            }
        });

        // Low stock products
        const lowStockProducts = await Product.find({
            sellerId,
            stock: { $lt: 10 },
            status: 'active'
        }).select('name stock price').lean();

        res.json({
            success: true,
            data: {
                overview: {
                    totalProducts,
                    activeProducts,
                    totalRevenue,
                    totalOrders,
                    pendingOrders
                },
                monthlySales,
                lowStockProducts
            }
        });
    } catch (error) {
        console.error('❌ Seller dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch seller dashboard' });
    }
});

// ============================================
// GET /api/sellers/orders  –  Seller's Orders
// ============================================
router.get('/orders', verifyToken, verifySeller, async (req, res) => {
    try {
        const sellerId = req.user.id;
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { 'items.sellerId': sellerId };
        if (status) query.status = status;

        const [orders, total] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email phone')
                .lean(),
            Order.countDocuments(query)
        ]);

        // Filter items to only show seller's own items
        const sellerOrders = orders.map(order => ({
            ...order,
            items: order.items.filter(i => String(i.sellerId) === String(sellerId))
        }));

        res.json({
            success: true,
            data: sellerOrders,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ Seller orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch seller orders' });
    }
});

// ============================================
// PUT /api/sellers/orders/:id/status  –  Update Order Item Status
// ============================================
router.put('/orders/:id/status', verifyToken, verifySeller, async (req, res) => {
    try {
        const { status, trackingNumber, carrier } = req.body;
        const validStatuses = ['confirmed', 'processing', 'shipped', 'delivered'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status for seller' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        // Verify this seller has items in the order
        const hasItems = order.items.some(i => String(i.sellerId) === String(req.user.id));
        if (!hasItems) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        order.status = status;
        if (trackingNumber) {
            order.tracking = { number: trackingNumber, carrier: carrier || '' };
        }
        await order.save();

        res.json({ success: true, message: 'Order status updated', data: order });
    } catch (error) {
        console.error('❌ Seller update order error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    }
});

// ============================================
// GET /api/sellers
// ============================================
router.get('/', async (req, res) => {
    try {
        const { status = 'approved' } = req.query;

        const sellers = await User.find({
            role: 'seller',
            'seller.status': status
        }).select('name seller email phone');

        res.json({
            success: true,
            data: sellers
        });
    } catch (error) {
        console.error('❌ Get sellers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch sellers'
        });
    }
});

// ============================================
// GET /api/sellers/:id
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const seller = await User.findById(req.params.id).select('name seller email phone');

        if (!seller || seller.role !== 'seller') {
            return res.status(404).json({
                success: false,
                message: 'Seller not found'
            });
        }

        res.json({
            success: true,
            data: seller
        });
    } catch (error) {
        console.error('❌ Get seller error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch seller'
        });
    }
});

// ============================================
// GET /api/sellers/:id/products
// ============================================
router.get('/:id/products', async (req, res) => {
    try {
        const products = await Product.find({
            sellerId: req.params.id,
            status: 'active'
        });

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        console.error('❌ Get seller products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch seller products'
        });
    }
});

module.exports = router;
