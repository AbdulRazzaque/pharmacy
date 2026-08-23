const mongoose = require("mongoose");

const stockInHeaderSchema = new mongoose.Schema(
  {
    docNo: { type: Number, required: true, unique: true },
    supplierDocNo: { type: String, default: "" },
    supplier: { type: mongoose.Types.ObjectId, ref: "Supplier" },
    date: { type: Date, required: true, default: Date.now },
    remarks: { type: String, default: "" },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    createdByRole: { type: String, enum: ['admin', 'user'], default: 'user' }
  },
  { timestamps: true }
);

stockInHeaderSchema.index({ docNo: 1 });
stockInHeaderSchema.index({ supplier: 1 });
stockInHeaderSchema.index({ date: 1 });

const StockInHeader = mongoose.model("StockInHeader", stockInHeaderSchema);
module.exports = StockInHeader;
