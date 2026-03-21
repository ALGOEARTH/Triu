const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
    {
        orderId: {
            type: String,
            unique: true,
            required: true
        },
        
        // Customer Info
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        customerName: String,
        customerEmail: String,
        customerPhone: String,
        
        // Items
        items: [{
            productId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
                required: true
            },
            sellerId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            name: String,
            price: Number,
            quantity: { type: Number, min: 1 },
            image: String,
            total: Number
        }],
        
        // Totals
        subtotal: {
            type: Number,
            required: true,
            min: 0
        },
        tax: {
            type: Number,
            default: 0,
            min: 0
        },
        shipping: {
            type: Number,
            default: 50,
            min: 0
        },
        discount: {
            type: Number,
            default: 0,
            min: 0
        },
        total: {
            type: Number,
            required: true,
            min: 0
        },
        
        // Delivery Address
        deliveryAddress: {
            street: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            postalCode: { type: String, required: true },
            country: { type: String, default: 'India' }
        },
        
        // Payment
        payment: {
            method: {
                type: String,
                enum: ['COD', 'UPI', 'Card', 'Razorpay'],
                default: 'COD'
            },
            status: {
                type: String,
                enum: ['pending', 'completed', 'failed', 'refunded'],
                default: 'pending'
            },
            razorpayPaymentId: String,
            razorpayOrderId: String,
            transactionId: String
        },
        
        // Order Status
        status: {
            type: String,
            enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'],
            default: 'pending'
        },
        
        // Shipment Tracking
        tracking: {
            number: String,
            carrier: String,
            url: String,
            estimatedDelivery: Date
        },
        
        // Notes
        notes: String,
        internalNotes: String,
        
        // Refund (if applicable)
        refund: {
            status: {
                type: String,
                enum: ['none', 'requested', 'approved', 'processed'],
                default: 'none'
            },
            reason: String,
            amount: Number,
            processedAt: Date
        },
        
        // Dates
        createdAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    { timestamps: true }
);

// Index for queries
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = mongoose.model('Order', orderSchema);
