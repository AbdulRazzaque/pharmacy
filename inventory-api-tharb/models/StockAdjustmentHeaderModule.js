const mongoose = require("mongoose");

const stockAdjustmentHeaderSchema = new mongoose.Schema(
  {
    docNo: { type: Number, required: true, unique: true },
    date: { type: Date, default: Date.now },
    note: { type: String, default: "" },
    locationId: { type: mongoose.Types.ObjectId, ref: "Location" },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    createdByRole: { type: String, enum: ["admin", "user"], default: "user" }
  },
  { timestamps: true }
);

// Indexes
stockAdjustmentHeaderSchema.index({ locationId: 1 });
stockAdjustmentHeaderSchema.index({ docNo: 1 });

const StockAdjustmentHeader = mongoose.model(
  "StockAdjustmentHeader",
  stockAdjustmentHeaderSchema
);

module.exports = StockAdjustmentHeader;
