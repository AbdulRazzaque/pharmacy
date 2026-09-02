const mongoose = require("mongoose");

const sellingPriceHistorySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    companyName: { type: String, default: "" },
    expiryDate: { type: Date, default: null },
    oldSellingPrice: { type: Number, required: true },
    newSellingPrice: { type: Number, required: true },
    source: { type: String, default: "Selling Price Update" },
    updatedBy: { type: mongoose.Types.ObjectId, ref: "User" },
    updatedByName: { type: String, default: "Admin" },
    updatedByRole: { type: String, default: "admin" }
  },
  { timestamps: true }
);

// Indexes
sellingPriceHistorySchema.index({ productId: 1, createdAt: -1 });

const SellingPriceHistory = mongoose.model("SellingPriceHistory", sellingPriceHistorySchema);
module.exports = SellingPriceHistory;
