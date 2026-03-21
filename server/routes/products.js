const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { verifyToken } = require('../middleware/auth');

// ============================================
// GET /api/products
// ============================================
router.get('/', async (req, res) => {
    try {
        const { category, search, sortBy, limit = 12, page = 1 } = req.query;

        let query = { status: 'active' };

        // Category filter
        if (category && category !== 'all') {
            query.category = category;
        }

        // Search
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        // Sorting
        let sortOptions = { sales: -1 }; // Default: by sales (relevance)
        if (sortBy === 'price-low') sortOptions = { price: 1 };
        if (sortBy === 'price-high') sortOptions = { price: -1 };
        if (sortBy === 'rating') sortOptions = { 'rating.average': -1 };
        if (sortBy === 'newest') sortOptions = { createdAt: -1 };

        // Pagination
        const skip = (page - 1) * limit;

        // Execute query
        const products = await Product.find(query)
            .sort(sortOptions)
            .limit(parseInt(limit))
            .skip(skip)
            .populate('sellerId', 'seller name');

        const total = await Product.countDocuments(query);

        res.json({
            success: true,
            data: products,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Get products error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch products'
        });
    }
});

// ============================================
// GET /api/products/:id
// ============================================
router.get('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('sellerId', 'name seller')
            .populate('reviews.userId', 'name');

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        res.json({
            success: true,
            data: product
        });
    } catch (error) {
        console.error('❌ Get product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch product'
        });
    }
});

// ============================================
// POST /api/products (Seller only)
// ============================================
router.post('/', verifyToken, async (req, res) => {
    try {
        const { name, description, price, category, stock, images } = req.body;
        const userId = req.user.id;

        // Verify seller
        const user = await require('../models/User').findById(userId);
        if (user.role !== 'seller' || !user.seller.verified) {
            return res.status(403).json({
                success: false,
                message: 'Only verified sellers can add products'
            });
        }

        // Validation
        if (!name || !description || !price || !category || stock === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Create product
        const product = await Product.create({
            name,
            description,
            price,
            category,
            stock,
            images: images || [],
            sellerId: userId
        });

        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        });
    } catch (error) {
        console.error('❌ Create product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create product'
        });
    }
});

// ============================================
// PUT /api/products/:id (Seller only)
// ============================================
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user is the seller
        if (product.sellerId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to update this product'
            });
        }

        // Update allowed fields
        const allowedUpdates = ['name', 'description', 'price', 'category', 'stock', 'images', 'status'];
        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                product[field] = req.body[field];
            }
        });

        await product.save();

        res.json({
            success: true,
            message: 'Product updated successfully',
            data: product
        });
    } catch (error) {
        console.error('❌ Update product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update product'
        });
    }
});

// ============================================
// DELETE /api/products/:id (Seller only)
// ============================================
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Check if user is the seller
        if (product.sellerId.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized to delete this product'
            });
        }

        await Product.deleteOne({ _id: req.params.id });

        res.json({
            success: true,
            message: 'Product deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete product error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete product'
        });
    }
});

// ============================================
// POST /api/products/:id/reviews  –  Add Review
// ============================================
router.post('/:id/reviews', verifyToken, async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const userId = req.user.id;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
        }

        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        // Check if user already reviewed this product
        const existingReview = product.reviews.find(r => String(r.userId) === String(userId));
        if (existingReview) {
            return res.status(400).json({ success: false, message: 'You have already reviewed this product' });
        }

        // Check if user has ordered this product (verified purchase)
        const Order = require('../models/Order');
        const purchasedOrder = await Order.findOne({
            userId,
            'items.productId': product._id,
            status: 'delivered'
        });

        product.reviews.push({
            userId,
            rating,
            comment: comment || '',
            verified: !!purchasedOrder
        });

        // Recalculate average rating
        const total = product.reviews.reduce((sum, r) => sum + r.rating, 0);
        product.rating.average = Math.round((total / product.reviews.length) * 10) / 10;
        product.rating.count = product.reviews.length;

        await product.save();

        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            data: { rating: product.rating, reviews: product.reviews }
        });
    } catch (error) {
        console.error('❌ Add review error:', error);
        res.status(500).json({ success: false, message: 'Failed to add review' });
    }
});

module.exports = router;

