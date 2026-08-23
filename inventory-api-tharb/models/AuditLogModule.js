const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  docNo: { type: Number, required: true },
  docType: { type: String, enum: ['StockIn', 'StockOut'], required: true },
  productId: { type: mongoose.Types.ObjectId, ref: 'Product', required: true },
  productName: { type: String, required: true },
  previousValue: { type: mongoose.Schema.Types.Mixed },
  newValue: { type: mongoose.Schema.Types.Mixed },
  updatedBy: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
  updatedByRole: { type: String },
}, { timestamps: true });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
module.exports = AuditLog;
