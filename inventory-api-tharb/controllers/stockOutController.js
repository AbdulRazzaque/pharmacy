const mongoose = require('mongoose');
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockOutHeader = require("../models/StockOutHeaderModule");
const StockOutItem = require("../models/StockOutItemModule");
const Product = require("../models/ProductModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");

const getNextStockOutDocNo = async (session = null) => {
    let query = StockOutHeader.findOne({ docNo: { $exists: true, $ne: null } }).sort({ docNo: -1 });
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
            { _id: "stockOutDocument" },
            { $set: { seq: nextDocNo } },
            { upsert: true, session }
        );
    } catch (e) {
        console.error("Error updating Sequence for stockOutDocument:", e);
    }

    return nextDocNo;
};

const updateHeaderTotals = async (headerId, session = null) => {
    if (!headerId) return;
    const header = await StockOutHeader.findById(headerId).session(session);
    if (!header) return;
    const items = await StockOutItem.find({ stockOutHeaderId: header._id }).session(session);
    const subTotal = items.reduce((sum, i) => sum + (i.itemTotal !== undefined && i.itemTotal !== 0 ? i.itemTotal : ((i.quantity || 0) * (i.sellingPrice || 0))), 0);
    const totalDiscount = items.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
    const grandTotal = items.reduce((sum, i) => sum + (i.netTotal !== undefined && i.netTotal !== 0 ? i.netTotal : ((i.quantity || 0) * (i.sellingPrice || 0) - (i.discountAmount || 0))), 0);
    header.subTotal = Math.round(subTotal * 100) / 100;
    header.totalDiscount = Math.round(totalDiscount * 100) / 100;
    header.grandTotal = Math.round(grandTotal * 100) / 100;
    await header.save(session ? { session } : {});
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
            let parsedDocNo = Number(body.docNo);
            if (!parsedDocNo) {
                parsedDocNo = await getNextStockOutDocNo(session);
            }

            let existingHeader = await StockOutHeader.findOne({ docNo: parsedDocNo }).session(session);

            let items = [];
            if (Array.isArray(body.items) && body.items.length > 0) {
                items = body.items;
            } else if (Array.isArray(body.updates) && body.updates.length > 0) {
                items = body.updates;
            } else if (body.productId || body.stockId) {
                items = [{
                    productId: body.productId || body.stockId,
                    quantity: body.quantity,
                    sellingPrice: body.sellingPrice,
                    discountPercentage: body.discountPercentage !== undefined ? body.discountPercentage : 0,
                    remarks: body.remarks || body.doctorName || body.trainerName || ""
                }];
            }

            const location = body.location ||
                body.locationId ||
                existingHeader?.location ||
                items.find(i => i.locationId || i.location)?.locationId ||
                items.find(i => i.locationId || i.location)?.location;

            const date = body.date ? new Date(body.date) : (existingHeader?.date || new Date());
            const remarks = body.remarks || body.doctorName || body.trainerName || existingHeader?.remarks || "";

            if (!location || items.length === 0) {
                const err = new Error('location and items are required');
                err.statusCode = 400;
                throw err;
            }

            let header = existingHeader;
            if (!header) {
                const headerArr = await StockOutHeader.create(
                    [{ docNo: parsedDocNo, location, date, remarks, createdBy: req.user?._id || null, createdByRole: req.user?.role || "user" }],
                    session ? { session } : {}
                );
                header = headerArr[0];
                await Sequence.findOneAndUpdate(
                    { _id: "stockOutDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true, session }
                );
            } else if (location && String(header.location) !== String(location)) {
                header.location = location;
                await header.save(session ? { session } : {});
            }

            const issuedItems = [];
            const updatedProductIds = new Set();

            for (const item of items) {
                if (item.isDeleted) continue;
                const targetProductId = item.productId || item.stockId;

                // ── Input validation ──────────────────────────────────────────────────────
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
                    const err = new Error('Quantity must be a positive integer greater than zero');
                    err.statusCode = 400;
                    throw err;
                }

                const rawDisc = item.discountPercentage !== undefined ? item.discountPercentage : (body.discountPercentage !== undefined ? body.discountPercentage : 0);
                const itemDiscPct = Number(rawDisc || 0);
                if (isNaN(itemDiscPct) || itemDiscPct < 0 || itemDiscPct > 100) {
                    const err = new Error(`Invalid discount percentage (${rawDisc}) for item`);
                    err.statusCode = 400;
                    throw err;
                }

                let pId = String(targetProductId);
                const productDoc = await Product.findById(pId).session(session);
                if (!productDoc) {
                    const err = new Error(`Product not found for ID: ${pId}`);
                    err.statusCode = 404;
                    throw err;
                }

                // ── Pre-validation: check total available ─────────────────────────────────
                // (FEFO sorted, positive qty only)
                const balancesForCheck = await StockBalance.find({
                    productId: mongoose.Types.ObjectId(pId),
                    quantity: { $gt: 0 }
                }).sort({ expiry: 1, createdAt: 1 }).session(session);

                const totalAvailable = balancesForCheck.reduce((sum, b) => sum + (b.quantity || 0), 0);
                if (totalAvailable < requestedQty) {
                    const err = new Error(`Insufficient stock for "${productDoc.name}". Requested: ${requestedQty}, Available: ${totalAvailable}`);
                    err.statusCode = 409;
                    err.code = 'INSUFFICIENT_STOCK';
                    err.availableQuantity = totalAvailable;
                    err.requestedQuantity = requestedQty;
                    err.productName = productDoc.name;
                    throw err;
                }

                // ── Atomic FEFO batch deduction ───────────────────────────────────────────
                // Use findOneAndUpdate with a $gte guard to prevent race conditions.
                // If the batch was consumed by a concurrent request between our check
                // and our update, the update will find no matching document and we
                // fall through to the next batch — or throw INSUFFICIENT_STOCK.
                let remaining = requestedQty;
                for (const bal of balancesForCheck) {
                    if (remaining <= 0) break;

                    const takeQty = Math.min(remaining, bal.quantity);

                    // Atomic: only deduct if the batch still has >= takeQty units
                    const updatedBal = await StockBalance.findOneAndUpdate(
                        {
                            _id: bal._id,
                            quantity: { $gte: takeQty }   // ← TOCTOU guard
                        },
                        { $inc: { quantity: -takeQty } },
                        { new: true, session }
                    );

                    if (!updatedBal) {
                        // Concurrent request consumed this batch — re-check total available
                        const recheck = await StockBalance.find({
                            productId: mongoose.Types.ObjectId(pId),
                            quantity: { $gt: 0 }
                        }).session(session);
                        const recheckTotal = recheck.reduce((s, b) => s + (b.quantity || 0), 0);
                        const err = new Error(`Insufficient stock for "${productDoc.name}". Requested: ${remaining}, Available: ${recheckTotal}`);
                        err.statusCode = 409;
                        err.code = 'INSUFFICIENT_STOCK';
                        err.availableQuantity = recheckTotal;
                        err.requestedQuantity = requestedQty;
                        err.productName = productDoc.name;
                        throw err;
                    }

                    const prevQty = bal.quantity; // before deduction (pre-recorded from check above)
                    const newQty = updatedBal.quantity;

                    const itemPrice = Number(item.sellingPrice ?? bal.sellingPrice ?? 0);
                    const itemTotal = Math.round((takeQty * itemPrice) * 100) / 100;
                    const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                    const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                    const outItemArr = await StockOutItem.create(
                        [{
                            stockOutHeaderId: header._id,
                            productId: pId,
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
                        locationId: location,
                        batchNumber: bal.batchNumber || "",
                        expiry: bal.expiry,
                        quantityDelta: -takeQty,
                        previousBalance: prevQty,
                        newBalance: newQty,
                        unitCost: bal.purchasingPrice || 0,
                        sellingPrice: Number(item.sellingPrice ?? bal.sellingPrice ?? 0),
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
                    // Batches ran out mid-loop despite pre-check — race condition fallback
                    const finalCheck = await StockBalance.find({
                        productId: mongoose.Types.ObjectId(pId), quantity: { $gt: 0 }
                    }).session(session);
                    const finalTotal = finalCheck.reduce((s, b) => s + (b.quantity || 0), 0);
                    const err = new Error(`Insufficient stock for "${productDoc.name}". Requested: ${requestedQty}, Available: ${finalTotal}`);
                    err.statusCode = 409;
                    err.code = 'INSUFFICIENT_STOCK';
                    err.availableQuantity = finalTotal;
                    err.requestedQuantity = requestedQty;
                    err.productName = productDoc.name;
                    throw err;
                }

                updatedProductIds.add(pId);
            }

            for (const pId of updatedProductIds) {
                await recalculateRunningBalances(pId, session);
            }

            await updateHeaderTotals(header._id, session);
            const updatedHeader = await StockOutHeader.findById(header._id).session(session).lean();

            return { header: updatedHeader, items: issuedItems };
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

            if (useTransaction) {
                try {
                    const result = await executeCreate(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({ msg: 'success', result: { ...result.header, items: result.items } });
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
                            const result = await executeCreate(null);
                            return res.status(200).json({ msg: 'success', result: { ...result.header, items: result.items } });
                        } catch (fallbackError) {
                            return handleError(fallbackError, res);
                        }
                    }
                    return handleError(txError, res);
                }
            } else {
                try {
                    const result = await executeCreate(null);
                    return res.status(200).json({ msg: 'success', result: { ...result.header, items: result.items } });
                } catch (fallbackError) {
                    return handleError(fallbackError, res);
                }
            }
        } catch (err) {
            console.error('createStockOut outer error:', err);
            return res.status(500).json({ msg: 'error', error: err.message });
        }
    },

    async stockOuts(req, res) {
        return stockOutController.createStockOut(req, res);
    },

    async stockOutAgainByDocNo(req, res) {
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
                const subTotal = items.reduce((sum, i) => sum + (i.itemTotal !== undefined && i.itemTotal !== 0 ? i.itemTotal : ((i.quantity || 0) * (i.sellingPrice || 0))), 0);
                const totalDiscount = items.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
                const grandTotal = items.reduce((sum, i) => sum + (i.netTotal !== undefined && i.netTotal !== 0 ? i.netTotal : ((i.quantity || 0) * (i.sellingPrice || 0) - (i.discountAmount || 0))), 0);
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

            const subTotal = items.reduce((sum, item) => sum + (item.itemTotal !== undefined && item.itemTotal !== 0 ? item.itemTotal : ((item.quantity || 0) * (item.sellingPrice || 0))), 0);
            const totalDiscount = items.reduce((sum, item) => sum + (item.discountAmount || 0), 0);
            const grandTotal = items.reduce((sum, item) => sum + (item.netTotal !== undefined && item.netTotal !== 0 ? item.netTotal : ((item.quantity || 0) * (item.sellingPrice || 0) - (item.discountAmount || 0))), 0);

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
                    const iTotal = item.itemTotal !== undefined && item.itemTotal !== 0 ? item.itemTotal : ((item.quantity || 0) * (item.sellingPrice || 0));
                    const dAmt = item.discountAmount || 0;
                    const nTotal = item.netTotal !== undefined && item.netTotal !== 0 ? item.netTotal : (iTotal - dAmt);
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
                        if (oldExpiry) {
                            bal = await StockBalance.findOne({
                                productId: oldProductId,
                                expiry: oldExpiry
                            }).session(session);
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
                                    expiry: oldExpiry || null,
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
                        } else {
                            await StockBalance.create(
                                [{
                                    productId: oldProductId,
                                    expiry: oldExpiry || null,
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
                if (mongoose.Types.ObjectId.isValid(paramId)) {
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
                if (mongoose.Types.ObjectId.isValid(bodyId)) {
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

                // Match exact batchNumber and expiry if available
                let bal = null;
                if (item.batchNumber && item.expiry) {
                    bal = await StockBalance.findOne({
                        productId: productId,
                        batchNumber: item.batchNumber,
                        expiry: item.expiry
                    }).session(session);
                }
                if (!bal && item.expiry) {
                    bal = await StockBalance.findOne({
                        productId: productId,
                        expiry: item.expiry
                    }).session(session);
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
                            expiry: item.expiry || null,
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
