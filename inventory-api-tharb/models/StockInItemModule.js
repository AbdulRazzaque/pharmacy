const mongoose = require("mongoose");

const stockInItemSchema = new mongoose.Schema(
  {
    stockInHeaderId: { type: mongoose.Types.ObjectId, ref: "StockInHeader", required: true },
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true },
    purchasingPrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    batchNumber: { type: String, default: "" },
    expiry: { type: Date, default: null },
    unit: { type: String, default: "" },
    remarks: { type: String, default: "" }
  },
  { timestamps: true }
);

stockInItemSchema.index({ stockInHeaderId: 1 });
stockInItemSchema.index({ productId: 1 });
stockInItemSchema.index({ expiry: 1 });

const StockInItem = mongoose.model("StockInItem", stockInItemSchema);
module.exports = StockInItem;
