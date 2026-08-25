const mongoose = require('mongoose');
const StockBalance = require("../models/StockBalanceModule");
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockOutHeader = require("../models/StockOutHeaderModule");
const StockOutItem = require("../models/StockOutItemModule");
const Product = require("../models/ProductModule");
const Sequence = require("../models/SequenceModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");

const getNextStockOutDocNo = async (session = null) => {
    const seqDoc = await Sequence.findOneAndUpdate(
        { _id: "stockOutDocument" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true, session }
    );
    return Number(seqDoc.seq);
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
        try {
            const body = req.body || {};
            let parsedDocNo = Number(body.docNo);
            if (!parsedDocNo) {
                parsedDocNo = await getNextStockOutDocNo();
            }

            let existingHeader = await StockOutHeader.findOne({ docNo: parsedDocNo });

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
                return res.status(400).json({ msg: "Bad Request", result: "location and items are required" });
            }

            let header = existingHeader;
            if (!header) {
                header = await StockOutHeader.create({
                    docNo: parsedDocNo,
                    location,
                    date,
                    remarks,
                    createdBy: req.user?._id || null,
                    createdByRole: req.user?.role || "user"
                });
                await Sequence.findOneAndUpdate(
                    { _id: "stockOutDocument" },
                    { $max: { seq: parsedDocNo } },
                    { upsert: true }
                );
            } else if (location && String(header.location) !== String(location)) {
                header.location = location;
                await header.save();
            }

            const issuedItems = [];
            const updatedProductIds = new Set();

            for (const item of items) {
                if (item.isDeleted) continue;
                const targetProductId = item.productId || item.stockId;
                const requestedQty = Number(item.quantity || 0);
                if (!targetProductId || requestedQty <= 0) continue;

                let pId = String(targetProductId);
                const productDoc = await Product.findById(pId);
                if (!productDoc) {
                    return res.status(404).json({ msg: "error", error: `Product not found for ID: ${pId}` });
                }

                // FEFO / FIFO Batch Allocation from StockBalances
                const balances = await StockBalance.find({
                    productId: mongoose.Types.ObjectId(pId),
                    quantity: { $gt: 0 }
                }).sort({ expiry: 1, createdAt: 1 });

                const totalAvailable = balances.reduce((sum, b) => sum + (b.quantity || 0), 0);
                if (totalAvailable < requestedQty) {
                    return res.status(400).json({
                        msg: "error",
                        error: `Insufficient stock for "${productDoc.name}". Requested: ${requestedQty}, Available: ${totalAvailable}`
                    });
                }

                let remaining = requestedQty;
                for (const bal of balances) {
                    if (remaining <= 0) break;

                    const takeQty = Math.min(remaining, bal.quantity);
                    const prevQty = bal.quantity;
                    bal.quantity -= takeQty;
                    await bal.save();

                    const outItem = await StockOutItem.create({
                        stockOutHeaderId: header._id,
                        productId: pId,
                        quantity: takeQty,
                        sellingPrice: Number(item.sellingPrice ?? bal.sellingPrice ?? 0),
                        purchasingPrice: bal.purchasingPrice || 0,
                        expiry: bal.expiry,
                        batchNumber: bal.batchNumber || "",
                        remarks: item.remarks || remarks || ""
                    });

                    const txn = new InventoryTransaction({
                        productId: pId,
                        locationId: location,
                        batchNumber: bal.batchNumber || "",
                        expiry: bal.expiry,
                        quantityDelta: -takeQty,
                        previousBalance: prevQty,
                        newBalance: bal.quantity,
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
                    await txn.save();

                    issuedItems.push(outItem);
                    remaining -= takeQty;
                }
                updatedProductIds.add(pId);
            }

            for (const pId of updatedProductIds) {
                await recalculateRunningBalances(pId);
            }

            return res.status(200).json({
                msg: "success",
                result: {
                    ...header.toObject(),
                    items: issuedItems
                }
            });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ msg: "error", error: err.message });
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

            const formatted = [{
                _id: { docNo: header.docNo },
                doc: items.map(item => ({
                    _id: item._id,
                    docNo: header.docNo,
                    name: item.productId?.name || "",
                    location: locationObj,
                    locationId: locationId,
                    locationName: locationName,
                    doctorName: doctorName,
                    trainerName: trainerName,
                    productId: item.productId,
                    quantity: item.quantity,
                    unit: item.productId?.unit || "",
                    sellingPrice: item.sellingPrice,
                    purchasingPrice: item.purchasingPrice,
                    prevQuantity: 0,
                    expiry: item.expiry,
                    createdAt: item.createdAt,
                    remarks: item.remarks
                }))
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
            const { id } = req.params;
            const { quantity, sellingPrice, locationId, location, doctorName, trainerName } = req.body || {};

            const item = await StockOutItem.findById(id);
            if (!item) return res.status(404).json({ msg: "error", result: "Stock Out item not found" });

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

            if (!header) {
                const headerArr = await StockOutHeader.create(
                    [{
                        docNo: parsedDocNo,
                        location: docLocation || null,
                        date: new Date(),
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
            } else if (docLocation && String(header.location) !== String(docLocation)) {
                header.location = docLocation;
                await header.save(session ? { session } : {});
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

                        const outItemArr = await StockOutItem.create(
                            [{
                                stockOutHeaderId: header._id,
                                productId: pId,
                                quantity: takeQty,
                                sellingPrice: Number(sellingPrice ?? bal.sellingPrice ?? 0),
                                purchasingPrice: bal.purchasingPrice || 0,
                                expiry: bal.expiry,
                                batchNumber: bal.batchNumber || "",
                                remarks: remarks || "Stock Out added via bulk update"
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

                    const pId = String(item.productId);

                    // 2a. Delete item
                    if (isDeleted) {
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
                            bal.quantity = (bal.quantity || 0) + (item.quantity || 0);
                            await bal.save(session ? { session } : {});
                        } else {
                            await StockBalance.create(
                                [{
                                    productId: item.productId,
                                    expiry: item.expiry || null,
                                    quantity: item.quantity || 0,
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
                        touchedProductIds.add(pId);
                    } 
                    // 2b. Update item
                    else {
                        const oldQty = Number(item.quantity || 0);
                        const newQty = quantity !== undefined ? Number(quantity) : oldQty;
                        const diff = newQty - oldQty;

                        if (diff > 0) {
                            const balances = await StockBalance.find({
                                productId: mongoose.Types.ObjectId(pId),
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

                        item.quantity = newQty;
                        if (sellingPrice !== undefined && sellingPrice !== null) {
                            item.sellingPrice = Number(sellingPrice);
                        }
                        if (remarks !== undefined) {
                            item.remarks = remarks;
                        }
                        await item.save(session ? { session } : {});

                        await InventoryTransaction.updateMany(
                            { referenceId: item._id },
                            {
                                $set: {
                                    quantityDelta: -newQty,
                                    sellingPrice: item.sellingPrice,
                                    locationId: header.location || undefined
                                }
                            },
                            session ? { session } : {}
                        );

                        touchedProductIds.add(pId);
                    }
                }
            }

            for (const pId of touchedProductIds) {
                await recalculateRunningBalances(pId, session);
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
        try {
            const { id, docNo } = req.body || req.params || {};
            if (id) {
                const item = await StockOutItem.findById(id);
                if (item) {
                    // Return stock balance
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
                        bal.quantity = (bal.quantity || 0) + (item.quantity || 0);
                        await bal.save();
                    }

                    await InventoryTransaction.deleteMany({ referenceId: item._id });
                    await StockOutItem.findByIdAndDelete(id);
                    await recalculateRunningBalances(item.productId);
                }
            } else if (docNo) {
                const header = await StockOutHeader.findOne({ docNo: Number(docNo) });
                if (header) {
                    const items = await StockOutItem.find({ stockOutHeaderId: header._id });
                    for (const item of items) {
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
                            bal.quantity = (bal.quantity || 0) + (item.quantity || 0);
                            await bal.save();
                        }

                        await InventoryTransaction.deleteMany({ referenceId: item._id });
                        await recalculateRunningBalances(item.productId);
                    }
                    await StockOutItem.deleteMany({ stockOutHeaderId: header._id });
                    await StockOutHeader.findByIdAndDelete(header._id);
                }
            }

            return res.status(200).json({ msg: "success", result: "Deleted" });
        } catch (err) {
            return res.status(500).json({ msg: "error", error: err.message });
        }
    }
};

module.exports = stockOutController;
