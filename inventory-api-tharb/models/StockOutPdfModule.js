const mongoose = require("mongoose");

const stockOutPdfItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Types.ObjectId, ref: "Product" },
  productName: { type: String, required: true },
  unit: { type: String, default: "" },
  quantity: { type: Number, required: true },
  sellingPrice: { type: Number, default: 0 }
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
  items: [stockOutPdfItemSchema]
}, { timestamps: true });

const StockOutPdf = mongoose.model("StockOutPdf", stockOutPdfSchema);
module.exports = StockOutPdf;
