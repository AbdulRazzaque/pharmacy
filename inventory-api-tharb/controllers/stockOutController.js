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

                    const rawDisc = item.discountPercentage !== undefined ? item.discountPercentage : (body.discountPercentage !== undefined ? body.discountPercentage : 0);
                    const itemDiscPct = Number(rawDisc || 0);
                    if (isNaN(itemDiscPct) || itemDiscPct < 0 || itemDiscPct > 100) {
                        return res.status(400).json({ msg: "error", error: `Invalid discount percentage (${rawDisc}) for item` });
                    }
                    const itemPrice = Number(item.sellingPrice ?? bal.sellingPrice ?? 0);
                    const itemTotal = Math.round((takeQty * itemPrice) * 100) / 100;
                    const discountAmount = Math.round((itemTotal * itemDiscPct / 100) * 100) / 100;
                    const netTotal = Math.round((itemTotal - discountAmount) * 100) / 100;

                    const outItem = await StockOutItem.create({
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

            await updateHeaderTotals(header._id);
            const updatedHeader = await StockOutHeader.findById(header._id).lean();

            return res.status(200).json({
                msg: "success",
                result: {
                    ...updatedHeader,
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
                        productId: item.productId,
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
            const { id } = req.params;
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
