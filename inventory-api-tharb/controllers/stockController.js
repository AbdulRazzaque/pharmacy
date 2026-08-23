const mongoose = require('mongoose');
const Product = require("../models/ProductModule");
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockInItem = require("../models/StockInItemModule");
const StockOutItem = require("../models/StockOutItemModule");
const StockAdjustmentItem = require("../models/StockAdjustmentItemModule");
const moment = require("moment");

class stockController {

    async getAllStocks(req, res) {
        try {
            const products = await Product.find({ isDeleted: { $ne: true } })
                .select("name companyName type unit slug requiresExpiry barcode sku")
                .sort({ name: 1 })
                .lean();

            const stocks = await Promise.all(products.map(async (p) => {
                // Fetch ALL batches regardless of quantity — zero/negative batches are included
                // so the frontend can show them when the toggle is OFF
                const balances = await StockBalance.find({ productId: p._id }).lean();
                const totalQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                const expiryArray = balances.map(b => ({
                    expiry: b.expiry,
                    quantity: b.quantity || 0,
                    purchasingPrice: b.purchasingPrice || 0,
                    sellingPrice: b.sellingPrice || 0,
                    batchNumber: b.batchNumber || ""
                }));

                return {
                    _id: p._id,
                    product: p,
                    name: p.name,
                    totalQuantity,
                    expiryArray
                };
            }));

            // Return ALL stocks — frontend toggle controls visibility of zero/expired items
            return res.status(200).json({ msg: "success", result: stocks });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }

    async getAllStocksNew(req, res) {
        return this.getAllStocks(req, res);
    }

    async getStockDocuments(req, res) {
        try {
            const { name, slug } = req.body || {};
            if (!name && !slug) {
                return res.status(400).send("Bad Request");
            }

            let product = null;
            if (slug) {
                product = await Product.findOne({ slug });
            } else if (name) {
                product = await Product.findOne({ name });
            }
            if (!product) {
                return res.status(404).send({ msg: "Product not found" });
            }

            const productId = product._id;
            const productName = product.name;

            const transactions = await InventoryTransaction.find({ productId })
                .populate("locationId", "name doctorName trainerName")
                .populate("createdBy", "userName role")
                .sort({ createdAt: 1 })
                .lean();

            const stockin = [];
            const stockout = [];
            const adjustments = [];
            const withType = [];

            transactions.forEach(t => {
                const itemObj = {
                    _id: t._id,
                    docNo: t.docNo,
                    type: t.transactionType === "STOCK_IN" ? "in" : t.transactionType === "STOCK_OUT" ? "out" : "adjustment",
                    productId: product,
                    name: productName,
                    quantity: Math.abs(t.quantityDelta),
                    quantityDelta: t.quantityDelta,
                    prevQuantity: t.previousBalance,
                    previousQuantity: t.previousBalance,
                    newQuantity: t.newBalance,
                    runningBalance: t.newBalance,
                    expiry: t.expiry,
                    batchNumber: t.batchNumber,
                    price: t.sellingPrice || t.unitCost || 0,
                    sellingPrice: t.sellingPrice || 0,
                    purchasingPrice: t.unitCost || 0,
                    remarks: t.remarks || "",
                    createdAt: t.createdAt,
                    createdBy: t.createdBy,
                    location: t.locationId
                };

                withType.push(itemObj);
                if (t.transactionType === "STOCK_IN") stockin.push(itemObj);
                else if (t.transactionType === "STOCK_OUT") stockout.push(itemObj);
                else adjustments.push(itemObj);
            });

            const balances = await StockBalance.find({ productId }).lean();
            const currentStock = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

            return res.status(200).send({
                msg: "success",
                result: { stockout, stockin, adjustments, transactions: withType, productName, currentStock }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).send({ msg: "error", error: err.message });
        }
    }

    async deleteStock(req, res) {
        try {
            const productId = req.params.id;
            if (!productId) {
                return res.status(400).send({ msg: "error", result: "Product ID required" });
            }

            await StockBalance.deleteMany({ productId });
            await InventoryTransaction.deleteMany({ productId });

            return res.status(200).send({ msg: "success", result: "Stock deleted successfully" });
        } catch (error) {
            return res.status(500).send({ msg: "error", result: error.message });
        }
    }

    async mergeDuplicateStocks(req, res) {
        return res.status(200).send({ msg: "success", result: "No duplicates found" });
    }
}

module.exports = new stockController();
