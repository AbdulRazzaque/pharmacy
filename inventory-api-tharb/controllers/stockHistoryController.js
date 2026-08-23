const mongoose = require('mongoose');
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockBalance = require("../models/StockBalanceModule");
const Product = require("../models/ProductModule");
const moment = require("moment");

class StockHistoryController {

    async getStockHistory(req, res) {
        try {
            const { productId } = req.params;
            const product = await Product.findById(productId).select('name companyName type unit').lean();
            if (!product) {
                return res.status(404).send({ msg: "error", error: "Product not found" });
            }

            const transactions = await InventoryTransaction.find({ productId })
                .populate('createdBy', 'userName role')
                .sort({ date: -1, createdAt: -1 })
                .lean();

            const balances = await StockBalance.find({ productId }).lean();
            const currentQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

            return res.status(200).send({
                msg: "success",
                result: {
                    product,
                    currentQuantity,
                    history: transactions,
                    stockInCount: transactions.filter(t => t.transactionType === 'STOCK_IN').length,
                    stockOutCount: transactions.filter(t => t.transactionType === 'STOCK_OUT').length
                }
            });
        } catch (error) {
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    async getExpiryWiseHistory(req, res) {
        try {
            const { productId } = req.params;
            const product = await Product.findById(productId).select('name companyName type unit').lean();
            if (!product) {
                return res.status(404).send({ msg: "error", error: "Product not found" });
            }

            const balances = await StockBalance.find({ productId }).lean();
            const totalQuantity = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);

            const expiryBatches = await Promise.all(balances.map(async (b) => {
                const movements = await InventoryTransaction.find({
                    productId,
                    expiry: b.expiry
                }).populate('createdBy', 'userName role').lean();

                return {
                    expiry: b.expiry,
                    currentQuantity: b.quantity,
                    purchasingPrice: b.purchasingPrice,
                    sellingPrice: b.sellingPrice,
                    batchNumber: b.batchNumber,
                    movements,
                    movementCount: movements.length
                };
            }));

            return res.status(200).send({
                msg: "success",
                result: {
                    product,
                    totalQuantity,
                    expiryBatches
                }
            });
        } catch (error) {
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    async getAllStockMovements(req, res) {
        try {
            const { startDate, endDate, action } = req.query;
            const filter = {};
            if (startDate || endDate) {
                filter.date = {};
                if (startDate) filter.date.$gte = new Date(startDate);
                if (endDate) filter.date.$lte = new Date(endDate);
            }
            if (action) {
                filter.transactionType = action;
            }

            const txns = await InventoryTransaction.find(filter)
                .populate('productId', 'name companyName unit slug')
                .populate('createdBy', 'userName role')
                .sort({ date: -1 })
                .lean();

            const rows = txns.map(t => ({
                productId: t.productId?._id,
                productName: t.productId?.name,
                productSlug: t.productId?.slug,
                companyName: t.productId?.companyName,
                action: t.transactionType,
                quantity: t.quantityDelta,
                previousTotal: t.previousBalance,
                newTotal: t.newBalance,
                expiry: t.expiry,
                batchNumber: t.batchNumber,
                price: t.sellingPrice || t.unitCost || 0,
                transactionType: t.quantityDelta >= 0 ? 'IN' : 'OUT',
                remarks: t.remarks,
                date: t.date,
                docNo: t.docNo,
                performedBy: t.createdBy?.userName,
                performedByRole: t.createdBy?.role
            }));

            return res.status(200).send({
                msg: "success",
                result: rows,
                count: rows.length
            });
        } catch (error) {
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    async getExpiryReport(req, res) {
        try {
            const balances = await StockBalance.find({ quantity: { $gt: 0 } })
                .populate('productId', 'name companyName type unit')
                .lean();

            const report = balances.map(b => {
                const daysToExpiry = b.expiry ? moment(b.expiry).diff(moment(), 'days') : 9999;
                let status = 'good';
                if (daysToExpiry < 0) status = 'expired';
                else if (daysToExpiry <= 30) status = 'expiring-soon';
                else if (daysToExpiry <= 90) status = 'warning';

                return {
                    productId: b.productId?._id,
                    productName: b.productId?.name || 'Unknown',
                    companyName: b.productId?.companyName || '',
                    type: b.productId?.type || '',
                    unit: b.productId?.unit || '',
                    expiry: b.expiry,
                    quantity: b.quantity,
                    purchasingPrice: b.purchasingPrice,
                    sellingPrice: b.sellingPrice,
                    value: b.quantity * (b.purchasingPrice || 0),
                    batchNumber: b.batchNumber,
                    daysToExpiry,
                    status
                };
            });

            report.sort((a, b) => new Date(a.expiry || 0) - new Date(b.expiry || 0));

            return res.status(200).send({
                msg: "success",
                result: report,
                summary: {
                    total: report.length,
                    expired: report.filter(r => r.status === 'expired').length,
                    expiringSoon: report.filter(r => r.status === 'expiring-soon').length,
                    warning: report.filter(r => r.status === 'warning').length,
                    good: report.filter(r => r.status === 'good').length
                }
            });
        } catch (error) {
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    async getBatchMovements(req, res) {
        try {
            const { productId, expiry } = req.body;
            const product = await Product.findById(productId).select('name companyName type').lean();
            if (!product) {
                return res.status(404).send({ msg: "error", error: "Product not found" });
            }

            const expiryDate = new Date(expiry);
            const bal = await StockBalance.findOne({
                productId: mongoose.Types.ObjectId(productId),
                expiry: expiryDate
            }).lean();

            const movements = await InventoryTransaction.find({
                productId,
                expiry: expiryDate
            }).populate('createdBy', 'userName role').lean();

            return res.status(200).send({
                msg: "success",
                result: {
                    product,
                    batch: {
                        expiry: bal?.expiry || expiryDate,
                        currentQuantity: bal?.quantity || 0,
                        purchasingPrice: bal?.purchasingPrice || 0,
                        sellingPrice: bal?.sellingPrice || 0,
                        batchNumber: bal?.batchNumber || '',
                        movements
                    }
                }
            });
        } catch (error) {
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }
}

const stockHistoryController = new StockHistoryController();
module.exports = stockHistoryController;
