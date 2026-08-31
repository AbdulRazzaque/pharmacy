const mongoose = require("mongoose");

const stockOutHeaderSchema = new mongoose.Schema(
  {
    docNo: { type: Number, required: true, unique: true },
    location: { type: mongoose.Types.ObjectId, ref: "Location", required: true },
    date: { type: Date, required: true, default: Date.now },
    remarks: { type: String, default: "" },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    createdByRole: { type: String, enum: ['admin', 'user'], default: 'user' },
    subTotal: { type: Number, default: 0 },
    totalDiscount: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
  },
  { timestamps: true }
);

stockOutHeaderSchema.index({ docNo: 1 });
stockOutHeaderSchema.index({ location: 1 });
stockOutHeaderSchema.index({ date: 1 });

const StockOutHeader = mongoose.model("StockOutHeader", stockOutHeaderSchema);
module.exports = StockOutHeader;
