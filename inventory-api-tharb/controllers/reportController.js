const mongoose = require('mongoose');
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockBalance = require("../models/StockBalanceModule");
const Product = require("../models/ProductModule");
const Location = require("../models/LocationModule");
const Supplier = require("../models/Supplier.Module");
const StockInHeader = require("../models/StockInHeaderModule");
const StockInItem = require("../models/StockInItemModule");

const parseDateRange = (startDate, endDate, from, to) => {
    let start = null;
    let end = null;

    const sVal = startDate || from;
    const eVal = endDate || to;

    if (sVal) {
        start = new Date(sVal);
        if (!isNaN(start.getTime())) {
            start.setHours(0, 0, 0, 0);
        } else {
            start = null;
        }
    }
    if (eVal) {
        end = new Date(eVal);
        if (!isNaN(end.getTime())) {
            end.setHours(23, 59, 59, 999);
        } else {
            end = null;
        }
    }
    return { start, end };
};

const normalizeObjectIds = (val) => {
    if (!val) return null;
    if (Array.isArray(val)) {
        const valid = val.map(v => String(v)).filter(v => mongoose.Types.ObjectId.isValid(v));
        return valid.length > 0 ? valid.map(v => mongoose.Types.ObjectId(v)) : null;
    }
    const str = String(val);
    return mongoose.Types.ObjectId.isValid(str) ? [mongoose.Types.ObjectId(str)] : null;
};

const reportController = {

    async getMonthlyReport(req, res) {
        try {
            const { month, year, locationId, from, to, startDate, endDate } = req.body || {};
            const filter = { transactionType: 'STOCK_OUT' };

            let start = null;
            let end = null;

            if (year && month) {
                const y = Number(year);
                const m = Number(month);
                if (!isNaN(y) && !isNaN(m)) {
                    start = new Date(y, m - 1, 1, 0, 0, 0, 0);
                    end = new Date(y, m, 0, 23, 59, 59, 999);
                }
            }

            if (!start || !end) {
                const parsed = parseDateRange(startDate, endDate, from, to);
                start = parsed.start;
                end = parsed.end;
            }

            if (start && end) {
                filter.date = { $gte: start, $lte: end };
            }

            const locIds = normalizeObjectIds(locationId);
            if (locIds) {
                filter.locationId = { $in: locIds };
            }

            const txns = await InventoryTransaction.find(filter)
                .populate("productId", "name companyName type unit")
                .populate("locationId", "name doctorName trainerName")
                .populate("createdBy", "userName role")
                .sort({ date: -1, createdAt: -1 })
                .lean();

            const rows = txns.map(t => {
                const qty = Math.abs(t.quantityDelta || 0);
                const rate = Number(t.sellingPrice || t.unitCost || 0);
                const locObj = t.locationId || {};
                return {
                    _id: t._id,
                    docNo: t.docNo,
                    date: t.date || t.createdAt,
                    createdAt: t.createdAt,
                    productId: t.productId,
                    productName: t.productId?.name || '',
                    companyName: t.productId?.companyName || '',
                    unit: t.unit || t.productId?.unit || '',
                    size: t.unit || t.productId?.unit || '',
                    quantity: qty,
                    rate: rate,
                    purchasingPrice: t.unitCost || 0,
                    sellingPrice: rate,
                    totalAmount: qty * rate,
                    total: qty * rate,
                    location: locObj,
                    locationId: String(locObj._id || 'default'),
                    locationName: locObj.name || 'Default Location',
                    doctorName: locObj.doctorName || '',
                    trainerName: locObj.trainerName || '',
                    remarks: t.remarks || ''
                };
            });

            return res.status(200).json({ msg: "success", result: rows });
        } catch (err) {
            console.error("getMonthlyReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getMonthlyIssuedReport(req, res) {
        return reportController.getMonthlyReport(req, res);
    },

    async getStockReport(req, res) {
        try {
            const balances = await StockBalance.find({})
                .populate("productId", "name companyName type unit barcode sku")
                .populate("locationId", "name doctorName trainerName")
                .lean();

            return res.status(200).json({ msg: "success", result: balances });
        } catch (err) {
            console.error("getStockReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockInReport(req, res) {
        try {
            const { from, to, startDate, endDate, supplierId, productId, productIds, docNo } = req.body || {};
            const filter = { transactionType: 'STOCK_IN' };

            const { start, end } = parseDateRange(startDate, endDate, from, to);
            if (start && end) {
                filter.date = { $gte: start, $lte: end };
            } else if (start) {
                filter.date = { $gte: start };
            } else if (end) {
                filter.date = { $lte: end };
            }

            if (docNo !== undefined && docNo !== null && docNo !== '') {
                filter.docNo = Number(docNo);
            }

            const sIds = normalizeObjectIds(supplierId);
            if (sIds) {
                const matchingHeaders = await StockInHeader.find({ supplier: { $in: sIds } }).lean();
                const matchingItems = await StockInItem.find({ supplier: { $in: sIds } }).lean();
                const headerDocNos = matchingHeaders.map(h => Number(h.docNo)).filter(Boolean);
                const itemHeaderIds = matchingItems.map(i => i.stockInHeaderId).filter(Boolean);
                const headersFromItems = await StockInHeader.find({ _id: { $in: itemHeaderIds } }).lean();
                const itemDocNos = headersFromItems.map(h => Number(h.docNo)).filter(Boolean);
                const allDocNos = Array.from(new Set([...headerDocNos, ...itemDocNos]));
                filter.docNo = { $in: allDocNos };
            }

            const pIds = normalizeObjectIds(productIds || productId);
            if (pIds) {
                filter.productId = { $in: pIds };
            }

            const txns = await InventoryTransaction.find(filter)
                .populate("productId", "name companyName unit type")
                .populate("createdBy", "userName role")
                .sort({ date: -1, createdAt: -1 })
                .lean();

            // Fetch StockInHeaders populated with supplier details
            const headers = await StockInHeader.find({})
                .populate("supplier", "name supplierName companyName")
                .lean();

            const supplierMapByDocNo = new Map();
            const supplierMapByHeaderId = new Map();
            headers.forEach(h => {
                if (h.supplier) {
                    if (h.docNo) supplierMapByDocNo.set(Number(h.docNo), h.supplier);
                    supplierMapByHeaderId.set(String(h._id), h.supplier);
                }
            });

            // Fetch StockInItems with populated supplier for item-level details
            const itemIds = txns.map(t => t.referenceId).filter(Boolean);
            const stockInItems = await StockInItem.find({ _id: { $in: itemIds } })
                .populate("supplier", "name supplierName companyName")
                .lean();
            const itemMap = new Map();
            const itemHeaderMap = new Map();
            stockInItems.forEach(item => {
                itemMap.set(String(item._id), item);
                if (item.stockInHeaderId) {
                    itemHeaderMap.set(String(item._id), String(item.stockInHeaderId));
                }
            });

            const rows = txns.map(t => {
                const qty = Math.abs(t.quantityDelta || 0);
                const price = Number(t.unitCost || t.sellingPrice || 0);

                let suppObj = null;
                let supplierDocNo = '';

                if (t.referenceId) {
                    const item = itemMap.get(String(t.referenceId));
                    if (item) {
                        if (item.supplier) suppObj = item.supplier;
                        if (item.supplierDocNo) supplierDocNo = item.supplierDocNo;
                    }
                }

                if (!suppObj && t.docNo) {
                    suppObj = supplierMapByDocNo.get(Number(t.docNo));
                }
                if (!suppObj && t.referenceId) {
                    const hId = itemHeaderMap.get(String(t.referenceId));
                    if (hId) {
                        suppObj = supplierMapByHeaderId.get(hId);
                    }
                }

                const supplierName = suppObj?.name || suppObj?.supplierName || suppObj?.companyName || 'N/A';
                const supplierFormat = suppObj ? { _id: suppObj._id, name: supplierName } : { name: 'N/A' };

                return {
                    _id: t._id,
                    docNo: t.docNo,
                    supplierDocNo: supplierDocNo,
                    date: t.date || t.createdAt,
                    createdAt: t.createdAt,
                    productId: t.productId,
                    name: t.productId?.name || '',
                    productName: t.productId?.name || '',
                    companyName: t.productId?.companyName || '',
                    unit: t.unit || t.productId?.unit || '',
                    quantity: qty,
                    purchasingPrice: price,
                    unitPrice: price,
                    totalAmount: qty * price,
                    total: qty * price,
                    supplier: supplierFormat,
                    supplierName: supplierName,
                    createdBy: t.createdBy?.userName || 'N/A'
                };
            });

            return res.status(200).json({ msg: "success", result: rows });
        } catch (err) {
            console.error("getStockInReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockOutReport(req, res) {
        try {
            const { from, to, startDate, endDate, locationId, productId, productIds, docNo, doctorName } = req.body || {};
            const filter = { transactionType: 'STOCK_OUT' };

            const { start, end } = parseDateRange(startDate, endDate, from, to);
            if (start && end) {
                filter.date = { $gte: start, $lte: end };
            } else if (start) {
                filter.date = { $gte: start };
            } else if (end) {
                filter.date = { $lte: end };
            }

            if (docNo !== undefined && docNo !== null && docNo !== '') {
                filter.docNo = Number(docNo);
            }

            const locIds = normalizeObjectIds(locationId);
            if (locIds) {
                filter.locationId = { $in: locIds };
            }

            const pIds = normalizeObjectIds(productIds || productId);
            if (pIds) {
                filter.productId = { $in: pIds };
            }

            let txns = await InventoryTransaction.find(filter)
                .populate("productId", "name companyName unit type")
                .populate("locationId", "name doctorName trainerName")
                .populate("createdBy", "userName role")
                .sort({ date: -1, createdAt: -1 })
                .lean();

            if (doctorName && doctorName.trim()) {
                const qDoc = doctorName.trim().toLowerCase();
                txns = txns.filter(t => (t.locationId?.doctorName || '').toLowerCase().includes(qDoc) || (t.remarks || '').toLowerCase().includes(qDoc));
            }

            const rows = txns.map(t => {
                const qty = Math.abs(t.quantityDelta || 0);
                const price = Number(t.sellingPrice || t.unitCost || 0);
                const locObj = t.locationId || {};
                return {
                    _id: t._id,
                    docNo: t.docNo,
                    date: t.date || t.createdAt,
                    createdAt: t.createdAt,
                    productId: t.productId,
                    name: t.productId?.name || '',
                    productName: t.productId?.name || '',
                    companyName: t.productId?.companyName || '',
                    unit: t.unit || t.productId?.unit || '',
                    quantity: qty,
                    sellingPrice: price,
                    unitPrice: price,
                    totalAmount: qty * price,
                    total: qty * price,
                    location: locObj,
                    locationId: locObj._id || null,
                    locationName: locObj.name || '',
                    doctorName: locObj.doctorName || '',
                    trainerName: locObj.trainerName || '',
                    createdBy: t.createdBy?.userName || 'N/A'
                };
            });

            return res.status(200).json({ msg: "success", result: rows });
        } catch (err) {
            console.error("getStockOutReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getMonthlySummarizedReport(req, res) {
        try {
            const txns = await InventoryTransaction.aggregate([
                {
                    $group: {
                        _id: {
                            month: { $month: "$date" },
                            year: { $year: "$date" },
                            type: "$transactionType"
                        },
                        totalQuantity: { $sum: "$quantityDelta" },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { "_id.year": -1, "_id.month": -1 } }
            ]);

            return res.status(200).json({ msg: "success", result: txns });
        } catch (err) {
            console.error("getMonthlySummarizedReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getSummaryReport(req, res) {
        try {
            const { startDate, endDate, locationId } = req.body || {};
            const filter = { transactionType: 'STOCK_OUT' };

            const { start, end } = parseDateRange(startDate, endDate);
            if (start && end) {
                filter.date = { $gte: start, $lte: end };
            } else if (start) {
                filter.date = { $gte: start };
            } else if (end) {
                filter.date = { $lte: end };
            }

            const locIds = normalizeObjectIds(locationId);
            if (locIds) {
                filter.locationId = { $in: locIds };
            }

            const txns = await InventoryTransaction.find(filter)
                .populate("productId", "name companyName unit type")
                .populate("locationId", "name doctorName trainerName")
                .sort({ date: -1, createdAt: -1 })
                .lean();

            const locMap = new Map();
            txns.forEach(t => {
                const locObj = t.locationId || {};
                const locKey = String(locObj._id || 'unassigned');
                const locName = locObj.name || 'Unassigned Location';
                const qty = Math.abs(t.quantityDelta || 0);
                const amt = qty * Number(t.sellingPrice || t.unitCost || 0);

                if (!locMap.has(locKey)) {
                    locMap.set(locKey, {
                        _id: locKey,
                        locationId: locKey,
                        locationName: locName,
                        doctorName: locObj.doctorName || '',
                        trainerName: locObj.trainerName || '',
                        totalQuantity: 0,
                        grandTotal: 0
                    });
                }
                const entry = locMap.get(locKey);
                entry.totalQuantity += qty;
                entry.grandTotal += amt;
            });

            const summaryRows = Array.from(locMap.values());
            return res.status(200).json({ msg: "success", result: summaryRows });
        } catch (err) {
            console.error("getSummaryReport error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockAdjustmentHistory(req, res) {
        try {
            const { date: adjustmentDate, docNo, productId } = req.body || {};
            const filter = { transactionType: 'STOCK_ADJUSTMENT' };

            if (docNo !== undefined && docNo !== null && docNo !== '') {
                filter.docNo = Number(docNo);
            }
            if (adjustmentDate) {
                const start = new Date(adjustmentDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(adjustmentDate);
                end.setHours(23, 59, 59, 999);
                filter.date = { $gte: start, $lte: end };
            }

            const pIds = normalizeObjectIds(productId);
            if (pIds) {
                filter.productId = { $in: pIds };
            }

            const txns = await InventoryTransaction.find(filter)
                .populate("productId", "name companyName unit type")
                .populate("locationId", "name doctorName trainerName")
                .populate("createdBy", "userName role")
                .sort({ date: -1, createdAt: -1 })
                .lean();

            const rows = txns.map((t) => ({
                _id: t._id,
                documentId: t.referenceId || t._id,
                itemIndex: 0,
                productId: String(t.productId?._id || t.productId || ''),
                productName: t.productId?.name || '',
                companyName: t.productId?.companyName || '',
                unit: t.productId?.unit || '',
                adjustmentDate: t.date || t.createdAt,
                expiry: t.expiry || null,
                batchNumber: t.batchNumber || '',
                price: t.sellingPrice || t.unitCost || 0,
                adjustedQuantity: t.quantityDelta || 0,
                previousStock: t.previousBalance || 0,
                updatedStock: t.newBalance || 0,
                docNo: t.docNo,
                referenceNumber: t.docNo,
                reason: t.remarks || '',
                note: t.remarks || '',
                userName: t.createdBy?.userName || 'N/A'
            }));

            return res.status(200).json({ msg: "success", result: rows });
        } catch (err) {
            console.error("getStockAdjustmentHistory error:", err);
            return res.status(500).json({ msg: "error", result: err.message });
        }
    }
};

module.exports = reportController;
