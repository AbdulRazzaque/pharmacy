const mongoose = require("mongoose");

const stockBalanceSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    locationId: { type: mongoose.Types.ObjectId, ref: "Location" },
    batchNumber: { type: String, default: "" },
    expiry: { type: Date, default: null },
    quantity: { type: Number, default: 0 },
    purchasingPrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 }
  },
  { timestamps: true }
);

// Indexes
stockBalanceSchema.index({ productId: 1, locationId: 1, batchNumber: 1, expiry: 1 });
stockBalanceSchema.index({ productId: 1 });
stockBalanceSchema.index({ locationId: 1 });
stockBalanceSchema.index({ expiry: 1 });

const StockBalance = mongoose.model("StockBalance", stockBalanceSchema);
module.exports = StockBalance;
