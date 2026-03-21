const express = require('express');
const router = express.Router();
const { verifyToken, verifyAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');

// ============================================
// GET /api/admin/dashboard  –  Business Overview
// ============================================
router.get('/dashboard', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const [
            totalUsers,
            totalProducts,
            totalOrders,
            totalSellers,
            pendingSellers,
            revenueAgg,
            recentOrders,
            ordersByStatus,
            topProducts,
            monthlySales
        ] = await Promise.all([
            User.countDocuments({ role: 'customer' }),
            Product.countDocuments({ status: 'active' }),
            Order.countDocuments(),
            User.countDocuments({ role: 'seller' }),
            User.countDocuments({ role: 'seller', 'seller.status': 'pending' }),
            Order.aggregate([
                { $match: { 'payment.status': 'completed' } },
                { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
            ]),
            Order.find()
                .sort({ createdAt: -1 })
                .limit(10)
                .populate('userId', 'name email')
                .lean(),
            Order.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            Product.find({ status: 'active' })
                .sort({ sales: -1 })
                .limit(5)
                .select('name price sales rating category')
                .lean(),
            // Monthly revenue for last 6 months
            Order.aggregate([
                {
                    $match: {
                        createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
                        'payment.status': 'completed'
                    }
                },
                {
                    $group: {
                        _id: {
                            year: { $year: '$createdAt' },
                            month: { $month: '$createdAt' }
                        },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } }
            ])
        ]);

        const revenue = revenueAgg[0]?.total || 0;
        const completedOrders = revenueAgg[0]?.count || 0;

        // Build order status map
        const statusMap = {};
        ordersByStatus.forEach(s => { statusMap[s._id] = s.count; });

        res.json({
            success: true,
            data: {
                overview: {
                    totalUsers,
                    totalProducts,
                    totalOrders,
                    totalSellers,
                    pendingSellers,
                    totalRevenue: revenue,
                    completedOrders,
                    averageOrderValue: completedOrders > 0 ? Math.round(revenue / completedOrders) : 0
                },
                ordersByStatus: statusMap,
                recentOrders,
                topProducts,
                monthlySales
            }
        });
    } catch (error) {
        console.error('❌ Dashboard error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
    }
});

// ============================================
// GET /api/admin/sales  –  Sales Analytics
// ============================================
router.get('/sales', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { period = '30' } = req.query;
        const days = parseInt(period, 10) || 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        const [dailySales, categoryRevenue, paymentMethodBreakdown] = await Promise.all([
            Order.aggregate([
                { $match: { createdAt: { $gte: since }, 'payment.status': 'completed' } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$total' },
                        orders: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: since }, 'payment.status': 'completed' } },
                { $unwind: '$items' },
                {
                    $lookup: {
                        from: 'products',
                        localField: 'items.productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: '$product.category',
                        revenue: { $sum: '$items.total' },
                        units: { $sum: '$items.quantity' }
                    }
                },
                { $sort: { revenue: -1 } }
            ]),
            Order.aggregate([
                { $match: { createdAt: { $gte: since } } },
                { $group: { _id: '$payment.method', count: { $sum: 1 }, total: { $sum: '$total' } } }
            ])
        ]);

        res.json({
            success: true,
            data: { dailySales, categoryRevenue, paymentMethodBreakdown }
        });
    } catch (error) {
        console.error('❌ Sales analytics error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sales data' });
    }
});

// ============================================
// GET /api/admin/orders  –  All Orders (paginated)
// ============================================
router.get('/orders', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { orderId: { $regex: search, $options: 'i' } },
                { customerName: { $regex: search, $options: 'i' } },
                { customerEmail: { $regex: search, $options: 'i' } }
            ];
        }

        const [orders, total] = await Promise.all([
            Order.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('userId', 'name email phone')
                .lean(),
            Order.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: orders,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ Admin orders error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch orders' });
    }
});

// ============================================
// PUT /api/admin/orders/:id/status  –  Update Order Status
// ============================================
router.put('/orders/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, trackingNumber, carrier, trackingUrl, internalNotes } = req.body;
        const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const update = { status };
        if (trackingNumber) {
            update['tracking.number'] = trackingNumber;
            update['tracking.carrier'] = carrier || '';
            update['tracking.url'] = trackingUrl || '';
        }
        if (internalNotes) update.internalNotes = internalNotes;

        const order = await Order.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate('userId', 'name email');

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, message: 'Order status updated', data: order });
    } catch (error) {
        console.error('❌ Update order status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update order' });
    }
});

// ============================================
// GET /api/admin/users  –  CRM: All Users (paginated)
// ============================================
router.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (role) query.role = role;
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const [users, total] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-password -safeKeyHash')
                .lean(),
            User.countDocuments(query)
        ]);

        // Attach order counts per user
        const userIds = users.map(u => u._id);
        const orderCounts = await Order.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 }, spent: { $sum: '$total' } } }
        ]);
        const orderMap = {};
        orderCounts.forEach(o => { orderMap[String(o._id)] = { count: o.count, spent: o.spent }; });
        const enrichedUsers = users.map(u => ({
            ...u,
            orderCount: orderMap[String(u._id)]?.count || 0,
            totalSpent: orderMap[String(u._id)]?.spent || 0
        }));

        res.json({
            success: true,
            data: enrichedUsers,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ Admin users error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch users' });
    }
});

// ============================================
// PUT /api/admin/users/:id/status  –  Update User Status
// ============================================
router.put('/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const user = await User.findByIdAndUpdate(req.params.id, { status }, { new: true })
            .select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        res.json({ success: true, message: 'User status updated', data: user });
    } catch (error) {
        console.error('❌ Update user status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update user' });
    }
});

// ============================================
// GET /api/admin/sellers/pending  –  SRM: Pending Applications
// ============================================
router.get('/sellers/pending', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const sellers = await User.find({
            role: 'seller',
            'seller.status': 'pending'
        }).select('-password -safeKeyHash').lean();

        res.json({ success: true, data: sellers });
    } catch (error) {
        console.error('❌ Get pending sellers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
    }
});

// ============================================
// GET /api/admin/sellers  –  SRM: All Sellers with Stats
// ============================================
router.get('/sellers', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { role: 'seller' };
        if (status) query['seller.status'] = status;

        const [sellers, total] = await Promise.all([
            User.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .select('-password -safeKeyHash')
                .lean(),
            User.countDocuments(query)
        ]);

        // Attach product + order counts per seller
        const sellerIds = sellers.map(s => s._id);
        const [productCounts, orderCounts] = await Promise.all([
            Product.aggregate([
                { $match: { sellerId: { $in: sellerIds } } },
                { $group: { _id: '$sellerId', count: { $sum: 1 } } }
            ]),
            Order.aggregate([
                { $unwind: '$items' },
                { $match: { 'items.sellerId': { $in: sellerIds } } },
                { $group: { _id: '$items.sellerId', orders: { $sum: 1 }, revenue: { $sum: '$items.total' } } }
            ])
        ]);

        const prodMap = {};
        productCounts.forEach(p => { prodMap[String(p._id)] = p.count; });
        const ordMap = {};
        orderCounts.forEach(o => { ordMap[String(o._id)] = { orders: o.orders, revenue: o.revenue }; });

        const enriched = sellers.map(s => ({
            ...s,
            productCount: prodMap[String(s._id)] || 0,
            orderCount: ordMap[String(s._id)]?.orders || 0,
            revenue: ordMap[String(s._id)]?.revenue || 0
        }));

        res.json({
            success: true,
            data: enriched,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ Admin sellers error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sellers' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/approve
// ============================================
router.put('/sellers/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'approved', 'seller.verified': true },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller approved successfully', data: user });
    } catch (error) {
        console.error('❌ Approve seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to approve seller' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/reject
// ============================================
router.put('/sellers/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'rejected' },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller application rejected', data: user });
    } catch (error) {
        console.error('❌ Reject seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to reject seller' });
    }
});

// ============================================
// PUT /api/admin/sellers/:id/suspend
// ============================================
router.put('/sellers/:id/suspend', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 'seller.status': 'suspended', status: 'suspended' },
            { new: true }
        ).select('-password -safeKeyHash');

        if (!user) return res.status(404).json({ success: false, message: 'Seller not found' });

        res.json({ success: true, message: 'Seller suspended', data: user });
    } catch (error) {
        console.error('❌ Suspend seller error:', error);
        res.status(500).json({ success: false, message: 'Failed to suspend seller' });
    }
});

// ============================================
// GET /api/admin/products  –  All Products Management
// ============================================
router.get('/products', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, category, page = 1, limit = 20, search } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (status) query.status = status;
        if (category) query.category = category;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        const [products, total] = await Promise.all([
            Product.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .populate('sellerId', 'name seller.businessName')
                .lean(),
            Product.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: products,
            pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) }
        });
    } catch (error) {
        console.error('❌ Admin products error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch products' });
    }
});

// ============================================
// PUT /api/admin/products/:id/status  –  Activate/Deactivate Product
// ============================================
router.put('/products/:id/status', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'inactive', 'archived'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const product = await Product.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        res.json({ success: true, message: 'Product status updated', data: product });
    } catch (error) {
        console.error('❌ Admin product status error:', error);
        res.status(500).json({ success: false, message: 'Failed to update product' });
    }
});

// ============================================
// GET /api/admin/reports/refunds  –  Refund Management
// ============================================
router.get('/reports/refunds', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const refunds = await Order.find({ 'refund.status': { $ne: 'none' } })
            .sort({ updatedAt: -1 })
            .populate('userId', 'name email phone')
            .lean();

        res.json({ success: true, data: refunds });
    } catch (error) {
        console.error('❌ Refunds report error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch refunds' });
    }
});

// ============================================
// PUT /api/admin/orders/:id/refund  –  Process Refund
// ============================================
router.put('/orders/:id/refund', verifyToken, verifyAdmin, async (req, res) => {
    try {
        const { status, amount, reason } = req.body;
        if (!['approved', 'processed'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid refund status' });
        }

        const order = await Order.findByIdAndUpdate(
            req.params.id,
            {
                'refund.status': status,
                'refund.amount': amount,
                'refund.reason': reason,
                'refund.processedAt': status === 'processed' ? new Date() : undefined
            },
            { new: true }
        ).populate('userId', 'name email');

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        res.json({ success: true, message: 'Refund updated', data: order });
    } catch (error) {
        console.error('❌ Process refund error:', error);
        res.status(500).json({ success: false, message: 'Failed to process refund' });
    }
});

module.exports = router;
