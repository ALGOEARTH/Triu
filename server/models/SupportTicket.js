const mongoose = require('mongoose');
const ticketSchema = new mongoose.Schema({
  ticketId: { type: String, unique: true, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  category: { type: String, enum: ['order_issue', 'payment', 'refund', 'account', 'listing', 'other'], default: 'other' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'waiting_user', 'resolved', 'closed'], default: 'open' },
  subject: { type: String, required: true },
  description: String,
  messages: [{
    sender: { type: String, enum: ['user', 'admin', 'system'] },
    content: String,
    sentAt: { type: Date, default: Date.now },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  resolution: String,
  resolvedAt: Date,
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  internalNotes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
ticketSchema.index({ userId: 1, status: 1 });
ticketSchema.index({ status: 1, priority: 1 });
module.exports = mongoose.model('SupportTicket', ticketSchema);
