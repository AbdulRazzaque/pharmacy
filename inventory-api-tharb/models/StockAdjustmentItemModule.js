const mongoose = require("mongoose");

const stockAdjustmentItemSchema = new mongoose.Schema(
  {
    stockAdjustmentId: { type: mongoose.Types.ObjectId, ref: "StockAdjustmentHeader", required: true },
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    expiry: { type: Date, default: null },
    batchNumber: { type: String, default: "" },
    price: { type: Number, default: 0 },
    quantityDelta: { type: Number, required: true }, // +in, -out
    previousQuantity: { type: Number, default: 0 },
    newQuantity: { type: Number, default: 0 },
    runningBalance: { type: Number, default: 0 },
    stockId: { type: mongoose.Types.ObjectId, ref: "Stock" },
    reason: { type: String, default: "" }
  },
  { timestamps: true }
);

// Indexes for fast lookups and reporting
stockAdjustmentItemSchema.index({ stockAdjustmentId: 1 });
stockAdjustmentItemSchema.index({ productId: 1 });
stockAdjustmentItemSchema.index({ stockId: 1 });
stockAdjustmentItemSchema.index({ expiry: 1 });

const StockAdjustmentItem = mongoose.model(
  "StockAdjustmentItem",
  stockAdjustmentItemSchema
);

module.exports = StockAdjustmentItem;
