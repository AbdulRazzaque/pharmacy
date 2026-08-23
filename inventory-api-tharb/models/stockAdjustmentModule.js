// models/StockAdjustment.js
const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  productId: mongoose.Types.ObjectId,
  stockId: mongoose.Types.ObjectId,

  previousQuantity: Number,
  newQuantity: Number,
  difference: Number,

  source: {
    type: String,
    enum: ["INVENTORY", "SYSTEM"],
    default: "INVENTORY"
  },

  reason: String,
  createdBy: mongoose.Types.ObjectId
}, { timestamps: true });

module.exports = mongoose.model("StockAdjustment", schema);
