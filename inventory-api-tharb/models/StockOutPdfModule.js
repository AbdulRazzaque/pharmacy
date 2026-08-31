const mongoose = require("mongoose");

const stockOutPdfItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Types.ObjectId, ref: "Product" },
  productName: { type: String, required: true },
  unit: { type: String, default: "" },
  quantity: { type: Number, required: true },
  sellingPrice: { type: Number, default: 0 },
  discountPercentage: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  itemTotal: { type: Number, default: 0 },
  netTotal: { type: Number, default: 0 }
}, { _id: false });

const stockOutPdfSchema = new mongoose.Schema({
  docNo: { type: Number, required: true },
  date: { type: Date, required: true },
  locationId: { type: mongoose.Types.ObjectId, ref: "Location", required: true },
  locationName: { type: String, required: true },
  trainerName: { type: String, default: "" },
  storeIncharge: { type: String, default: "" },
  takenBy: { type: String, default: "" },
  veterinarian: { type: String, default: "" },
  comments: { type: String, default: "" },
  subTotal: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 },
  items: [stockOutPdfItemSchema]
}, { timestamps: true });

const StockOutPdf = mongoose.model("StockOutPdf", stockOutPdfSchema);
module.exports = StockOutPdf;
