const mongoose = require('mongoose');
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockInHeader = require("../models/StockInHeaderModule");
const StockInItem = require("../models/StockInItemModule");
const StockOutItem = require("../models/StockOutItemModule");
const Product = require("../models/ProductModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");
const { recordSellingPriceChangeIfModified } = require("../utils/sellingPriceHistoryHelper");

const isAdminRole = (role) => (role || '').toLowerCase() === 'admin';

const getPreviewStockInDocNo = async (session = null) => {
    let query = StockInHeader.findOne({ docNo: { $exists: true, $ne: null } }).sort({ docNo: -1 }).select('docNo');
    if (session) query = query.session(session);
    const maxHeader = await query.lean();
    const maxHeaderDocNo = (maxHeader && !isNaN(Number(maxHeader.docNo))) ? Number(maxHeader.docNo) : 0;

    let seqQuery = Sequence.findById("stockInDocument");
    if (session) seqQuery = seqQuery.session(session);
    const seqDoc = await seqQuery.lean();
    const currentSeq = (seqDoc && !isNaN(Number(seqDoc.seq))) ? Number(seqDoc.seq) : 0;

    return Math.max(maxHeaderDocNo, currentSeq) + 1;
};

const reserveNextStockInDocNo = async (session = null) => {
    let maxHeaderQuery = StockInHeader.findOne({ docNo: { $exists: true, $ne: null } }).sort({ docNo: -1 }).select('docNo');
    if (session) maxHeaderQuery = maxHeaderQuery.session(session);
    const maxHeader = await maxHeaderQuery.lean();
    const maxHeaderDocNo = (maxHeader && !isNaN(Number(maxHeader.docNo))) ? Number(maxHeader.docNo) : 0;

    const seqDoc = await Sequence.findOneAndUpdate(
        { _id: "stockInDocument" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
    let nextDocNo = Number(seqDoc.seq);

    if (maxHeaderDocNo >= nextDocNo) {
        nextDocNo = maxHeaderDocNo + 1;
        await Sequence.findOneAndUpdate(
            { _id: "stockInDocument" },
            { $set: { seq: nextDocNo } },
            { upsert: true, session }
        );
    }
    return nextDocNo;
};

async function resolveSellingPriceForStockIn(productId, adminSellingPrice) {
    if (adminSellingPrice != null && !Number.isNaN(adminSellingPrice)) {
        return adminSellingPrice;
    }
    const productDoc = await Product.findById(productId).select('sellingPrice');
    if (productDoc?.sellingPrice && productDoc.sellingPrice > 0) return productDoc.sellingPrice;
    const latestItem = await StockInItem.findOne({ productId })
        .sort({ createdAt: -1 })
        .select('sellingPrice purchasingPrice');
    if (latestItem?.sellingPrice != null) return latestItem.sellingPrice;
    return 0;
}

const updateStockBalanceAndTransaction = async ({
    productId,
    locationId = null,
    batchNumber = "",
    expiry = null,
    quantityDelta,
    unitCost = 0,
    sellingPrice = 0,
    transactionType = "STOCK_IN",
    referenceType = "StockIn",
    referenceId,
    docNo,
    createdBy,
    remarks = "",
    session = null
}) => {
    const filter = {
        productId: new mongoose.Types.ObjectId(String(productId)),
        locationId: locationId ? new mongoose.Types.ObjectId(String(locationId)) : null,
        batchNumber: batchNumber || "",
        expiry: expiry ? new Date(expiry) : null
    };

    let balance = await StockBalance.findOne(filter).session(session);
    const previousBalance = balance ? Number(balance.quantity || 0) : 0;
    const newBalance = previousBalance + Number(quantityDelta);

    if (!balance) {
        balance = new StockBalance({
            ...filter,
            quantity: Math.max(0, newBalance),
            purchasingPrice: unitCost,
            sellingPrice
        });
    } else {
        balance.quantity = Math.max(0, newBalance);
        if (unitCost) balance.purchasingPrice = unitCost;
        if (sellingPrice) balance.sellingPrice = sellingPrice;
    }
    await balance.save(session ? { session } : {});

    const txn = new InventoryTransaction({
        productId,
        locationId,
        batchNumber,
        expiry,
        quantityDelta,
        previousBalance,
        newBalance: Math.max(0, newBalance),
        unitCost,
        sellingPrice,
        transactionType,
        referenceType,
        referenceId,
        docNo,
        createdBy,
        date: new Date(),
        remarks
    });
    await txn.save(session ? { session } : {});

    return { previousBalance, newBalance };
};

const updateStockInItemHelper = async ({
    item,
    quantity,
    purchasingPrice,
    sellingPrice,
    expiry,
    remarks,
    docNo,
    reqUser,
    session = null
}) => {
    const productId = item.productId;
    const oldQty = Number(item.quantity || 0);
    const oldExpiry = item.expiry ? new Date(item.expiry) : null;

    const newQty = quantity !== undefined ? Number(quantity) : oldQty;
    const newExpiry = expiry ? new Date(expiry) : oldExpiry;
    const newPurchasingPrice = purchasingPrice !== undefined ? Number(purchasingPrice) : item.purchasingPrice;
    const newSellingPrice = sellingPrice !== undefined ? Number(sellingPrice) : item.sellingPrice;
    const newRemarks = remarks !== undefined ? remarks : item.remarks;

    const expiryChanged = oldExpiry?.getTime() !== newExpiry?.getTime();
    const qtyChanged = oldQty !== newQty;
    const priceChanged = item.purchasingPrice !== newPurchasingPrice || item.sellingPrice !== newSellingPrice;

    if (expiryChanged || qtyChanged || priceChanged || remarks !== undefined) {
        // 1. Deduct old quantity from old StockBalance batch
        if (oldExpiry) {
            let oldBalance = await StockBalance.findOne({
                productId,
                expiry: oldExpiry
            }).session(session);
            if (oldBalance) {
                oldBalance.quantity = Math.max(0, (oldBalance.quantity || 0) - oldQty);
                await oldBalance.save(session ? { session } : {});
            }
        }

        // 2. Find or create StockBalance for new expiry date
        let newBalance = await StockBalance.findOne({
            productId,
            expiry: newExpiry
        }).session(session);

        if (!newBalance) {
            newBalance = new StockBalance({
                productId,
                expiry: newExpiry,
                batchNumber: item.batchNumber || "",
                quantity: newQty,
                purchasingPrice: newPurchasingPrice,
                sellingPrice: newSellingPrice
            });
        } else {
            newBalance.quantity = (newBalance.quantity || 0) + newQty;
            newBalance.purchasingPrice = newPurchasingPrice;
            newBalance.sellingPrice = newSellingPrice;
        }
        await newBalance.save(session ? { session } : {});

        // 3. Update related InventoryTransactions for this StockInItem
        await InventoryTransaction.updateMany(
            { referenceId: item._id },
            {
                $set: {
                    expiry: newExpiry,
                    quantityDelta: newQty,
                    unitCost: newPurchasingPrice,
                    sellingPrice: newSellingPrice,
                    remarks: newRemarks
                }
            },
            session ? { session } : {}
        );

        // 4. Synchronize selling price across Product, StockBalance, StockOutItem & InventoryTransaction records for this batch
        if (priceChanged && newSellingPrice > 0) {
            await Product.findByIdAndUpdate(productId, { sellingPrice: newSellingPrice }, session ? { session } : {});
            await StockBalance.updateMany(
                { productId },
                { $set: { sellingPrice: newSellingPrice } },
                session ? { session } : {}
            );
            await StockOutItem.updateMany(
                { productId, expiry: newExpiry },
                { $set: { sellingPrice: newSellingPrice } },
                session ? { session } : {}
            );
            await InventoryTransaction.updateMany(
                { productId, expiry: newExpiry },
                { $set: { sellingPrice: newSellingPrice } },
                session ? { session } : {}
            );
        }

        // 5. Update StockInItem record
        item.quantity = newQty;
        item.expiry = newExpiry;
        item.purchasingPrice = newPurchasingPrice;
        item.sellingPrice = newSellingPrice;
        item.remarks = newRemarks;
        await item.save(session ? { session } : {});

        // 6. Recalculate running balances for this product
        await recalculateRunningBalances(productId, session);
    }
};

const stockInController = {

    async stockIn(req, res) {
        const executeStockInTx = async (session) => {
            const { items, entries, docNo, date, remarks } = req.body || {};

            let rawEntries = [];
            if (Array.isArray(items) && items.length > 0) {
                rawEntries = items;
            } else if (Array.isArray(entries) && entries.length > 0) {
                rawEntries = entries;
            } else {
                rawEntries = [req.body];
            }

            if (rawEntries.length === 0) {
                throw new Error("No stock in entries provided");
            }

            const userIsAdmin = isAdminRole(req.user?.role);

            const processedEntries = [];
            for (let i = 0; i < rawEntries.length; i++) {
                const entry = rawEntries[i];
                let { productName, productId, supplierId, supplier, supplierDocNo, quantity, purchasingPrice, sellingPrice, expiry, unit, remarks: entryRemarks } = entry;

                const actualSupplierId = supplierId || supplier;
                if (!productName || !productId || !actualSupplierId || !supplierDocNo || !quantity || !expiry || !unit) {
                    throw new Error(`Fill all required fields for entry #${i + 1}`);
                }

                let parsedPurchasing = 0;
                if (purchasingPrice != null && purchasingPrice !== '') {
                    parsedPurchasing = parseFloat(purchasingPrice);
                    if (Number.isNaN(parsedPurchasing)) {
                        throw new Error(`Invalid purchasing price for entry #${i + 1}`);
                    }
                } else if (userIsAdmin) {
                    throw new Error(`Purchasing price is required for admin in entry #${i + 1}`);
                }

                let parsedSelling = null;
                if (userIsAdmin && sellingPrice != null && sellingPrice !== '') {
                    parsedSelling = parseFloat(sellingPrice);
                    if (Number.isNaN(parsedSelling)) {
                        throw new Error(`Invalid selling price for entry #${i + 1}`);
                    }
                } else if (!userIsAdmin && sellingPrice != null && sellingPrice !== '') {
                    throw new Error(`Only admin can set selling price in entry #${i + 1}`);
                }

                parsedSelling = await resolveSellingPriceForStockIn(
                    productId,
                    userIsAdmin ? parsedSelling : null
                );

                const parsedQty = parseInt(quantity, 10);
                if (Number.isNaN(parsedQty) || parsedQty <= 0) {
                    throw new Error(`Invalid quantity for entry #${i + 1}`);
                }

                processedEntries.push({
                    productName,
                    productId,
                    supplierId: actualSupplierId,
                    supplierDocNo: String(supplierDocNo).trim(),
                    quantity: parsedQty,
                    purchasingPrice: parsedPurchasing,
                    sellingPrice: parsedSelling,
                    expiry: new Date(expiry),
                    unit,
                    remarks: entryRemarks || remarks || ""
                });
            }

            let requestedDocNo = Number(docNo || rawEntries[0]?.docNo);
            let header = null;
            let parsedDocNo = null;

            if (requestedDocNo && !Number.isNaN(requestedDocNo)) {
                let findHeaderQuery = StockInHeader.findOne({ docNo: requestedDocNo });
                if (session) findHeaderQuery = findHeaderQuery.session(session);
                header = await findHeaderQuery;
            }

            if (!header) {
                parsedDocNo = (requestedDocNo && !Number.isNaN(requestedDocNo)) ? requestedDocNo : await reserveNextStockInDocNo(session);

                let checkQuery = StockInHeader.findOne({ docNo: parsedDocNo });
                if (session) checkQuery = checkQuery.session(session);
                const existing = await checkQuery;

                if (existing) {
                    parsedDocNo = await reserveNextStockInDocNo(session);
                }

                const firstEntry = processedEntries[0];
                const headerData = {
                    docNo: parsedDocNo,
                    supplierDocNo: firstEntry.supplierDocNo || "",
                    supplier: firstEntry.supplierId || null,
                    date: date ? new Date(date) : new Date(),
                    remarks: remarks || firstEntry.remarks || "",
                    createdBy: req.user?._id || null,
                    createdByRole: req.user?.role || "user"
                };

                if (session) {
                    const createdArr = await StockInHeader.create([headerData], { session });
                    header = createdArr[0];
                } else {
                    header = await StockInHeader.create(headerData);
                }

                await Sequence.findOneAndUpdate(
                    { _id: "stockInDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true, session: session || undefined }
                );
            } else {
                parsedDocNo = header.docNo;
                await Sequence.findOneAndUpdate(
                    { _id: "stockInDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true, session: session || undefined }
                );
            }

            const createdItems = [];
            for (const entry of processedEntries) {
                const itemData = {
                    stockInHeaderId: header._id,
                    productId: entry.productId,
                    supplier: entry.supplierId,
                    supplierDocNo: entry.supplierDocNo,
                    quantity: entry.quantity,
                    purchasingPrice: entry.purchasingPrice,
                    sellingPrice: entry.sellingPrice,
                    expiry: entry.expiry,
                    unit: entry.unit,
                    remarks: entry.remarks
                };

                let item;
                if (session) {
                    const itemArr = await StockInItem.create([itemData], { session });
                    item = itemArr[0];
                } else {
                    item = await StockInItem.create(itemData);
                }

                await updateStockBalanceAndTransaction({
                    productId: entry.productId,
                    quantityDelta: entry.quantity,
                    unitCost: entry.purchasingPrice,
                    sellingPrice: entry.sellingPrice,
                    expiry: entry.expiry,
                    transactionType: "STOCK_IN",
                    referenceType: "StockIn",
                    referenceId: item._id,
                    docNo: parsedDocNo,
                    createdBy: req.user?._id,
                    remarks: entry.remarks || "Stock In",
                    session
                });

                if (entry.sellingPrice != null && entry.sellingPrice > 0) {
                    await recordSellingPriceChangeIfModified({
                        productId: entry.productId,
                        newSellingPrice: entry.sellingPrice,
                        source: "Stock In",
                        expiryDate: entry.expiry,
                        userObj: req.user,
                        session
                    });
                }

                createdItems.push(item);
            }

            return { header, items: createdItems, docNo: parsedDocNo };
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
                    const result = await executeStockInTx(session);
                    await session.commitTransaction();
                    session.endSession();
                    return res.status(200).json({ msg: "success", result: result.items[0], docNo: result.docNo, header: result.header, items: result.items });
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
                        const result = await executeStockInTx(null);
                        return res.status(200).json({ msg: "success", result: result.items[0], docNo: result.docNo, header: result.header, items: result.items });
                    } else {
                        throw txError;
                    }
                }
            } else {
                const result = await executeStockInTx(null);
                return res.status(200).json({ msg: "success", result: result.items[0], docNo: result.docNo, header: result.header, items: result.items });
            }
        } catch (err) {
            console.error("Stock in transaction error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async stockInAgainByDocNo(req, res) {
        return stockInController.stockIn(req, res);
    },

    async getStockInDocNo(req, res) {
        try {
            const nextDocNo = await getPreviewStockInDocNo();
            return res.status(200).json({ msg: "success", result: [{ docNo: nextDocNo }] });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockInByDocNo(req, res) {
        try {
            const { docNo } = req.body || {};
            if (!docNo) return res.status(400).send("docNo required");

            const header = await StockInHeader.findOne({ docNo: Number(docNo) })
                .populate("supplier")
                .populate("createdBy", "userName role");

            if (!header) return res.status(404).send("Document not found");

            const items = await StockInItem.find({ stockInHeaderId: header._id })
                .populate("productId", "name companyName type unit")
                .populate("supplier");

            const formatted = [{
                _id: { docNo: header.docNo },
                doc: items.map(item => ({
                    _id: item._id,
                    name: item.productId?.name || "",
                    companyName: item.productId?.companyName || item.companyName || "",
                    supplier: item.supplier || header.supplier,
                    supplierDocNo: item.supplierDocNo || header.supplierDocNo || "",
                    product: item.productId,
                    quantity: item.quantity,
                    unit: item.unit || item.productId?.unit || "",
                    purchasingPrice: item.purchasingPrice,
                    sellingPrice: item.sellingPrice,
                    prevQuantity: 0,
                    expiry: item.expiry,
                    createdAt: item.createdAt
                }))
            }];

            return res.status(200).json({ msg: "success", result: formatted });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async getStockInDocs(req, res) {
        try {
            const headers = await StockInHeader.find({})
                .populate("supplier")
                .populate("createdBy", "userName")
                .sort({ docNo: -1 })
                .lean();

            const docs = await Promise.all(headers.map(async (h) => {
                const items = await StockInItem.find({ stockInHeaderId: h._id })
                    .populate("supplier")
                    .lean();
                const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
                const uniqueProducts = new Set(items.map(i => String(i.productId)));
                return {
                    _id: h._id,
                    docNo: h.docNo,
                    supplierDocNo: h.supplierDocNo || (items[0]?.supplierDocNo || ""),
                    supplier: h.supplier || (items[0]?.supplier || null),
                    date: h.date || h.createdAt,
                    createdAt: h.createdAt,
                    createdBy: h.createdBy ? { _id: h.createdBy._id, userName: h.createdBy.userName } : null,
                    totalProducts: Array.from(uniqueProducts).length,
                    totalQuantity,
                    items
                };
            }));

            return res.status(200).json({ msg: "success", result: docs });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async bulkUpdate(req, res) {
        const executeUpdate = async (session) => {
            const { updates, docNo } = req.body || {};
            if (!Array.isArray(updates)) {
                throw new Error("updates must be an array");
            }

            const parsedDocNo = Number(docNo || updates[0]?.docNo || 1);
            let header = await StockInHeader.findOne({ docNo: parsedDocNo }).session(session);
            if (!header) {
                const headerArr = await StockInHeader.create(
                    [{
                        docNo: parsedDocNo,
                        date: new Date(),
                        createdBy: req.user?._id || null
                    }],
                    session ? { session } : {}
                );
                header = headerArr[0];
                await Sequence.findOneAndUpdate(
                    { _id: "stockInDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true, session }
                );
            }

            for (const update of updates) {
                const { _id, productId, quantity, purchasingPrice, sellingPrice, expiry, remarks, supplier, supplierDocNo, isDeleted } = update;
                if (!_id || String(_id).startsWith("new_")) {
                    if (isDeleted) continue;
                    const itemArr = await StockInItem.create(
                        [{
                            stockInHeaderId: header._id,
                            productId,
                            supplier: supplier || header.supplier,
                            supplierDocNo: supplierDocNo || header.supplierDocNo || "",
                            quantity: Number(quantity || 0),
                            purchasingPrice: Number(purchasingPrice || 0),
                            sellingPrice: Number(sellingPrice || 0),
                            expiry: expiry ? new Date(expiry) : null,
                            remarks: remarks || ""
                        }],
                        session ? { session } : {}
                    );
                    const item = itemArr[0];

                    await updateStockBalanceAndTransaction({
                        productId,
                        quantityDelta: Number(quantity || 0),
                        unitCost: Number(purchasingPrice || 0),
                        sellingPrice: Number(sellingPrice || 0),
                        expiry: expiry ? new Date(expiry) : null,
                        transactionType: "STOCK_IN",
                        referenceType: "StockIn",
                        referenceId: item._id,
                        docNo: parsedDocNo,
                        createdBy: req.user?._id,
                        remarks: remarks || "Stock In added via bulk update",
                        session
                    });

                    if (sellingPrice != null && Number(sellingPrice) > 0) {
                        await recordSellingPriceChangeIfModified({
                            productId,
                            newSellingPrice: Number(sellingPrice),
                            source: "Stock In",
                            expiryDate: expiry ? new Date(expiry) : null,
                            userObj: req.user,
                            session
                        });
                    }
                } else {
                    const item = await StockInItem.findById(_id).session(session);
                    if (!item) continue;

                    if (supplier) item.supplier = supplier;
                    if (supplierDocNo) item.supplierDocNo = supplierDocNo;

                    if (isDeleted) {
                        if (item.expiry) {
                            let oldBal = await StockBalance.findOne({
                                productId: item.productId,
                                expiry: item.expiry
                            }).session(session);
                            if (oldBal) {
                                oldBal.quantity = Math.max(0, (oldBal.quantity || 0) - (item.quantity || 0));
                                await oldBal.save(session ? { session } : {});
                            }
                        }

                        await InventoryTransaction.deleteMany(
                            { referenceId: item._id },
                            session ? { session } : {}
                        );

                        await StockInItem.findByIdAndDelete(_id, session ? { session } : {});
                        await recalculateRunningBalances(item.productId, session);
                    } else {
                        await updateStockInItemHelper({
                            item,
                            quantity,
                            purchasingPrice,
                            sellingPrice,
                            expiry,
                            remarks,
                            docNo: parsedDocNo,
                            reqUser: req.user,
                            session
                        });
                    }
                }
            }

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
                        console.warn('⚠️ MongoDB transaction unsupported. Retrying without transaction.');
                        const resMsg = await executeUpdate(null);
                        return res.status(200).json({ msg: "success", result: resMsg });
                    } else {
                        throw txError;
                    }
                }
            } else {
                const resMsg = await executeUpdate(null);
                return res.status(200).json({ msg: "success", result: resMsg });
            }
        } catch (err) {
            console.error("Bulk update stock in error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async stockInUpdateQuantity(req, res) {
        try {
            const { id } = req.params;
            const { quantity, purchasingPrice, sellingPrice, expiry, remarks, supplier, supplierDocNo } = req.body || {};
            const item = await StockInItem.findById(id);
            if (!item) return res.status(404).json({ msg: "not found" });

            if (supplier) {
                item.supplier = supplier;
                await StockInHeader.findByIdAndUpdate(item.stockInHeaderId, { supplier });
            }
            if (supplierDocNo) {
                item.supplierDocNo = supplierDocNo;
            }
            await item.save();

            await updateStockInItemHelper({
                item,
                quantity: quantity !== undefined ? Number(quantity) : undefined,
                purchasingPrice: purchasingPrice !== undefined ? Number(purchasingPrice) : undefined,
                sellingPrice: sellingPrice !== undefined ? Number(sellingPrice) : undefined,
                expiry: expiry ? new Date(expiry) : undefined,
                remarks,
                docNo: 0,
                reqUser: req.user,
                session: null
            });

            if (sellingPrice !== undefined && Number(sellingPrice) > 0) {
                await recordSellingPriceChangeIfModified({
                    productId: item.productId,
                    newSellingPrice: Number(sellingPrice),
                    source: "Stock In",
                    expiryDate: expiry ? new Date(expiry) : item.expiry,
                    userObj: req.user
                });
            }

            return res.status(200).json({ msg: "success", result: item });
        } catch (err) {
            console.error("stockInUpdateQuantity error:", err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async deleteStockIn(req, res) {
        try {
            const { id, docNo } = req.body || req.params || {};
            if (id) {
                const item = await StockInItem.findById(id);
                if (item) {
                    if (item.expiry) {
                        let oldBal = await StockBalance.findOne({
                            productId: item.productId,
                            expiry: item.expiry
                        });
                        if (oldBal) {
                            oldBal.quantity = Math.max(0, (oldBal.quantity || 0) - (item.quantity || 0));
                            await oldBal.save();
                        }
                    }
                    await InventoryTransaction.deleteMany({ referenceId: item._id });
                    await StockInItem.findByIdAndDelete(id);
                    await recalculateRunningBalances(item.productId);
                }
            } else if (docNo) {
                const header = await StockInHeader.findOne({ docNo: Number(docNo) });
                if (header) {
                    const items = await StockInItem.find({ stockInHeaderId: header._id });
                    for (const item of items) {
                        if (item.expiry) {
                            let oldBal = await StockBalance.findOne({
                                productId: item.productId,
                                expiry: item.expiry
                            });
                            if (oldBal) {
                                oldBal.quantity = Math.max(0, (oldBal.quantity || 0) - (item.quantity || 0));
                                await oldBal.save();
                            }
                        }
                        await InventoryTransaction.deleteMany({ referenceId: item._id });
                        await recalculateRunningBalances(item.productId);
                    }
                    await StockInItem.deleteMany({ stockInHeaderId: header._id });
                    await StockInHeader.findByIdAndDelete(header._id);
                }
            }

            return res.status(200).json({ msg: "success", result: "Deleted" });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async updateStockIn(req, res) {
        return res.status(200).json({ msg: "success" });
    }
};

module.exports = stockInController;
