const mongoose = require("mongoose");

const stockOutItemSchema = new mongoose.Schema(
  {
    stockOutHeaderId: { type: mongoose.Types.ObjectId, ref: "StockOutHeader", required: true },
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    sellingPrice: { type: Number, default: 0 },
    purchasingPrice: { type: Number, default: 0 },
    expiry: { type: Date, default: null },
    batchNumber: { type: String, default: "" },
    remarks: { type: String, default: "" },
    discountPercentage: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0 },
    itemTotal: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 }
  },
  { timestamps: true }
);

stockOutItemSchema.index({ stockOutHeaderId: 1 });
stockOutItemSchema.index({ productId: 1 });
stockOutItemSchema.index({ expiry: 1 });

const StockOutItem = mongoose.model("StockOutItem", stockOutItemSchema);
module.exports = StockOutItem;
