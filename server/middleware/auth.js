const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ============================================
// Verify JWT Token
// ============================================
const verifyToken = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('role seller status');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.status !== 'active') {
            return res.status(403).json({
                success: false,
                message: 'Your account is not active'
            });
        }

        req.user = {
            id: decoded.userId,
            role: user.role,
            seller: user.seller
        };
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// ============================================
// Verify Admin Role
// ============================================
const verifyAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Admin access required'
        });
    }
    next();
};

// ============================================
// Verify Seller Role
// ============================================
const verifySeller = (req, res, next) => {
    if (req.user.role !== 'seller' || !req.user.seller?.verified) {
        return res.status(403).json({
            success: false,
            message: 'Verified seller access required'
        });
    }
    next();
};

module.exports = { verifyToken, verifyAdmin, verifySeller };
