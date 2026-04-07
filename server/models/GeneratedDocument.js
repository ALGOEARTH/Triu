const mongoose = require('mongoose');
const docSchema = new mongoose.Schema({
  documentId: { type: String, unique: true, required: true },
  type: { type: String, enum: ['invoice', 'receipt', 'credit_note', 'debit_note', 'settlement_statement', 'payout_summary', 'booking_confirmation', 'order_confirmation', 'cancellation_receipt', 'refund_receipt', 'commission_statement'], required: true },
  referenceType: { type: String, enum: ['order', 'settlement', 'booking', 'payment', 'refund'] },
  referenceId: mongoose.Schema.Types.ObjectId,
  generatedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  data: mongoose.Schema.Types.Mixed,
  htmlContent: String,
  status: { type: String, enum: ['draft', 'final', 'void'], default: 'final' },
  emailedTo: [String],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });
docSchema.index({ referenceId: 1, type: 1 });
docSchema.index({ generatedFor: 1 });
module.exports = mongoose.model('GeneratedDocument', docSchema);
