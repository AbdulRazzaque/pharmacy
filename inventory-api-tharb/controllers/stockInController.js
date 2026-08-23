const mongoose = require('mongoose');
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockInHeader = require("../models/StockInHeaderModule");
const StockInItem = require("../models/StockInItemModule");
const StockOutItem = require("../models/StockOutItemModule");
const Product = require("../models/ProductModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");

const isAdminRole = (role) => (role || '').toLowerCase() === 'admin';

const getNextStockInDocNo = async (session = null) => {
    const seqDoc = await Sequence.findOneAndUpdate(
        { _id: "stockInDocument" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
    return Number(seqDoc.seq);
};

async function resolveSellingPriceForStockIn(productId, adminSellingPrice) {
    if (adminSellingPrice != null && !Number.isNaN(adminSellingPrice)) {
        return adminSellingPrice;
    }
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

        // 4. Synchronize selling price across all StockOutItem & InventoryTransaction records for this batch
        if (priceChanged && newSellingPrice > 0) {
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
        try {
            let { productName, productId, supplierId, supplierDocNo, quantity, purchasingPrice, sellingPrice, expiry, docNo, unit, date, remarks, isNewDocument } = req.body;

            const userIsAdmin = isAdminRole(req.user?.role);
            let parsedPurchasing = 0;
            if (purchasingPrice != null && purchasingPrice !== '') {
                parsedPurchasing = parseFloat(purchasingPrice);
                if (Number.isNaN(parsedPurchasing)) {
                    return res.status(400).send({ msg: "invalid purchasing price" });
                }
            } else if (userIsAdmin) {
                return res.status(400).send({ msg: "purchasing price is required for admin" });
            }

            if (!productName || !productId || !supplierId || !supplierDocNo || !quantity || !expiry || !unit) {
                return res.status(400).send({ msg: "fill all required fields" });
            }

            let parsedSelling = null;
            if (userIsAdmin && sellingPrice != null && sellingPrice !== '') {
                parsedSelling = parseFloat(sellingPrice);
                if (Number.isNaN(parsedSelling)) {
                    return res.status(400).send({ msg: "invalid selling price" });
                }
            } else if (!userIsAdmin && sellingPrice != null && sellingPrice !== '') {
                return res.status(403).send({ msg: "only admin can set selling price" });
            }

            parsedSelling = await resolveSellingPriceForStockIn(
                productId,
                userIsAdmin ? parsedSelling : null
            );

            quantity = parseInt(quantity, 10);
            purchasingPrice = parsedPurchasing;
            let parsedDocNo = Number(docNo);
            if (!parsedDocNo) {
                parsedDocNo = await getNextStockInDocNo();
            }

            const parsedExpiry = new Date(expiry);

            let header = await StockInHeader.findOne({ docNo: parsedDocNo });
            if (!header) {
                header = await StockInHeader.create({
                    docNo: parsedDocNo,
                    supplierDocNo,
                    supplier: supplierId,
                    date: date ? new Date(date) : new Date(),
                    remarks: remarks || "",
                    createdBy: req.user?._id || null,
                    createdByRole: req.user?.role || "user"
                });
                await Sequence.findOneAndUpdate(
                    { _id: "stockInDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true }
                );
            }

            const item = await StockInItem.create({
                stockInHeaderId: header._id,
                productId,
                quantity,
                purchasingPrice,
                sellingPrice: parsedSelling,
                expiry: parsedExpiry,
                unit,
                remarks: remarks || ""
            });

            await updateStockBalanceAndTransaction({
                productId,
                quantityDelta: quantity,
                unitCost: purchasingPrice,
                sellingPrice: parsedSelling,
                expiry: parsedExpiry,
                transactionType: "STOCK_IN",
                referenceType: "StockIn",
                referenceId: item._id,
                docNo: parsedDocNo,
                createdBy: req.user?._id,
                remarks: remarks || "Stock In"
            });

            return res.status(200).json({ msg: "success", result: item });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ msg: "error", error: err.message });
        }
    },

    async stockInAgainByDocNo(req, res) {
        return stockInController.stockIn(req, res);
    },

    async getStockInDocNo(req, res) {
        try {
            const nextDocNo = await getNextStockInDocNo();
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
                .populate("productId", "name companyName type unit");

            const formatted = [{
                _id: { docNo: header.docNo },
                doc: items.map(item => ({
                    _id: item._id,
                    name: item.productId?.name || "",
                    supplier: header.supplier,
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
                const items = await StockInItem.find({ stockInHeaderId: h._id }).lean();
                const totalQuantity = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
                const uniqueProducts = new Set(items.map(i => String(i.productId)));
                return {
                    _id: h._id,
                    docNo: h.docNo,
                    supplierDocNo: h.supplierDocNo || "",
                    supplier: h.supplier,
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
                const { _id, productId, quantity, purchasingPrice, sellingPrice, expiry, remarks, isDeleted } = update;
                if (!_id || String(_id).startsWith("new_")) {
                    if (isDeleted) continue;
                    const itemArr = await StockInItem.create(
                        [{
                            stockInHeaderId: header._id,
                            productId,
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
                } else {
                    const item = await StockInItem.findById(_id).session(session);
                    if (!item) continue;

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
            const { quantity, purchasingPrice, sellingPrice, expiry, remarks, supplier } = req.body || {};
            const item = await StockInItem.findById(id);
            if (!item) return res.status(404).json({ msg: "not found" });

            if (supplier) {
                await StockInHeader.findByIdAndUpdate(item.stockInHeaderId, { supplier });
            }

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
