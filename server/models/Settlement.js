const mongoose = require('mongoose');
const settlementSchema = new mongoose.Schema({
  settlementId: { type: String, unique: true, required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  period: { startDate: Date, endDate: Date },
  orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
  grossAmount: { type: Number, default: 0 },
  commissionAmount: { type: Number, default: 0 },
  taxOnCommission: { type: Number, default: 0 },
  platformFee: { type: Number, default: 0 },
  tdsDeducted: { type: Number, default: 0 },
  refundDeductions: { type: Number, default: 0 },
  netPayable: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'processing', 'paid', 'frozen', 'disputed'], default: 'pending' },
  payoutMethod: { type: String, enum: ['bank_transfer', 'upi', 'cheque'], default: 'bank_transfer' },
  payoutReference: String,
  payoutDate: Date,
  frozenReason: String,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
settlementSchema.index({ sellerId: 1, status: 1 });
settlementSchema.index({ 'period.startDate': 1, 'period.endDate': 1 });
module.exports = mongoose.model('Settlement', settlementSchema);
