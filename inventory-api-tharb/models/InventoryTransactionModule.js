const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Types.ObjectId, ref: "Product", required: true },
    locationId: { type: mongoose.Types.ObjectId, ref: "Location" },
    batchNumber: { type: String, default: "" },
    expiry: { type: Date, default: null },
    quantityDelta: { type: Number, required: true },
    previousBalance: { type: Number, default: 0 },
    newBalance: { type: Number, default: 0 },
    unitCost: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },
    transactionType: {
      type: String,
      enum: [
        'STOCK_IN', 'STOCK_OUT', 'STOCK_ADJUSTMENT', 'STOCK_TRANSFER',
        'SALES', 'PURCHASE', 'RETURN_IN', 'RETURN_OUT', 'DAMAGE',
        'EXPIRED', 'OPENING_STOCK'
      ],
      required: true
    },
    referenceType: { type: String, default: "" },
    referenceId: { type: mongoose.Types.ObjectId },
    docNo: { type: Number },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    date: { type: Date, default: Date.now },
    remarks: { type: String, default: "" }
  },
  { timestamps: true }
);

// Indexes
inventoryTransactionSchema.index({ productId: 1 });
inventoryTransactionSchema.index({ locationId: 1 });
inventoryTransactionSchema.index({ expiry: 1 });
inventoryTransactionSchema.index({ batchNumber: 1 });
inventoryTransactionSchema.index({ referenceId: 1 });
inventoryTransactionSchema.index({ docNo: 1 });
inventoryTransactionSchema.index({ transactionType: 1 });
inventoryTransactionSchema.index({ createdAt: 1 });
inventoryTransactionSchema.index({ date: 1 });

const InventoryTransaction = mongoose.model("InventoryTransaction", inventoryTransactionSchema);
module.exports = InventoryTransaction;
