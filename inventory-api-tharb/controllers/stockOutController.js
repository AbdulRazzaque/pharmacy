const mongoose = require('mongoose');
const moment = require("moment");
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockOutHeader = require("../models/StockOutHeaderModule");
const StockOutItem = require("../models/StockOutItemModule");
const Product = require("../models/ProductModule");
const Location = require("../models/LocationModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");
const { findMatchingStockBalance, normalizeExpiryDate, buildStockBalanceFilter } = require("../utils/stockBalanceHelper");

const peekNextStockOutDocNo = async (session = null) => {
    let query = StockOutHeader.findOne({ docNo: { $exists: true, $ne: null } }).sort({ docNo: -1 }).select('docNo');
    if (session) query = query.session(session);
    const maxHeader = await query.lean();

    let maxDocNo = 0;
    if (maxHeader && maxHeader.docNo !== undefined && maxHeader.docNo !== null) {
        const num = Number(maxHeader.docNo);
        if (Number.isFinite(num)) {
            maxDocNo = num;
        }
    }

    return maxDocNo + 1;
};
const getNextStockOutDocNo = peekNextStockOutDocNo;

const updateHeaderTotals = async (headerId, session = null) => {
    if (!headerId) return;
    const header = await StockOutHeader.findById(headerId).session(session);
    if (!header) return;
    const items = await StockOutItem.find({ stockOutHeaderId: header._id }).session(session);
    const subTotal = items.reduce((sum, i) => sum + (i.itemTotal !== undefined && i.itemTotal !== null ? Number(i.itemTotal) : ((i.quantity || 0) * (i.sellingPrice || 0))), 0);
    const totalDiscount = items.reduce((sum, i) => sum + (Number(i.discountAmount) || 0), 0);
    const grandTotal = items.reduce((sum, i) => sum + (i.netTotal !== undefined && i.netTotal !== null ? Number(i.netTotal) : ((i.quantity || 0) * (i.sellingPrice || 0) - (Number(i.discountAmount) || 0))), 0);
    header.subTotal = Math.round(subTotal * 100) / 100;
    header.totalDiscount = Math.round(totalDiscount * 100) / 100;
    header.grandTotal = Math.round(grandTotal * 100) / 100;
    await header.save(session ? { session } : {});
};

const getAuthoritativeStock = async (productId, session = null) => {
    if (!productId) return { totalAvailable: 0, balances: [] };
    const pId = new mongoose.Types.ObjectId(String(productId));
    const balances = await StockBalance.find({
        productId: pId,
        quantity: { $gt: 0 }
    }).sort({ expiry: 1, createdAt: 1 }).session(session);

    const totalAvailable = balances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
    return {
        totalAvailable,
        balances
    };
};

const stockOutController = {

    async getStockOutDocNo(req, res) {
        try {
            const nextDocNo = await getNextStockOutDocNo();
            return res.status(200).json({ msg: "success", result: [{ docNo: nextDocNo }] });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async createStockOut(req, res) {
        const executeCreate = async (session) => {
            const body = req.body || {};

            let items = [];
            if (Array.isArray(body.items) && body.items.length > 0) {
                items = body.items.filter(i => !i.isDeleted);
            } else if (Array.isArray(body.updates) && body.updates.length > 0) {
                items = body.updates.filter(i => !i.isDeleted);
            } else if (body.productId || body.stockId) {
                items = [{
                    productId: body.productId || body.stockId,
                    quantity: body.quantity,
                    sellingPrice: body.sellingPrice,
                    discountPercentage: body.discountPercentage !== undefined ? body.discountPercentage : 0,
                    remarks: body.remarks || body.doctorName || body.trainerName || "",
                    doctorName: body.doctorName || "",
                    trainerName: body.trainerName || "",
                    expiry: body.expiry,
                    batchNumber: body.batchNumber
                }];
            }

            const location = body.location ||
                body.locationId ||
                items.find(i => i.locationId || i.location)?.locationId ||
                items.find(i => i.locationId || i.location)?.location;

            const date = body.date ? new Date(body.date) : new Date();
            const remarks = body.remarks || body.doctorName || body.trainerName || "";

            if (!location) {
                const err = new Error('Receiving location is required');
                err.statusCode = 400;
                throw err;
            }

            if (items.length === 0) {
                const err = new Error('At least one item is required to dispense');
                err.statusCode = 400;
                throw err;
            }

            // ═════════════════════════════════════════════════════════════════
            // PHASE 1: VALIDATE ALL (READ-ONLY, ZERO MUTATIONS)
            // ═════════════════════════════════════════════════════════════════

            // 1.1 Field validation for every line item
            for (let idx = 0; idx < items.length; idx++) {
                const item = items[idx];
                const targetProductId = item.productId || item.stockId;
                const rawQty = item.quantity;
                const requestedQty = Number(rawQty);

                if (
                    !targetProductId ||
                    rawQty === null ||
                    rawQty === undefined ||
                    rawQty === '' ||
                    !Number.isFinite(requestedQty) ||
                    !Number.isInteger(requestedQty) ||
                    requestedQty <= 0
                ) {
                    const err = new Error(`Item #${idx + 1}: Quantity must be a positive integer greater than zero`);
                    err.statusCode = 400;
                    throw err;
                }

                const rawDisc = item.discountPercentage !== undefined ? item.discountPercentage : (body.discountPercentage !== undefined ? body.discountPercentage : 0);
                const itemDiscPct = Number(rawDisc || 0);
                if (isNaN(itemDiscPct) || itemDiscPct < 0 || itemDiscPct > 100) {
                    const err = new Error(`Item #${idx + 1}: Invalid discount percentage (${rawDisc})`);
                    err.statusCode = 400;
                    throw err;
                }
            }

            // 1.2 Group requested quantities by product AND by stockBalanceId
            const productTotalRequested = new Map();
            const batchTotalRequested = new Map();

            for (const item of items) {
                const pId = String(item.productId || item.stockId);
                const qty = Number(item.quantity);
                productTotalRequested.set(pId, (productTotalRequested.get(pId) || 0) + qty);

                if (item.stockBalanceId) {
                    const sbKey = String(item.stockBalanceId);
                    batchTotalRequested.set(sbKey, (batchTotalRequested.get(sbKey) || 0) + qty);
                }
            }

            // 1.3 Validate product existence and available stock for all products
            const productDocMap = new Map();
            for (const [pId, totalRequested] of productTotalRequested.entries()) {
                if (!mongoose.Types.ObjectId.isValid(pId)) {
                    const err = new Error(`Invalid Product ID: ${pId}`);
                    err.statusCode = 400;
                    throw err;
                }

                const productDoc = await Product.findById(pId).session(session);
                if (!productDoc || productDoc.isDeleted) {
                    const err = new Error(`Product not found or inactive for ID: ${pId}`);
                    err.statusCode = 404;
                    throw err;
                }
                productDocMap.set(pId, productDoc);

                const { totalAvailable } = await getAuthoritativeStock(pId, session);
                if (totalAvailable < totalRequested) {
                    const err = new Error(`Insufficient stock for "${productDoc.name}". Requested: ${totalRequested}, Available: ${totalAvailable}`);
                    err.statusCode = 409;
                    err.code = 'INSUFFICIENT_STOCK';
                    err.availableQuantity = totalAvailable;
                    err.requestedQuantity = totalRequested;
                    err.productName = productDoc.name;
                    err.productId = pId;
                    throw err;
                }
            }

            // 1.4 Validate batch-specific stock availability if stockBalanceId is provided
            for (const item of items) {
                if (item.stockBalanceId) {
                    if (!mongoose.Types.ObjectId.isValid(item.stockBalanceId)) {
                        const err = new Error(`Invalid StockBalance ID: ${item.stockBalanceId}`);
                        err.statusCode = 400;
                        throw err;
                    }
                    const pId = String(item.productId || item.stockId);
                    const productDoc = productDocMap.get(pId);
                    let bal = await StockBalance.findOne({
                        _id: item.stockBalanceId,
                        productId: new mongoose.Types.ObjectId(pId)
                    }).session(session);

                    if (!bal && item.expiry) {
                        bal = await findMatchingStockBalance(pId, item.expiry, item.batchNumber, null, session);
                    }

                    if (!bal) {
                        const err = new Error(`Selected stock batch not found for "${productDoc?.name || pId}"`);
                        err.statusCode = 404;
                        throw err;
                    }

                    const requestedForBatch = batchTotalRequested.get(String(item.stockBalanceId)) || Number(item.quantity);

                    // Check total available for this specific batch identity (in case of split location records)
                    const normExp = normalizeExpiryDate(bal.expiry || item.expiry);
                    const cleanBatch = (bal.batchNumber || item.batchNumber || "").trim();
                    const batchBalances = await StockBalance.find(buildStockBalanceFilter(pId, normExp, cleanBatch)).session(session);
                    const batchAvailable = batchBalances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

                    if (batchAvailable < requestedForBatch) {
                        const err = new Error(`Insufficient stock for "${productDoc?.name || 'Product'}" batch (Expiry: ${bal.expiry ? moment(bal.expiry).format('DD/MM/YYYY') : 'None'}). Requested: ${requestedForBatch}, Available: ${batchAvailable}`);
                        err.statusCode = 409;
                        err.code = 'INSUFFICIENT_STOCK';
                        err.availableQuantity = batchAvailable;
                        err.requestedQuantity = requestedForBatch;
                        err.productName = productDoc?.name;
                        err.productId = pId;
                        err.stockBalanceId = String(bal._id);
                        throw err;
                    }
                }
            }

            // ═════════════════════════════════════════════════════════════════
            // PHASE 2: WRITE DATA (ATOMIC TRANSACTION)
            // ═════════════════════════════════════════════════════════════════
            // All items and all products passed Phase 1 validation.
            // Now create header, deduct stock, create line items and transactions.

            const isAppend = body.isExistingDoc === true || body.append === true;
            let header = null;
            let parsedDocNo = null;

            if (isAppend) {
                const targetDocNo = Number(body.docNo);
                if (!targetDocNo || isNaN(targetDocNo)) {
                    const err = new Error('Valid document number is required when appending to an existing document');
                    err.statusCode = 400;
                    throw err;
                }
                header = await StockOutHeader.findOne({ docNo: targetDocNo }).session(session);
                if (!header) {
                    const err = new Error(`Stock Out document #${targetDocNo} not found`);
                    err.statusCode = 404;
                    throw err;
                }
                parsedDocNo = header.docNo;
                if (remarks && !header.remarks) {
                    header.remarks = remarks;
                    if (session) await header.save({ session });
                    else await StockOutHeader.findByIdAndUpdate(header._id, { remarks });
                }
            } else {
                // Creating a NEW Stock Out document with atomic concurrency protection
                let attempts = 0;
                const maxAttempts = 10;
                while (!header && attempts < maxAttempts) {
                    attempts++;

                    // Authoritative lookup: highest committed docNo in StockOutHeader
                    const latestHeader = await StockOutHeader.findOne({ docNo: { $exists: true, $ne: null } })
                        .sort({ docNo: -1 })
                        .select('docNo')
                        .session(session)
                        .lean();

                    let candidateDocNo = 1;
                    if (latestHeader && latestHeader.docNo !== undefined && latestHeader.docNo !== null) {
                        const num = Number(latestHeader.docNo);
                        if (Number.isFinite(num)) {
                            candidateDocNo = num + 1;
                        }
                    }

                    try {
                        const headerArr = await StockOutHeader.create(
                            [{
                                docNo: candidateDocNo,
                                location,
                                date,
                                remarks,
                                createdBy: req.user?._id || null,
                                createdByRole: req.user?.role || "user"
                            }],
                            session ? { session } : {}
                        );
                        header = headerArr[0];
                        parsedDocNo = header.docNo;
                    } catch (createErr) {
                        const isDupKey = createErr.code === 11000 ||
                            (createErr.name === 'MongoServerError' && createErr.code === 11000) ||
                            (createErr.message && createErr.message.includes('E11000 duplicate key'));

                        if (isDupKey && attempts < maxAttempts) {
                            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 25) + 10));
                            continue;
                        }
                        throw createErr;
                    }
                }

                if (!header) {
                    const err = new Error('Could not allocate unique Stock Out document number after multiple attempts');
                    err.statusCode = 500;
                    throw err;
                }
            }

            await Sequence.findOneAndUpdate(
                { _id: "stockOutDocument" },
                { $set: { seq: header.docNo } },
                { upsert: true, session: session || undefined }
            );

            const issuedItems = [];
            const touchedProductIds = new Set();

            for (const item of items) {
                const pId = String(item.productId || item.stockId);
                const productDoc = productDocMap.get(pId);
                const requestedQty = Number(item.quantity);
                const rawDisc = item.discountPercentage !== undefined ? item.discountPercentage : (body.discountPercentage !== undefined ? body.discountPercentage : 0);
                const itemDiscPct = Number(rawDisc || 0);

                // Check if user selected an exact batch / StockBalance
                let targetStockBalanceId = item.stockBalanceId;
                if (!targetStockBalanceId && item.expiry) {
                    const matchBal = await findMatchingStockBalance(pId, item.expiry, item.batchNumber, null, session);
                    if (matchBal && (matchBal.quantity || 0) > 0) {
                        targetStockBalanceId = matchBal._id;
                    }
                }

                if (targetStockBalanceId) {
                    // Exact batch deduction: deduct from the specified StockBalance record
                    let bal = await StockBalance.findOne({
                        _id: targetStockBalanceId,
                        productId: new mongoose.Types.ObjectId(pId)
                    }).session(session);

                    if (!bal && item.expiry) {
                        bal = await findMatchingStockBalance(pId, item.expiry, item.batchNumber, null, session);
                    }

                    // If this single record does not have enough but sibling records for this batch exist, consolidate them
                    if (bal && (bal.quantity || 0) < requestedQty) {
                        const normExp = normalizeExpiryDate(bal.expiry || item.expiry);
                        const cleanBatch = (bal.batchNumber || item.batchNumber || "").trim();
                        const siblings = await StockBalance.find({
                            ...buildStockBalanceFilter(pId, normExp, cleanBatch),
                            _id: { $ne: bal._id }
                        }).session(session);

                        if (siblings.length > 0) {
                            let added = 0;
                            for (const sib of siblings) {
                                added += (sib.quantity || 0);
                                await StockBalance.findByIdAndDelete(sib._id, session ? { session } : {});
                            }
                            bal.quantity = (bal.quantity || 0) + added;
                            await bal.save(session ? { session } : {});
                        }
                    }

                    if (!bal || (bal.quantity || 0) < requestedQty) {
                        const avail = bal ? (bal.quantity || 0) : 0;
                        const err = new Error(`Insufficient stock for "${productDoc.name}" batch ${bal?.batchNumber || ''} (Expiry: ${bal?.expiry ? moment(bal.expiry).format('DD/MM/YYYY') : 'None'}). Requested: ${requestedQty}, Available: ${avail}`);
                        err.statusCode = 409;
                        err.code = 'INSUFFICIENT_STOCK';
                        err.availableQuantity = avail;
                        err.requestedQuantity = requestedQty;
                        err.productName = productDoc.name;
                        err.productId = pId;
                        throw err;
                    }

                    const prevQty = bal.quantity;
                    const updatedBal = await StockBalance.findOneAndUpdate(
                        { _id: bal._id, productId: new mongoose.Types.ObjectId(pId), quantity: { $gte: requestedQty } },
                        { $inc: { quantity: -requestedQty } },
                        { new: true, session }
                    );

                    if (!updatedBal) {
                        const recheckBal = await StockBalance.findById(bal._id).session(session);
                        const avail = recheckBal ? recheckBal.quantity : 0;
                        const err = new Error(`Stock for "${productDoc.name}" batch changed concurrently. Available: ${avail}, Requested: ${requestedQty}`);
                        err.statusCode = 409;
                        err.code = 'INSUFFICIENT_STOCK';
                        throw err;
                    }

                    const newQty = updatedBal.quantity;
                    const itemPrice = Number(
                        (item.sellingPrice !== undefined && item.sellingPrice !== null && item.sellingPrice !== '' && !isNaN(Number(item.sellingPrice)))
                            ? Number(item.sellingPrice)
                            : (productDoc?.sellingPrice ?? updatedBal.sellingPrice ?? 0)
                    );
                    const itemTotal = Math.round((requestedQty * itemPrice) * 100) / 100;
                    const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                    const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                    const outItemArr = await StockOutItem.create(
                        [{
                            stockOutHeaderId: header._id,
                            productId: pId,
                            stockBalanceId: updatedBal._id,
                            quantity: requestedQty,
                            sellingPrice: itemPrice,
                            purchasingPrice: updatedBal.purchasingPrice || 0,
                            expiry: updatedBal.expiry,
                            batchNumber: updatedBal.batchNumber || "",
                            remarks: item.remarks || remarks || "",
                            discountPercentage: itemDiscPct,
                            discountAmount,
                            itemTotal,
                            netTotal
                        }],
                        session ? { session } : {}
                    );
                    const outItem = outItemArr[0];

                    const txn = new InventoryTransaction({
                        productId: pId,
                        stockBalanceId: updatedBal._id,
                        locationId: location,
                        batchNumber: updatedBal.batchNumber || "",
                        expiry: updatedBal.expiry,
                        quantityDelta: -requestedQty,
                        previousBalance: prevQty,
                        newBalance: newQty,
                        unitCost: updatedBal.purchasingPrice || 0,
                        sellingPrice: itemPrice,
                        transactionType: "STOCK_OUT",
                        referenceType: "StockOut",
                        referenceId: outItem._id,
                        docNo: parsedDocNo,
                        createdBy: req.user?._id,
                        date,
                        remarks: item.remarks || remarks || "Stock Out"
                    });
                    await txn.save(session ? { session } : {});

                    issuedItems.push(outItem);
                    touchedProductIds.add(pId);
                } else {
                    // Fallback to FEFO allocation across available batches when no specific batch is selected
                    const balances = await StockBalance.find({
                        productId: new mongoose.Types.ObjectId(pId),
                        quantity: { $gt: 0 }
                    }).sort({ expiry: 1, createdAt: 1 }).session(session);

                    let remaining = requestedQty;
                    for (const bal of balances) {
                        if (remaining <= 0) break;
                        const takeQty = Math.min(remaining, bal.quantity);

                        // Atomic deduction with $gte TOCTOU guard
                        const updatedBal = await StockBalance.findOneAndUpdate(
                            { _id: bal._id, quantity: { $gte: takeQty } },
                            { $inc: { quantity: -takeQty } },
                            { new: true, session }
                        );

                        if (!updatedBal) {
                            const recheck = await getAuthoritativeStock(pId, session);
                            const err = new Error(`Stock for "${productDoc.name}" changed concurrently. Available: ${recheck.totalAvailable}, Requested: ${remaining}`);
                            err.statusCode = 409;
                            err.code = 'INSUFFICIENT_STOCK';
                            err.availableQuantity = recheck.totalAvailable;
                            err.requestedQuantity = requestedQty;
                            err.productName = productDoc.name;
                            throw err;
                        }

                        const prevQty = bal.quantity;
                        const newQty = updatedBal.quantity;
                        const itemPrice = Number(
                            (item.sellingPrice !== undefined && item.sellingPrice !== null && item.sellingPrice !== '' && !isNaN(Number(item.sellingPrice)))
                                ? Number(item.sellingPrice)
                                : (productDoc?.sellingPrice ?? bal.sellingPrice ?? 0)
                        );
                        const itemTotal = Math.round((takeQty * itemPrice) * 100) / 100;
                        const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                        const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                        const outItemArr = await StockOutItem.create(
                            [{
                                stockOutHeaderId: header._id,
                                productId: pId,
                                stockBalanceId: bal._id,
                                quantity: takeQty,
                                sellingPrice: itemPrice,
                                purchasingPrice: bal.purchasingPrice || 0,
                                expiry: bal.expiry,
                                batchNumber: bal.batchNumber || "",
                                remarks: item.remarks || remarks || "",
                                discountPercentage: itemDiscPct,
                                discountAmount,
                                itemTotal,
                                netTotal
                            }],
                            session ? { session } : {}
                        );
                        const outItem = outItemArr[0];

                        const txn = new InventoryTransaction({
                            productId: pId,
                            stockBalanceId: bal._id,
                            locationId: location,
                            batchNumber: bal.batchNumber || "",
                            expiry: bal.expiry,
                            quantityDelta: -takeQty,
                            previousBalance: prevQty,
                            newBalance: newQty,
                            unitCost: bal.purchasingPrice || 0,
                            sellingPrice: itemPrice,
                            transactionType: "STOCK_OUT",
                            referenceType: "StockOut",
                            referenceId: outItem._id,
                            docNo: parsedDocNo,
                            createdBy: req.user?._id,
                            date,
                            remarks: item.remarks || remarks || "Stock Out"
                        });
                        await txn.save(session ? { session } : {});

                        issuedItems.push(outItem);
                        remaining -= takeQty;
                    }

                    if (remaining > 0) {
                        const recheck = await getAuthoritativeStock(pId, session);
                        const err = new Error(`Insufficient stock remaining for "${productDoc.name}". Available: ${recheck.totalAvailable}, Requested: ${remaining}`);
                        err.statusCode = 409;
                        err.code = 'INSUFFICIENT_STOCK';
                        err.availableQuantity = recheck.totalAvailable;
                        err.requestedQuantity = requestedQty;
                        err.productName = productDoc.name;
                        throw err;
                    }

                    touchedProductIds.add(pId);
                }
            }

            // Recalculate running balances for all touched products
            for (const pId of touchedProductIds) {
                await recalculateRunningBalances(pId, session);
            }

            await updateHeaderTotals(header._id, session);
            const updatedHeader = await StockOutHeader.findById(header._id).session(session).lean();

            return { header: updatedHeader, items: issuedItems };
        };

        const handleError = (err, res) => {
            console.error('createStockOut error:', err);
            if (err.code === 'INSUFFICIENT_STOCK') {
                return res.status(409).json({
                    msg: 'error',
                    code: 'INSUFFICIENT_STOCK',
                    error: err.message,
                    availableQuantity: err.availableQuantity,
                    requestedQuantity: err.requestedQuantity,
                    productName: err.productName
                });
            }
            if (err.statusCode === 400) {
                return res.status(400).json({ msg: 'error', error: err.message });
            }
            if (err.statusCode === 404) {
                return res.status(404).json({ msg: 'error', error: err.message });
            }
            return res.status(500).json({ msg: 'error', error: err.message });
        };

        const runTransactionWithRetry = async () => {
            let txAttempts = 0;
            const maxTxAttempts = 5;

            while (txAttempts < maxTxAttempts) {
                txAttempts++;
                const session = await mongoose.startSession();
                let useTransaction = true;
                try {
                    session.startTransaction();
                } catch (e) {
                    useTransaction = false;
                    session.endSession();
                }

                if (!useTransaction) {
                    return await executeCreate(null);
                }

                try {
                    const result = await executeCreate(session);
                    await session.commitTransaction();
                    session.endSession();
                    return result;
                } catch (txError) {
                    try {
                        await session.abortTransaction();
                    } catch (abortErr) {
                        // ignore abort error
                    }
                    session.endSession();

                    const errorMsg = txError.message || '';
                    const isTxUnsupported = errorMsg.includes('replica set') ||
                        errorMsg.includes('Transaction numbers') ||
                        errorMsg.includes('does not support') ||
                        txError.code === 20 ||
                        txError.codeName === 'IllegalOperation';

                    if (isTxUnsupported) {
                        return await executeCreate(null);
                    }

                    const isDupKey = txError.code === 11000 ||
                        (txError.name === 'MongoServerError' && txError.code === 11000) ||
                        errorMsg.includes('E11000 duplicate key');
                    const isWriteConflict = txError.code === 112 ||
                        txError.codeName === 'WriteConflict' ||
                        errorMsg.includes('WriteConflict');
                    const isTransient = txError.hasErrorLabel && txError.hasErrorLabel('TransientTransactionError');

                    if ((isDupKey || isWriteConflict || isTransient) && txAttempts < maxTxAttempts) {
                        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 30) + 15));
                        continue;
                    }

                    throw txError;
                }
            }
        };

        try {
            const result = await runTransactionWithRetry();
            return res.status(200).json({ msg: 'success', result: { ...result.header, items: result.items } });
        } catch (err) {
            return handleError(err, res);
        }
    },

    async stockOuts(req, res) {
        return stockOutController.createStockOut(req, res);
    },

    async stockOutAgainByDocNo(req, res) {
        req.body = { ...req.body, isExistingDoc: true };
        return stockOutController.createStockOut(req, res);
    },

    async getStockOutDocs(req, res) {
        try {
            const headers = await StockOutHeader.find({})
                .populate("location", "name doctorName trainerName")
                .populate("createdBy", "userName")
                .sort({ docNo: -1 })
                .lean();

            const docs = await Promise.all(headers.map(async (h) => {
                const items = await StockOutItem.find({ stockOutHeaderId: h._id }).lean();
                const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
                const subTotal = items.reduce((sum, i) => sum + (i.itemTotal !== undefined && i.itemTotal !== null ? Number(i.itemTotal) : ((i.quantity || 0) * (i.sellingPrice || 0))), 0);
                const totalDiscount = items.reduce((sum, i) => sum + (Number(i.discountAmount) || 0), 0);
                const grandTotal = items.reduce((sum, i) => sum + (i.netTotal !== undefined && i.netTotal !== null ? Number(i.netTotal) : ((i.quantity || 0) * (i.sellingPrice || 0) - (Number(i.discountAmount) || 0))), 0);
                const uniqueProducts = new Set(items.map(i => String(i.productId)));
                return {
                    _id: h._id,
                    docNo: h.docNo,
                    location: h.location,
                    date: h.date || h.createdAt,
                    createdAt: h.createdAt,
                    createdBy: h.createdBy ? { _id: h.createdBy._id, userName: h.createdBy.userName } : null,
                    totalProducts: Array.from(uniqueProducts).length,
                    totalQuantity,
                    subTotal: Math.round(subTotal * 100) / 100,
                    totalDiscount: Math.round(totalDiscount * 100) / 100,
                    grandTotal: Math.round(grandTotal * 100) / 100,
                    items
                };
            }));

            return res.status(200).json({ msg: "success", result: docs });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getTrainerExpense(req, res) {
        try {
            const StockOutPdf = require("../models/StockOutPdfModule");
            const moment = require("moment");

            const trainerQuery = req.query.trainer || req.query.trainerName || req.body?.trainer || req.body?.trainerName || "";
            const trainerId = req.query.trainerId || req.body?.trainerId || "";
            const targetTrainer = trainerQuery.trim();

            // Resolve reference date (defaults to current date in server local time)
            const dateParam = req.query.date || req.query.today || req.body?.date || req.body?.today;
            const refDate = (dateParam && moment(dateParam).isValid()) ? moment(dateParam) : moment();

            const monthStr = refDate.format("YYYY-MM");
            const fromDateStr = refDate.clone().startOf("month").format("YYYY-MM-DD");
            const toDateStr = refDate.format("YYYY-MM-DD");

            if (!targetTrainer && !trainerId) {
                return res.status(200).json({
                    msg: "success",
                    trainerName: "",
                    month: monthStr,
                    fromDate: fromDateStr,
                    toDate: toDateStr,
                    totalExpense: 0,
                    documentsCount: 0,
                    documents: []
                });
            }

            const normTarget = targetTrainer.toLowerCase().replace(/[.\-_,]/g, ' ').replace(/\s+/g, ' ').trim();

            // Broad date filter to cover buffer around current month
            const queryStart = refDate.clone().startOf("month").subtract(3, "days").toDate();
            const queryEnd = refDate.clone().endOf("day").add(3, "days").toDate();

            const headers = await StockOutHeader.find({
                date: { $gte: queryStart, $lte: queryEnd }
            })
                .populate("location", "name doctorName trainerName")
                .sort({ docNo: 1 })
                .lean();

            const docNos = headers.map(h => Number(h.docNo)).filter(Boolean);
            const pdfRecords = docNos.length > 0
                ? await StockOutPdf.find({ docNo: { $in: docNos } }).lean()
                : [];
            const pdfMap = new Map();
            pdfRecords.forEach(pdf => {
                if (pdf.docNo) pdfMap.set(Number(pdf.docNo), pdf);
            });

            let totalExpense = 0;
            const matchingDocs = [];

            for (const h of headers) {
                const pdf = pdfMap.get(Number(h.docNo));
                const docTrainer = pdf?.trainerName || h.location?.trainerName || "";
                const normDocTrainer = docTrainer.toLowerCase().replace(/[.\-_,]/g, ' ').replace(/\s+/g, ' ').trim();

                // Check trainer match
                let isTrainerMatch = false;
                if (trainerId && h.location?._id && String(h.location._id) === String(trainerId)) {
                    isTrainerMatch = true;
                } else if (normTarget) {
                    if (normDocTrainer === normTarget || normDocTrainer.includes(normTarget) || normTarget.includes(normDocTrainer)) {
                        isTrainerMatch = true;
                    }
                }

                if (!isTrainerMatch) continue;

                // Check transaction date belongs to current month and <= today
                const docDateStr = moment(h.date || h.createdAt).format("YYYY-MM-DD");
                if (docDateStr >= fromDateStr && docDateStr <= toDateStr) {
                    let docNetTotal = Number(h.grandTotal ?? 0);
                    if (isNaN(docNetTotal) || (h.totalDiscount > 0 && h.grandTotal === h.subTotal && h.subTotal > 0)) {
                        docNetTotal = Math.round(((h.subTotal || 0) - (h.totalDiscount || 0)) * 100) / 100;
                    }
                    totalExpense += docNetTotal;
                    matchingDocs.push({
                        docNo: h.docNo,
                        date: docDateStr,
                        grandTotal: docNetTotal,
                        trainerName: docTrainer || targetTrainer,
                        locationName: h.location?.name || pdf?.locationName || ""
                    });
                }
            }

            const roundedTotal = Math.round(totalExpense * 100) / 100;

            return res.status(200).json({
                msg: "success",
                trainerName: targetTrainer,
                month: monthStr,
                fromDate: fromDateStr,
                toDate: toDateStr,
                totalExpense: roundedTotal,
                documentsCount: matchingDocs.length,
                documents: matchingDocs
            });
        } catch (err) {
            console.error("getTrainerExpense error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockOutByDocNo(req, res) {
        try {
            const { docNo } = req.body || {};
            if (!docNo) return res.status(400).send("docNo required");

            const header = await StockOutHeader.findOne({ docNo: Number(docNo) })
                .populate("location", "name doctorName trainerName")
                .populate("createdBy", "userName role");

            if (!header) return res.status(404).send("Document not found");

            const items = await StockOutItem.find({ stockOutHeaderId: header._id })
                .populate("productId", "name companyName type unit");

            const locationObj = header.location;
            const locationId = locationObj?._id || locationObj || null;
            const locationName = locationObj?.name || "";
            const doctorName = locationObj?.doctorName || "";
            const trainerName = locationObj?.trainerName || "";

            const subTotal = items.reduce((sum, item) => sum + (item.itemTotal !== undefined && item.itemTotal !== null ? Number(item.itemTotal) : ((item.quantity || 0) * (item.sellingPrice || 0))), 0);
            const totalDiscount = items.reduce((sum, item) => sum + (Number(item.discountAmount) || 0), 0);
            const grandTotal = items.reduce((sum, item) => sum + (item.netTotal !== undefined && item.netTotal !== null ? Number(item.netTotal) : ((item.quantity || 0) * (item.sellingPrice || 0) - (Number(item.discountAmount) || 0))), 0);

            const formatted = [{
                _id: { docNo: header.docNo },
                docNo: header.docNo,
                date: header.date || header.createdAt,
                createdAt: header.createdAt,
                headerId: header._id,
                subTotal: Math.round(subTotal * 100) / 100,
                totalDiscount: Math.round(totalDiscount * 100) / 100,
                grandTotal: Math.round(grandTotal * 100) / 100,
                doc: items.map(item => {
                    const iTotal = item.itemTotal !== undefined && item.itemTotal !== null ? Number(item.itemTotal) : ((item.quantity || 0) * (item.sellingPrice || 0));
                    const dAmt = Number(item.discountAmount) || 0;
                    const nTotal = item.netTotal !== undefined && item.netTotal !== null ? Number(item.netTotal) : (iTotal - dAmt);
                    return {
                        _id: item._id,
                        docNo: header.docNo,
                        name: item.productId?.name || "",
                        companyName: item.productId?.companyName || item.companyName || "",
                        location: locationObj,
                        locationId: locationId,
                        locationName: locationName,
                        doctorName: doctorName,
                        trainerName: trainerName,
                        productId: item.productId?._id || item.productId,
                        product: item.productId,
                        quantity: item.quantity,
                        unit: item.productId?.unit || "",
                        sellingPrice: item.sellingPrice,
                        purchasingPrice: item.purchasingPrice,
                        discountPercentage: item.discountPercentage || 0,
                        discountAmount: dAmt,
                        itemTotal: iTotal,
                        netTotal: nTotal,
                        prevQuantity: 0,
                        expiry: item.expiry,
                        date: header.date || item.createdAt,
                        createdAt: item.createdAt,
                        remarks: item.remarks
                    };
                })
            }];

            return res.status(200).json({ msg: "success", result: formatted });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getDocumentStockOut(req, res) {
        return stockOutController.getStockOutByDocNo(req, res);
    },

    async getSummaryStockOut(req, res) {
        return res.status(200).json({ msg: "success", result: [] });
    },

    async getStockAllStockOut(req, res) {
        return res.status(200).json({ msg: "success", result: [] });
    },

    async stockOutUpdateQuantity(req, res) {
        try {
            const id = req.params.itemId || req.params.id || req.body._id || req.body.itemId;
            const { quantity, sellingPrice, discountPercentage, locationId, location, doctorName, trainerName } = req.body || {};

            const item = await StockOutItem.findById(id);
            if (!item) return res.status(404).json({ msg: "error", result: "Stock Out item not found" });

            if (discountPercentage !== undefined && discountPercentage !== null) {
                let discPct = Number(discountPercentage);
                if (isNaN(discPct) || discPct < 0 || discPct > 100) {
                    return res.status(400).json({ msg: "error", result: "Discount percentage must be between 0 and 100" });
                }
                item.discountPercentage = discPct;
            }

            const oldQty = Number(item.quantity || 0);
            const newQty = quantity !== undefined ? Number(quantity) : oldQty;
            const diff = newQty - oldQty;

            const productId = item.productId;

            // Update Header location if changed
            const targetLocation = locationId || location;
            if (targetLocation) {
                await StockOutHeader.findByIdAndUpdate(item.stockOutHeaderId, {
                    location: targetLocation
                });
            }

            // Check stock availability if increasing Stock Out quantity
            if (diff > 0) {
                const balances = await StockBalance.find({
                    productId: mongoose.Types.ObjectId(String(productId)),
                    quantity: { $gt: 0 }
                });
                const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                if (totalAvailable < diff) {
                    return res.status(400).json({
                        msg: "error",
                        result: `Insufficient stock to increase Stock Out. Needed: ${diff}, Available: ${totalAvailable}`
                    });
                }
                let remaining = diff;
                for (const bal of balances) {
                    if (remaining <= 0) break;
                    const takeQty = Math.min(remaining, bal.quantity);
                    bal.quantity -= takeQty;
                    await bal.save();
                    remaining -= takeQty;
                }
            } else if (diff < 0) {
                // Return stock
                const returnQty = Math.abs(diff);
                let bal = null;
                if (item.expiry) {
                    bal = await StockBalance.findOne({
                        productId: item.productId,
                        expiry: item.expiry
                    });
                }
                if (!bal) {
                    bal = await StockBalance.findOne({ productId: item.productId }).sort({ createdAt: -1 });
                }
                if (bal) {
                    bal.quantity = (bal.quantity || 0) + returnQty;
                    await bal.save();
                } else {
                    await StockBalance.create({
                        productId: item.productId,
                        expiry: item.expiry || null,
                        quantity: returnQty,
                        purchasingPrice: item.purchasingPrice || 0,
                        sellingPrice: item.sellingPrice || 0
                    });
                }
            }

            item.quantity = newQty;
            if (sellingPrice !== undefined && sellingPrice !== null) {
                item.sellingPrice = Number(sellingPrice);
            }
            if (remarks !== undefined || doctorName !== undefined || trainerName !== undefined) {
                item.remarks = remarks || doctorName || trainerName || item.remarks;
            }
            const itemPrice = Number(item.sellingPrice || 0);
            const itemTotal = Math.round((newQty * itemPrice) * 100) / 100;
            const discountAmount = Math.round((itemTotal * (item.discountPercentage || 0) / 100) * 100) / 100;
            const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

            item.itemTotal = itemTotal;
            item.discountAmount = discountAmount;
            item.netTotal = netTotal;
            await item.save();

            // Update InventoryTransaction
            await InventoryTransaction.updateMany(
                { referenceId: item._id },
                {
                    $set: {
                        quantityDelta: -newQty,
                        sellingPrice: item.sellingPrice,
                        locationId: targetLocation || undefined
                    }
                }
            );

            // Reconcile product balances
            await recalculateRunningBalances(productId);
            await updateHeaderTotals(item.stockOutHeaderId);

            return res.status(200).json({ msg: "success", result: item });
        } catch (err) {
            console.error("stockOutUpdateQuantity error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async bulkUpdate(req, res) {
        const executeUpdate = async (session) => {
            const { updates, docNo, location, locationId } = req.body || {};
            if (!Array.isArray(updates)) {
                throw new Error("updates must be an array");
            }

            const parsedDocNo = Number(docNo || updates[0]?.docNo || 1);
            let header = await StockOutHeader.findOne({ docNo: parsedDocNo }).session(session);

            const docLocation = location ||
                locationId ||
                header?.location ||
                updates.find(u => u.locationId || u.location)?.locationId ||
                updates.find(u => u.locationId || u.location)?.location;

            const inputDate = req.body?.documentDate || req.body?.date;
            let headerDateChanged = false;
            if (inputDate) {
                const parsedDate = new Date(inputDate);
                if (!isNaN(parsedDate.getTime())) {
                    header.date = parsedDate;
                    headerDateChanged = true;
                }
            }

            if (!header) {
                const headerArr = await StockOutHeader.create(
                    [{
                        docNo: parsedDocNo,
                        location: docLocation || null,
                        date: inputDate && !isNaN(new Date(inputDate).getTime()) ? new Date(inputDate) : new Date(),
                        createdBy: req.user?._id || null,
                        createdByRole: req.user?.role || "user"
                    }],
                    session ? { session } : {}
                );
                header = headerArr[0];
                await Sequence.findOneAndUpdate(
                    { _id: "stockOutDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true, session }
                );
            } else {
                let headerModified = false;
                if (docLocation && String(header.location) !== String(docLocation)) {
                    header.location = docLocation;
                    headerModified = true;
                }
                if (headerDateChanged) {
                    headerModified = true;
                }
                if (headerModified) {
                    await header.save(session ? { session } : {});
                }
            }

            if (headerDateChanged && header?.date) {
                await InventoryTransaction.updateMany(
                    { docNo: header.docNo },
                    { $set: { date: header.date } },
                    session ? { session } : {}
                );
                try {
                    const StockOutPdf = require("../models/StockOutPdfModule");
                    await StockOutPdf.updateMany(
                        { docNo: header.docNo },
                        { $set: { date: header.date } }
                    );
                } catch (e) {
                    console.error("Error updating StockOutPdf date in bulkUpdate:", e);
                }
            }

            const touchedProductIds = new Set();

            for (const update of updates) {
                const { _id, productId, quantity, sellingPrice, isDeleted, remarks, stockId } = update;
                const targetProductId = productId || stockId;

                // 1. New item added in doc
                if (!_id || String(_id).startsWith("new_")) {
                    if (isDeleted) continue;
                    if (!targetProductId) continue;

                    const requestedQty = Number(quantity || 0);
                    if (requestedQty <= 0) continue;

                    const pId = String(targetProductId);
                    const productDoc = await Product.findById(pId).session(session);
                    if (!productDoc) {
                        throw new Error(`Product not found for ID: ${pId}`);
                    }

                    // Check if exact stockBalanceId / batch is specified
                    let targetStockBalanceId = update.stockBalanceId;
                    if (!targetStockBalanceId && update.expiry) {
                        const matchBal = await findMatchingStockBalance(pId, update.expiry, update.batchNumber, update.locationId, session);
                        if (matchBal && (matchBal.quantity || 0) > 0) targetStockBalanceId = matchBal._id;
                    }

                    if (targetStockBalanceId) {
                        const bal = await StockBalance.findOne({
                            _id: targetStockBalanceId,
                            productId: mongoose.Types.ObjectId(pId)
                        }).session(session);

                        if (!bal || (bal.quantity || 0) < requestedQty) {
                            const avail = bal ? (bal.quantity || 0) : 0;
                            throw new Error(`Insufficient stock for "${productDoc.name}" batch ${bal?.batchNumber || ''} (Expiry: ${bal?.expiry ? moment(bal.expiry).format('DD/MM/YYYY') : 'None'}). Requested: ${requestedQty}, Available: ${avail}`);
                        }

                        const prevQty = bal.quantity;
                        bal.quantity -= requestedQty;
                        await bal.save(session ? { session } : {});

                        const itemDiscPct = Number(update.discountPercentage || 0);
                        const itemPrice = Number(sellingPrice ?? bal.sellingPrice ?? 0);
                        const itemTotal = Math.round((requestedQty * itemPrice) * 100) / 100;
                        const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                        const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                        const outItemArr = await StockOutItem.create(
                            [{
                                stockOutHeaderId: header._id,
                                productId: pId,
                                stockBalanceId: bal._id,
                                quantity: requestedQty,
                                sellingPrice: itemPrice,
                                purchasingPrice: bal.purchasingPrice || 0,
                                expiry: bal.expiry,
                                batchNumber: bal.batchNumber || "",
                                remarks: remarks || "Stock Out added via bulk update",
                                discountPercentage: itemDiscPct,
                                discountAmount,
                                itemTotal,
                                netTotal
                            }],
                            session ? { session } : {}
                        );
                        const outItem = outItemArr[0];

                        const txn = new InventoryTransaction({
                            productId: pId,
                            stockBalanceId: bal._id,
                            locationId: header.location,
                            batchNumber: bal.batchNumber || "",
                            expiry: bal.expiry,
                            quantityDelta: -requestedQty,
                            previousBalance: prevQty,
                            newBalance: bal.quantity,
                            unitCost: bal.purchasingPrice || 0,
                            sellingPrice: Number(sellingPrice ?? bal.sellingPrice ?? 0),
                            transactionType: "STOCK_OUT",
                            referenceType: "StockOut",
                            referenceId: outItem._id,
                            docNo: parsedDocNo,
                            createdBy: req.user?._id,
                            date: header.date || new Date(),
                            remarks: remarks || "Stock Out added via bulk update"
                        });
                        await txn.save(session ? { session } : {});
                    } else {
                        // FEFO / FIFO Batch Allocation from StockBalances
                        const balances = await StockBalance.find({
                            productId: mongoose.Types.ObjectId(pId),
                            quantity: { $gt: 0 }
                        }).sort({ expiry: 1, createdAt: 1 }).session(session);

                        const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                        if (totalAvailable < requestedQty) {
                            throw new Error(`Insufficient stock for "${productDoc.name}". Requested: ${requestedQty}, Available: ${totalAvailable}`);
                        }

                        let remaining = requestedQty;
                        for (const bal of balances) {
                            if (remaining <= 0) break;
                            const takeQty = Math.min(remaining, bal.quantity);
                            const prevQty = bal.quantity;
                            bal.quantity -= takeQty;
                            await bal.save(session ? { session } : {});

                            const itemDiscPct = Number(update.discountPercentage || 0);
                            if (isNaN(itemDiscPct) || itemDiscPct < 0 || itemDiscPct > 100) {
                                throw new Error(`Invalid discount percentage (${update.discountPercentage})`);
                            }
                            const itemPrice = Number(sellingPrice ?? bal.sellingPrice ?? 0);
                            const itemTotal = Math.round((takeQty * itemPrice) * 100) / 100;
                            const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                            const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                            const outItemArr = await StockOutItem.create(
                                [{
                                    stockOutHeaderId: header._id,
                                    productId: pId,
                                    stockBalanceId: bal._id,
                                    quantity: takeQty,
                                    sellingPrice: itemPrice,
                                    purchasingPrice: bal.purchasingPrice || 0,
                                    expiry: bal.expiry,
                                    batchNumber: bal.batchNumber || "",
                                    remarks: remarks || "Stock Out added via bulk update",
                                    discountPercentage: itemDiscPct,
                                    discountAmount,
                                    itemTotal,
                                    netTotal
                                }],
                                session ? { session } : {}
                            );
                            const outItem = outItemArr[0];

                            const txn = new InventoryTransaction({
                                productId: pId,
                                stockBalanceId: bal._id,
                                locationId: header.location,
                                batchNumber: bal.batchNumber || "",
                                expiry: bal.expiry,
                                quantityDelta: -takeQty,
                                previousBalance: prevQty,
                                newBalance: bal.quantity,
                                unitCost: bal.purchasingPrice || 0,
                                sellingPrice: Number(sellingPrice ?? bal.sellingPrice ?? 0),
                                transactionType: "STOCK_OUT",
                                referenceType: "StockOut",
                                referenceId: outItem._id,
                                docNo: parsedDocNo,
                                createdBy: req.user?._id,
                                date: header.date || new Date(),
                                remarks: remarks || "Stock Out added via bulk update"
                            });
                            await txn.save(session ? { session } : {});

                            remaining -= takeQty;
                        }
                    }
                    touchedProductIds.add(pId);
                }
                // 2. Existing item
                else {
                    const item = await StockOutItem.findById(_id).session(session);
                    if (!item) continue;

                    const oldProductId = String(item.productId?._id || item.productId);
                    const newProductId = String(targetProductId || oldProductId);
                    const oldQty = Number(item.quantity || 0);
                    const newQty = quantity !== undefined ? Number(quantity) : oldQty;
                    const oldExpiry = item.expiry ? new Date(item.expiry) : null;
                    const newExpiry = update.expiry ? new Date(update.expiry) : null;

                    const productChanged = oldProductId !== newProductId;
                    const expiryChanged = (oldExpiry ? oldExpiry.getTime() : null) !== (newExpiry ? newExpiry.getTime() : null);

                    // 2a. Delete item
                    if (isDeleted) {
                        let bal = null;
                        if (item.stockBalanceId) {
                            bal = await StockBalance.findById(item.stockBalanceId).session(session);
                        }
                        if (!bal && oldExpiry) {
                            bal = await findMatchingStockBalance(oldProductId, oldExpiry, item.batchNumber, item.locationId, session);
                        }
                        if (!bal) {
                            bal = await StockBalance.findOne({ productId: oldProductId }).sort({ createdAt: -1 }).session(session);
                        }

                        if (bal) {
                            bal.quantity = (bal.quantity || 0) + oldQty;
                            await bal.save(session ? { session } : {});
                        } else {
                            await StockBalance.create(
                                [{
                                    productId: oldProductId,
                                    expiry: normalizeExpiryDate(oldExpiry),
                                    batchNumber: item.batchNumber || null,
                                    quantity: oldQty,
                                    purchasingPrice: item.purchasingPrice || 0,
                                    sellingPrice: item.sellingPrice || 0
                                }],
                                session ? { session } : {}
                            );
                        }

                        await InventoryTransaction.deleteMany(
                            { referenceId: item._id },
                            session ? { session } : {}
                        );

                        await StockOutItem.findByIdAndDelete(_id, session ? { session } : {});
                        touchedProductIds.add(oldProductId);
                    }
                    // 2b. Product Changed
                    else if (productChanged) {
                        // Return old product quantity to old product stock balance
                        let oldBal = null;
                        if (oldExpiry) {
                            oldBal = await findMatchingStockBalance(oldProductId, oldExpiry, item.batchNumber, item.locationId, session);
                        }
                        if (!oldBal) {
                            oldBal = await StockBalance.findOne({ productId: oldProductId }).sort({ createdAt: -1 }).session(session);
                        }
                        if (oldBal) {
                            oldBal.quantity = (oldBal.quantity || 0) + oldQty;
                            await oldBal.save(session ? { session } : {});
                        } else {
                            await StockBalance.create(
                                [{
                                    productId: oldProductId,
                                    expiry: normalizeExpiryDate(oldExpiry),
                                    batchNumber: item.batchNumber || null,
                                    quantity: oldQty,
                                    purchasingPrice: item.purchasingPrice || 0,
                                    sellingPrice: item.sellingPrice || 0
                                }],
                                session ? { session } : {}
                            );
                        }
                        touchedProductIds.add(oldProductId);

                        // Deduct new product quantity from new product stock balance
                        const productDoc = await Product.findById(newProductId).session(session);
                        if (!productDoc) {
                            throw new Error(`Product not found for ID: ${newProductId}`);
                        }

                        let deducted = 0;
                        let targetPurchasingPrice = 0;
                        let targetSellingPrice = Number(sellingPrice ?? productDoc.sellingPrice ?? 0);
                        let actualExpiry = newExpiry;

                        if (newExpiry) {
                            let batchBal = await StockBalance.findOne({
                                productId: mongoose.Types.ObjectId(newProductId),
                                expiry: newExpiry,
                                quantity: { $gte: newQty }
                            }).session(session);

                            if (batchBal) {
                                batchBal.quantity -= newQty;
                                targetPurchasingPrice = batchBal.purchasingPrice || 0;
                                await batchBal.save(session ? { session } : {});
                                deducted = newQty;
                            }
                        }

                        if (deducted < newQty) {
                            const needed = newQty - deducted;
                            const balances = await StockBalance.find({
                                productId: mongoose.Types.ObjectId(newProductId),
                                quantity: { $gt: 0 }
                            }).sort({ expiry: 1, createdAt: 1 }).session(session);

                            const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                            if (totalAvailable < needed) {
                                throw new Error(`Insufficient stock for "${productDoc.name}". Requested: ${newQty}, Available: ${totalAvailable + deducted}`);
                            }

                            let remaining = needed;
                            for (const b of balances) {
                                if (remaining <= 0) break;
                                const takeQty = Math.min(remaining, b.quantity);
                                b.quantity -= takeQty;
                                targetPurchasingPrice = b.purchasingPrice || targetPurchasingPrice;
                                if (!actualExpiry) actualExpiry = b.expiry;
                                await b.save(session ? { session } : {});
                                remaining -= takeQty;
                            }
                        }

                        const itemDiscPct = Number(update.discountPercentage !== undefined ? update.discountPercentage : (item.discountPercentage || 0));
                        if (isNaN(itemDiscPct) || itemDiscPct < 0 || itemDiscPct > 100) {
                            throw new Error("Discount percentage must be between 0 and 100");
                        }
                        const itemPrice = Number(sellingPrice ?? targetSellingPrice ?? item.sellingPrice ?? 0);
                        const itemTotal = Math.round((newQty * itemPrice) * 100) / 100;
                        const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                        const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                        item.productId = newProductId;
                        item.quantity = newQty;
                        item.sellingPrice = itemPrice;
                        item.purchasingPrice = targetPurchasingPrice;
                        item.expiry = actualExpiry;
                        item.discountPercentage = itemDiscPct;
                        item.discountAmount = discountAmount;
                        item.itemTotal = itemTotal;
                        item.netTotal = netTotal;
                        if (remarks !== undefined) {
                            item.remarks = remarks;
                        }
                        await item.save(session ? { session } : {});

                        await InventoryTransaction.updateMany(
                            { referenceId: item._id },
                            {
                                $set: {
                                    productId: newProductId,
                                    expiry: actualExpiry,
                                    quantityDelta: -newQty,
                                    sellingPrice: item.sellingPrice,
                                    unitCost: item.purchasingPrice,
                                    locationId: header.location || undefined
                                }
                            },
                            session ? { session } : {}
                        );

                        touchedProductIds.add(newProductId);
                    }
                    // 2c. Same product, update quantity / expiry / pricing
                    else {
                        if (expiryChanged) {
                            // Return old quantity to old expiry batch
                            let oldBal = null;
                            if (oldExpiry) {
                                oldBal = await StockBalance.findOne({
                                    productId: oldProductId,
                                    expiry: oldExpiry
                                }).session(session);
                            }
                            if (!oldBal) {
                                oldBal = await StockBalance.findOne({ productId: oldProductId }).sort({ createdAt: -1 }).session(session);
                            }
                            if (oldBal) {
                                oldBal.quantity = (oldBal.quantity || 0) + oldQty;
                                await oldBal.save(session ? { session } : {});
                            }

                            // Deduct new quantity from new expiry batch
                            const balances = await StockBalance.find({
                                productId: mongoose.Types.ObjectId(oldProductId),
                                quantity: { $gt: 0 }
                            }).sort({ expiry: 1, createdAt: 1 }).session(session);

                            const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                            if (totalAvailable < newQty) {
                                throw new Error(`Insufficient stock for updated expiry batch. Requested: ${newQty}, Available: ${totalAvailable}`);
                            }

                            let remaining = newQty;
                            for (const b of balances) {
                                if (remaining <= 0) break;
                                const takeQty = Math.min(remaining, b.quantity);
                                b.quantity -= takeQty;
                                await b.save(session ? { session } : {});
                                remaining -= takeQty;
                            }
                            item.expiry = newExpiry;
                        } else {
                            const diff = newQty - oldQty;
                            if (diff > 0) {
                                const balances = await StockBalance.find({
                                    productId: mongoose.Types.ObjectId(oldProductId),
                                    quantity: { $gt: 0 }
                                }).sort({ expiry: 1, createdAt: 1 }).session(session);

                                const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                                if (totalAvailable < diff) {
                                    throw new Error(`Insufficient stock to increase quantity. Needed: ${diff}, Available: ${totalAvailable}`);
                                }

                                let remaining = diff;
                                for (const bal of balances) {
                                    if (remaining <= 0) break;
                                    const takeQty = Math.min(remaining, bal.quantity);
                                    bal.quantity -= takeQty;
                                    await bal.save(session ? { session } : {});
                                    remaining -= takeQty;
                                }
                            } else if (diff < 0) {
                                const returnQty = Math.abs(diff);
                                let bal = null;
                                if (item.expiry) {
                                    bal = await StockBalance.findOne({
                                        productId: item.productId,
                                        expiry: item.expiry
                                    }).session(session);
                                }
                                if (!bal) {
                                    bal = await StockBalance.findOne({ productId: item.productId }).sort({ createdAt: -1 }).session(session);
                                }

                                if (bal) {
                                    bal.quantity = (bal.quantity || 0) + returnQty;
                                    await bal.save(session ? { session } : {});
                                } else {
                                    await StockBalance.create(
                                        [{
                                            productId: item.productId,
                                            expiry: item.expiry || null,
                                            quantity: returnQty,
                                            purchasingPrice: item.purchasingPrice || 0,
                                            sellingPrice: item.sellingPrice || 0
                                        }],
                                        session ? { session } : {}
                                    );
                                }
                            }
                        }

                        item.quantity = newQty;
                        if (sellingPrice !== undefined && sellingPrice !== null) {
                            item.sellingPrice = Number(sellingPrice);
                        }
                        if (update.discountPercentage !== undefined && update.discountPercentage !== null) {
                            let discPct = Number(update.discountPercentage);
                            if (isNaN(discPct) || discPct < 0 || discPct > 100) {
                                throw new Error("Discount percentage must be between 0 and 100");
                            }
                            item.discountPercentage = discPct;
                        }
                        const itemPrice = Number(item.sellingPrice || 0);
                        const itemTotal = Math.round((newQty * itemPrice) * 100) / 100;
                        const discountAmount = Math.round((itemTotal * (item.discountPercentage || 0) / 100) * 100) / 100;
                        const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                        item.itemTotal = itemTotal;
                        item.discountAmount = discountAmount;
                        item.netTotal = netTotal;

                        if (remarks !== undefined) {
                            item.remarks = remarks;
                        }
                        await item.save(session ? { session } : {});

                        await InventoryTransaction.updateMany(
                            { referenceId: item._id },
                            {
                                $set: {
                                    expiry: item.expiry,
                                    quantityDelta: -newQty,
                                    sellingPrice: item.sellingPrice,
                                    locationId: header.location || undefined
                                }
                            },
                            session ? { session } : {}
                        );

                        touchedProductIds.add(oldProductId);
                    }
                }
            }

            for (const pId of touchedProductIds) {
                await recalculateRunningBalances(pId, session);
            }

            await updateHeaderTotals(header._id, session);

            return "Bulk update completed";
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
                    const resMsg = await executeUpdate(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({ msg: "success", result: resMsg });
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
                        try {
                            const fallbackMsg = await executeUpdate(null);
                            return res.status(200).json({ msg: "success", result: fallbackMsg });
                        } catch (fallbackError) {
                            return res.status(400).json({ msg: "error", result: fallbackError.message });
                        }
                    }

                    return res.status(400).json({ msg: "error", result: txError.message });
                }
            } else {
                try {
                    const fallbackMsg = await executeUpdate(null);
                    return res.status(200).json({ msg: "success", result: fallbackMsg });
                } catch (fallbackError) {
                    return res.status(400).json({ msg: "error", result: fallbackError.message });
                }
            }
        } catch (err) {
            console.error("stockOutBulkUpdate error:", err);
            return res.status(500).json({ msg: "error", result: err.message });
        }
    },

    async updateStockOut(req, res) {
        return stockOutController.stockOutUpdateQuantity(req, res);
    },

    async deleteStockOut(req, res) {
        const AuditLog = require("../models/AuditLogModule");

        // Resolve identifier: support DELETE /documents/:id (MongoDB _id),
        // POST /deleteStockOut (body.docNo), POST /deleteStockOut/:id (body/params id=docNo)
        const paramId = req.params?.id;          // could be MongoDB _id or docNo
        const bodyDocNo = req.body?.docNo;
        const bodyId = req.body?.id;

        const executeDelete = async (session) => {
            let header = null;

            // 1. Resolve the StockOutHeader
            // Try paramId as MongoDB _id first, then as docNo, then fall back to body
            if (paramId) {
                if (typeof paramId === 'string' && /^[0-9a-fA-F]{24}$/.test(paramId)) {
                    header = await StockOutHeader.findById(paramId).session(session);
                }
                if (!header && !isNaN(Number(paramId))) {
                    header = await StockOutHeader.findOne({ docNo: Number(paramId) }).session(session);
                }
            }
            if (!header && bodyDocNo) {
                header = await StockOutHeader.findOne({ docNo: Number(bodyDocNo) }).session(session);
            }
            if (!header && bodyId) {
                if (typeof bodyId === 'string' && /^[0-9a-fA-F]{24}$/.test(bodyId)) {
                    header = await StockOutHeader.findById(bodyId).session(session);
                }
                if (!header && !isNaN(Number(bodyId))) {
                    header = await StockOutHeader.findOne({ docNo: Number(bodyId) }).session(session);
                }
            }

            if (!header) {
                const err = new Error("Stock Out Document not found");
                err.statusCode = 404;
                throw err;
            }

            const docNo = header.docNo;
            const headerId = header._id;

            // 2. Fetch all line items
            const items = await StockOutItem.find({ stockOutHeaderId: headerId }).session(session);

            const touchedProductIds = new Set();

            // 3. For each line item: reverse stock balance + delete transactions
            for (const item of items) {
                const productId = item.productId;
                const returnQty = Number(item.quantity || 0);
                if (returnQty <= 0) continue;

                // Match exact stockBalanceId first if available
                // Match exact stockBalanceId first if available
                let bal = null;
                if (item.stockBalanceId) {
                    bal = await StockBalance.findOne({
                        _id: item.stockBalanceId,
                        productId: productId
                    }).session(session);
                }
                if (!bal && item.expiry) {
                    bal = await findMatchingStockBalance(productId, item.expiry, item.batchNumber, item.locationId, session);
                }
                if (!bal && item.batchNumber) {
                    bal = await StockBalance.findOne({
                        productId: productId,
                        batchNumber: item.batchNumber
                    }).session(session);
                }
                if (!bal) {
                    bal = await StockBalance.findOne({ productId: productId }).sort({ createdAt: -1 }).session(session);
                }

                if (bal) {
                    bal.quantity = (bal.quantity || 0) + returnQty;
                    await bal.save(session ? { session } : {});
                } else {
                    // No batch found - recreate the balance record (same as bulkUpdate)
                    await StockBalance.create(
                        [{
                            productId: productId,
                            expiry: normalizeExpiryDate(item.expiry),
                            batchNumber: item.batchNumber || "",
                            quantity: returnQty,
                            purchasingPrice: item.purchasingPrice || 0,
                            sellingPrice: item.sellingPrice || 0
                        }],
                        session ? { session } : {}
                    );
                }

                touchedProductIds.add(String(productId));
            }

            // Remove all inventory transactions that reference this document or its line items
            const itemIds = items.map(i => i._id);
            await InventoryTransaction.deleteMany(
                {
                    $or: [
                        { referenceId: { $in: itemIds } },
                        { docNo: docNo, transactionType: "STOCK_OUT" },
                        { docNo: docNo, referenceType: "StockOut" }
                    ]
                },
                session ? { session } : {}
            );

            // 4. Recalculate running balances for every affected product
            for (const pId of touchedProductIds) {
                await recalculateRunningBalances(pId, session);
            }

            // 5. Delete all StockOutItems for this document
            await StockOutItem.deleteMany(
                { stockOutHeaderId: headerId },
                session ? { session } : {}
            );

            // 6. Delete any StockOutPdf records linked to this docNo
            try {
                const StockOutPdf = require("../models/StockOutPdfModule");
                await StockOutPdf.deleteMany({ docNo }, session ? { session } : {});
            } catch (e) {
                console.error("Error deleting StockOutPdf records:", e.message);
            }

            // 7. Delete the StockOutHeader
            await StockOutHeader.findByIdAndDelete(headerId, session ? { session } : {});

            // 8. Write audit log
            try {
                const auditItems = items.map(i => ({
                    productId: i.productId,
                    quantity: i.quantity,
                    expiry: i.expiry,
                    batchNumber: i.batchNumber
                }));
                const totalQtyReversed = items.reduce((s, i) => s + (i.quantity || 0), 0);
                const grandTotal = header.grandTotal || 0;
                await AuditLog.create([{
                    docNo,
                    docType: "StockOut",
                    productId: items[0]?.productId || new mongoose.Types.ObjectId(),
                    productName: `Document #${docNo} deleted - ${items.length} line(s)`,
                    previousValue: {
                        action: "DELETE_STOCK_OUT_DOCUMENT",
                        location: header.location,
                        grandTotal,
                        totalQtyReversed,
                        items: auditItems,
                        deletedAt: new Date()
                    },
                    newValue: null,
                    updatedBy: req.user?._id || header.createdBy || new mongoose.Types.ObjectId(),
                    updatedByRole: req.user?.role || header.createdByRole || "user"
                }], session ? { session } : {});
            } catch (e) {
                // Audit log failure must NOT abort the deletion
                console.error("Audit log write failed (non-fatal):", e.message);
            }

            return {
                docNo,
                itemsDeleted: items.length,
                stockReversed: Array.from(touchedProductIds)
            };
        };

        try {
            // Attempt with session/transaction, fall back to non-transactional
            // (identical pattern used by bulkUpdate)
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
                    const result = await executeDelete(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({
                        msg: "success",
                        result: `Stock Out Document #${result.docNo} deleted successfully. Stock quantities have been restored.`
                    });
                } catch (txError) {
                    await session.abortTransaction();
                    session.endSession();

                    if (txError.statusCode === 404) {
                        return res.status(404).json({ msg: "error", error: "Stock Out Document not found" });
                    }

                    const errorMsg = txError.message || '';
                    const isTxUnsupported = errorMsg.includes('replica set') ||
                        errorMsg.includes('Transaction numbers') ||
                        errorMsg.includes('does not support') ||
                        txError.code === 20 ||
                        txError.codeName === 'IllegalOperation';

                    if (isTxUnsupported) {
                        try {
                            const result = await executeDelete(null);
                            return res.status(200).json({
                                msg: "success",
                                result: `Stock Out Document #${result.docNo} deleted successfully. Stock quantities have been restored.`
                            });
                        } catch (fallbackError) {
                            if (fallbackError.statusCode === 404) {
                                return res.status(404).json({ msg: "error", error: "Stock Out Document not found" });
                            }
                            console.error("deleteStockOut fallback error:", fallbackError);
                            return res.status(500).json({ msg: "error", error: "Deletion failed. No changes were made." });
                        }
                    }

                    console.error("deleteStockOut transaction error:", txError);
                    return res.status(500).json({ msg: "error", error: "Deletion failed. No changes were made." });
                }
            } else {
                try {
                    const result = await executeDelete(null);
                    return res.status(200).json({
                        msg: "success",
                        result: `Stock Out Document #${result.docNo} deleted successfully. Stock quantities have been restored.`
                    });
                } catch (fallbackError) {
                    if (fallbackError.statusCode === 404) {
                        return res.status(404).json({ msg: "error", error: "Stock Out Document not found" });
                    }
                    console.error("deleteStockOut error:", fallbackError);
                    return res.status(500).json({ msg: "error", error: "Deletion failed. No changes were made." });
                }
            }
        } catch (err) {
            console.error("deleteStockOut outer error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async updateDocument(req, res) {
        try {
            const { docNo, id, documentId } = { ...req.params, ...req.body };
            const inputDate = req.body?.documentDate || req.body?.date || req.body?.document_date;

            const targetDocNo = docNo || documentId || id;
            if (!targetDocNo) {
                return res.status(400).json({ msg: "error", result: "Document identifier required" });
            }

            let header = null;
            if (targetDocNo && !isNaN(Number(targetDocNo))) {
                header = await StockOutHeader.findOne({ docNo: Number(targetDocNo) });
            }
            if (!header && mongoose.Types.ObjectId.isValid(targetDocNo)) {
                header = await StockOutHeader.findById(targetDocNo);
            }

            if (!header) {
                return res.status(404).json({ msg: "error", result: "Stock Out document not found" });
            }

            if (inputDate !== undefined && inputDate !== null) {
                const parsedDate = new Date(inputDate);
                if (isNaN(parsedDate.getTime())) {
                    return res.status(400).json({ msg: "error", result: "Invalid date value" });
                }
                header.date = parsedDate;

                await InventoryTransaction.updateMany(
                    { docNo: header.docNo },
                    { $set: { date: parsedDate } }
                );

                try {
                    const StockOutPdf = require("../models/StockOutPdfModule");
                    await StockOutPdf.updateMany(
                        { docNo: header.docNo },
                        { $set: { date: parsedDate } }
                    );
                } catch (e) {
                    console.error("Error updating StockOutPdf date:", e);
                }
            }

            if (req.body?.locationId || req.body?.location) {
                header.location = req.body.locationId || req.body.location;
            }

            if (req.body?.remarks !== undefined) {
                header.remarks = req.body.remarks;
            }

            await header.save();

            return res.status(200).json({
                msg: "success",
                result: {
                    _id: header._id,
                    docNo: header.docNo,
                    date: header.date,
                    createdAt: header.createdAt
                }
            });
        } catch (err) {
            console.error("updateDocument error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }
};

module.exports = stockOutController;
