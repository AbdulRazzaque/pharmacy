const mongoose = require("mongoose");

const sellingPriceHistorySchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    companyName: { type: String, default: "" },
    oldSellingPrice: { type: Number, required: true },
    newSellingPrice: { type: Number, required: true },
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
