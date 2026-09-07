const mongoose = require('mongoose');
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockAdjustmentHeader = require("../models/StockAdjustmentHeaderModule");
const StockAdjustmentItem = require("../models/StockAdjustmentItemModule");
const Product = require("../models/ProductModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");
const moment = require('moment');

const normalizeExpiry = (expiry) => (expiry ? new Date(expiry) : null);

const getNextAdjustmentDocNo = async (session = null) => {
    let query = StockAdjustmentHeader.findOne({ docNo: { $exists: true, $ne: null } }).sort({ docNo: -1 });
    if (session) query = query.session(session);
    const maxHeader = await query.lean();

    let maxDocNo = 0;
    if (maxHeader && maxHeader.docNo !== undefined && maxHeader.docNo !== null) {
        const num = Number(maxHeader.docNo);
        if (!isNaN(num)) {
            maxDocNo = num;
        }
    }

    const nextDocNo = maxDocNo + 1;

    try {
        await Sequence.findOneAndUpdate(
            { _id: "stockAdjustmentDocument" },
            { $set: { seq: nextDocNo } },
            { upsert: true, session }
        );
    } catch (e) {
        console.error("Error updating Sequence for stockAdjustmentDocument:", e);
    }

    return nextDocNo;
};

const validateAdjustmentItems = async (items, session = null) => {
    const backendErrors = [];

    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const rowNum = i + 1;
        const productId = item.productId ? String(item.productId) : "";
        const delta = Number(item.quantityDelta);
        const requestedExpiry = normalizeExpiry(item.expiry);

        if (!productId) {
            backendErrors.push(`Row ${rowNum}: Product Name is required.`);
            continue;
        }

        if (!delta || delta === 0) {
            backendErrors.push(`Row ${rowNum}: Either Quantity In or Quantity Out is required.`);
        }

        if (item.price !== undefined && item.price !== null && item.price !== '' && Number(item.price) < 0) {
            backendErrors.push(`Row ${rowNum}: Price cannot be negative.`);
        }

        const product = await Product.findById(productId).session(session);
        if (!product) {
            backendErrors.push(`Row ${rowNum}: Product not found.`);
            continue;
        }

        const requiresExpiry = product.requiresExpiry !== false;
        if (requiresExpiry) {
            if (!requestedExpiry || Number.isNaN(requestedExpiry.getTime())) {
                backendErrors.push(`Row ${rowNum}: Expiry Date is required.`);
            }
        }
    }

    if (backendErrors.length > 0) {
        throw new Error(backendErrors.join("\n"));
    }
};

const applySingleAdjustmentLine = async ({ item, reqUser, docNo, note, locationId, session = null }) => {
    const { productId } = item;
    const delta = Number(item.quantityDelta);
    const requestedExpiry = normalizeExpiry(item.expiry);
    const price = item.price !== undefined && item.price !== null && item.price !== '' ? Number(item.price) : 0;
    const batchNumber = item.batchNumber || "";
    const reason = item.reason || note || (delta > 0 ? "Stock adjustment (in)" : "Stock adjustment (out)");

    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error("Product not found for adjustment");

    const filter = {
        productId: mongoose.Types.ObjectId(String(productId)),
        locationId: locationId ? mongoose.Types.ObjectId(String(locationId)) : null,
        batchNumber,
        expiry: requestedExpiry
    };

    let balance = await StockBalance.findOne(filter).session(session);
    const previousBalance = balance ? Number(balance.quantity || 0) : 0;
    const newBalance = previousBalance + delta;

    if (!balance) {
        balance = new StockBalance({
            ...filter,
            quantity: newBalance,
            purchasingPrice: price,
            sellingPrice: price
        });
    } else {
        balance.quantity = newBalance;
        if (price) {
            balance.purchasingPrice = price;
            balance.sellingPrice = price;
        }
    }
    await balance.save(session ? { session } : {});

    return {
        productId,
        productName: product.name,
        expiry: requestedExpiry,
        batchNumber,
        price,
        quantityDelta: delta,
        previousQuantity: previousBalance,
        newQuantity: newBalance,
        runningBalance: newBalance,
        reason
    };
};

class stockAdjustmentController {

    async getStockAdjustmentDocNo(req, res) {
        try {
            const nextDocNo = await getNextAdjustmentDocNo();
            return res.status(200).json({ msg: "success", result: [{ docNo: nextDocNo }] });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }

    async getAdjustmentDocuments(req, res) {
        try {
            const headers = await StockAdjustmentHeader.find()
                .populate("createdBy", "userName role")
                .sort({ docNo: -1 })
                .lean();

            const docs = await Promise.all(headers.map(async (h) => {
                const items = await StockAdjustmentItem.find({ stockAdjustmentId: h._id }).lean();
                let totalQtyAdjusted = 0;
                items.forEach(i => {
                    totalQtyAdjusted += Math.abs(i.quantityDelta || 0);
                });
                return {
                    _id: h._id,
                    docNo: h.docNo,
                    date: h.date,
                    note: h.note || "",
                    createdBy: h.createdBy?.userName || "admin",
                    itemCount: items.length,
                    totalQtyAdjusted
                };
            }));

            return res.status(200).json({ msg: "success", result: docs });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }

    async createAdjustmentDocument(req, res) {
        const executeUpdate = async (session) => {
            const { date, note, items, locationId } = req.body || {};
            if (!Array.isArray(items) || items.length === 0) {
                throw new Error("items are required");
            }

            await validateAdjustmentItems(items, session);

            const parsedDocNo = await getNextAdjustmentDocNo();

            const headerArr = await StockAdjustmentHeader.create(
                [{
                    docNo: parsedDocNo,
                    date: date ? new Date(date) : new Date(),
                    note: note || "",
                    locationId: locationId || null,
                    createdBy: req.user?._id || null,
                    createdByRole: req.user?.role || "user"
                }],
                session ? { session } : {}
            );
            const headerDoc = headerArr[0];

            const batchSize = 500;
            const appliedItems = [];
            const affectedProductIds = new Set();

            for (let i = 0; i < items.length; i += batchSize) {
                const batch = items.slice(i, i + batchSize);

                for (const item of batch) {
                    affectedProductIds.add(String(item.productId));
                    const applied = await applySingleAdjustmentLine({
                        item,
                        reqUser: req.user,
                        docNo: parsedDocNo,
                        note,
                        locationId,
                        session
                    });

                    const adjItem = new StockAdjustmentItem({
                        stockAdjustmentId: headerDoc._id,
                        productId: applied.productId,
                        expiry: applied.expiry,
                        batchNumber: applied.batchNumber,
                        price: applied.price,
                        quantityDelta: applied.quantityDelta,
                        previousQuantity: applied.previousQuantity,
                        newQuantity: applied.newQuantity,
                        runningBalance: applied.runningBalance,
                        reason: applied.reason
                    });
                    await adjItem.save(session ? { session } : {});

                    const txn = new InventoryTransaction({
                        productId: applied.productId,
                        locationId: locationId || null,
                        batchNumber: applied.batchNumber,
                        expiry: applied.expiry,
                        quantityDelta: applied.quantityDelta,
                        previousBalance: applied.previousQuantity,
                        newBalance: applied.newQuantity,
                        unitCost: applied.price,
                        sellingPrice: applied.price,
                        transactionType: "STOCK_ADJUSTMENT",
                        referenceType: "StockAdjustment",
                        referenceId: adjItem._id,
                        docNo: parsedDocNo,
                        createdBy: req.user?._id,
                        date: date ? new Date(date) : new Date(),
                        remarks: applied.reason
                    });
                    await txn.save(session ? { session } : {});

                    appliedItems.push({
                        ...applied,
                        _id: adjItem._id
                    });
                }
            }

            for (const pid of affectedProductIds) {
                await recalculateRunningBalances(pid, session);
            }

            return {
                assignedDocNo: parsedDocNo,
                result: {
                    ...headerDoc.toObject(),
                    items: appliedItems
                }
            };
        };

        try {
            const session = await mongoose.startSession();
            let useTransaction = true;
            try {
                session.startTransaction();
            } catch (e) {
                useTransaction = false;
                session.endSession();
            }

            if (useTransaction) {
                try {
                    const updateRes = await executeUpdate(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({
                        msg: "success",
                        assignedDocNo: updateRes.assignedDocNo,
                        result: updateRes.result
                    });
                } catch (txError) {
                    await session.abortTransaction();
                    session.endSession();

                    const errorMsg = txError.message || '';
                    const isTxUnsupported = errorMsg.includes('replica set') ||
                        errorMsg.includes('Transaction numbers') ||
                        errorMsg.includes('does not support') ||
                        txError.code === 20 ||
                        txError.codeName === 'IllegalOperation';

                    if (isTxUnsupported) {
                        console.warn('⚠️ MongoDB transaction unsupported. Retrying without transaction.');
                        const updateRes = await executeUpdate(null);
                        return res.status(200).json({
                            msg: "success",
                            assignedDocNo: updateRes.assignedDocNo,
                            result: updateRes.result
                        });
                    } else {
                        throw txError;
                    }
                }
            } else {
                const updateRes = await executeUpdate(null);
                return res.status(200).json({
                    msg: "success",
                    assignedDocNo: updateRes.assignedDocNo,
                    result: updateRes.result
                });
            }
        } catch (err) {
            console.error("Bulk stock adjustment failed:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }

    async updateAdjustmentDocument(req, res) {
        const executeUpdate = async (session) => {
            const { docNo, date, note, items, locationId } = req.body || {};
            if (!docNo) throw new Error("Document number (docNo) is required");
            if (!Array.isArray(items)) throw new Error("items must be an array");

            await validateAdjustmentItems(items, session);

            const headerDoc = await StockAdjustmentHeader.findOne({ docNo: Number(docNo) }).session(session);
            if (!headerDoc) throw new Error(`Stock Adjustment Document #${docNo} not found`);

            if (date) headerDoc.date = new Date(date);
            if (note !== undefined) headerDoc.note = note;
            if (locationId !== undefined) headerDoc.locationId = locationId || null;
            await headerDoc.save(session ? { session } : {});

            const existingItems = await StockAdjustmentItem.find({ stockAdjustmentId: headerDoc._id }).session(session);
            const existingItemMap = new Map();
            existingItems.forEach(i => existingItemMap.set(String(i._id), i));

            const payloadItemIds = new Set(items.filter(i => i._id).map(i => String(i._id)));

            const affectedProductIds = new Set();

            // 1. Delete items not present in payload
            for (const [idStr, oldItem] of existingItemMap.entries()) {
                if (!payloadItemIds.has(idStr)) {
                    affectedProductIds.add(String(oldItem.productId));
                    await InventoryTransaction.deleteMany(
                        { referenceType: "StockAdjustment", referenceId: oldItem._id },
                        session ? { session } : {}
                    );
                    await StockAdjustmentItem.deleteOne({ _id: oldItem._id }, session ? { session } : {});
                }
            }

            // 2. Insert or update payload items
            const appliedItems = [];
            for (const item of items) {
                const productId = String(item.productId);
                const delta = Number(item.quantityDelta);
                const requestedExpiry = normalizeExpiry(item.expiry);
                const price = item.price !== undefined && item.price !== null && item.price !== '' ? Number(item.price) : 0;
                const batchNumber = item.batchNumber || "";
                const reason = item.reason || note || (delta > 0 ? "Stock adjustment (in)" : "Stock adjustment (out)");

                affectedProductIds.add(productId);

                let adjItem;
                if (item._id && existingItemMap.has(String(item._id))) {
                    adjItem = existingItemMap.get(String(item._id));
                    adjItem.productId = productId;
                    adjItem.expiry = requestedExpiry;
                    adjItem.batchNumber = batchNumber;
                    adjItem.price = price;
                    adjItem.quantityDelta = delta;
                    adjItem.reason = reason;
                    await adjItem.save(session ? { session } : {});

                    let txn = await InventoryTransaction.findOne({ referenceType: "StockAdjustment", referenceId: adjItem._id }).session(session);
                    if (txn) {
                        txn.productId = productId;
                        txn.locationId = locationId || null;
                        txn.batchNumber = batchNumber;
                        txn.expiry = requestedExpiry;
                        txn.quantityDelta = delta;
                        txn.unitCost = price;
                        txn.sellingPrice = price;
                        txn.date = date ? new Date(date) : headerDoc.date;
                        txn.remarks = reason;
                        await txn.save(session ? { session } : {});
                    } else {
                        txn = new InventoryTransaction({
                            productId,
                            locationId: locationId || null,
                            batchNumber,
                            expiry: requestedExpiry,
                            quantityDelta: delta,
                            previousBalance: 0,
                            newBalance: 0,
                            unitCost: price,
                            sellingPrice: price,
                            transactionType: "STOCK_ADJUSTMENT",
                            referenceType: "StockAdjustment",
                            referenceId: adjItem._id,
                            docNo: headerDoc.docNo,
                            createdBy: req.user?._id,
                            date: date ? new Date(date) : headerDoc.date,
                            remarks: reason
                        });
                        await txn.save(session ? { session } : {});
                    }
                } else {
                    adjItem = new StockAdjustmentItem({
                        stockAdjustmentId: headerDoc._id,
                        productId,
                        expiry: requestedExpiry,
                        batchNumber,
                        price,
                        quantityDelta: delta,
                        previousQuantity: 0,
                        newQuantity: 0,
                        runningBalance: 0,
                        reason
                    });
                    await adjItem.save(session ? { session } : {});

                    const txn = new InventoryTransaction({
                        productId,
                        locationId: locationId || null,
                        batchNumber,
                        expiry: requestedExpiry,
                        quantityDelta: delta,
                        previousBalance: 0,
                        newBalance: 0,
                        unitCost: price,
                        sellingPrice: price,
                        transactionType: "STOCK_ADJUSTMENT",
                        referenceType: "StockAdjustment",
                        referenceId: adjItem._id,
                        docNo: headerDoc.docNo,
                        createdBy: req.user?._id,
                        date: date ? new Date(date) : headerDoc.date,
                        remarks: reason
                    });
                    await txn.save(session ? { session } : {});
                }

                appliedItems.push(adjItem);
            }

            // 3. Recalculate running balances and stock balance for all affected products
            for (const pid of affectedProductIds) {
                await recalculateRunningBalances(pid, session);
            }

            return {
                assignedDocNo: headerDoc.docNo,
                result: {
                    ...headerDoc.toObject(),
                    items: appliedItems
                }
            };
        };

        try {
            const session = await mongoose.startSession();
            let useTransaction = true;
            try {
                session.startTransaction();
            } catch (e) {
                useTransaction = false;
                session.endSession();
            }

            if (useTransaction) {
                try {
                    const updateRes = await executeUpdate(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({
                        msg: "success",
                        assignedDocNo: updateRes.assignedDocNo,
                        result: updateRes.result
                    });
                } catch (txError) {
                    await session.abortTransaction();
                    session.endSession();

                    const errorMsg = txError.message || '';
                    const isTxUnsupported = errorMsg.includes('replica set') ||
                        errorMsg.includes('Transaction numbers') ||
                        errorMsg.includes('does not support') ||
                        txError.code === 20 ||
                        txError.codeName === 'IllegalOperation';

                    if (isTxUnsupported) {
                        console.warn('⚠️ MongoDB transaction unsupported. Retrying without transaction.');
                        const updateRes = await executeUpdate(null);
                        return res.status(200).json({
                            msg: "success",
                            assignedDocNo: updateRes.assignedDocNo,
                            result: updateRes.result
                        });
                    } else {
                        throw txError;
                    }
                }
            } else {
                const updateRes = await executeUpdate(null);
                return res.status(200).json({
                    msg: "success",
                    assignedDocNo: updateRes.assignedDocNo,
                    result: updateRes.result
                });
            }
        } catch (err) {
            console.error("Update stock adjustment document failed:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }

    async createStockAdjustment(req, res) {
        return this.createAdjustmentDocument(req, res);
    }

    async adjustStock(req, res) {
        return this.createAdjustmentDocument(req, res);
    }

    async updateStockInAdjustment(req, res) {
        return res.status(200).json({ msg: "success" });
    }

    async updateStockOutAdjustment(req, res) {
        return res.status(200).json({ msg: "success" });
    }

    async updateAdjustmentItem(req, res) {
        return res.status(200).json({ msg: "success" });
    }

    async getStockAdjustmentByDocNo(req, res) {
        try {
            const { docNo } = req.body || {};
            if (!docNo) return res.status(400).json({ msg: "Bad Request", result: "docNo is required" });

            const header = await StockAdjustmentHeader.findOne({ docNo: Number(docNo) })
                .populate("createdBy", "userName role")
                .populate("locationId", "name doctorName");
            if (!header) return res.status(404).json({ msg: "Not Found", result: "Document not found" });

            const items = await StockAdjustmentItem.find({ stockAdjustmentId: header._id })
                .populate("productId", "name companyName type unit requiresExpiry");

            const doc = {
                _id: header._id,
                docNo: header.docNo,
                date: header.date,
                note: header.note,
                locationId: header.locationId,
                createdBy: header.createdBy,
                createdByRole: header.createdByRole,
                createdAt: header.createdAt,
                updatedAt: header.updatedAt,
                items: items.map(item => ({
                    _id: item._id,
                    productId: item.productId?._id || item.productId,
                    productName: item.productId?.name || item.productName || "",
                    companyName: item.productId?.companyName || "",
                    type: item.productId?.type || "",
                    unit: item.productId?.unit || "",
                    requiresExpiry: item.productId?.requiresExpiry !== false,
                    expiry: item.expiry,
                    batchNumber: item.batchNumber || "",
                    price: item.price || 0,
                    quantityDelta: item.quantityDelta,
                    previousQuantity: item.previousQuantity,
                    newQuantity: item.newQuantity,
                    runningBalance: item.runningBalance,
                    reason: item.reason
                }))
            };

            return res.status(200).json({ msg: "success", result: doc });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }
}

module.exports = new stockAdjustmentController();

