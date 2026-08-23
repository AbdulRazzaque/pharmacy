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
            const location = body.location || body.locationId;
            let parsedDocNo = Number(body.docNo);
            if (!parsedDocNo) {
                parsedDocNo = await getNextStockOutDocNo();
            }

            const date = body.date ? new Date(body.date) : new Date();
            const remarks = body.remarks || body.doctorName || body.trainerName || "";

            let items = [];
            if (Array.isArray(body.items) && body.items.length > 0) {
                items = body.items;
            } else if (body.productId || body.stockId) {
                items = [{
                    productId: body.productId || body.stockId,
                    quantity: body.quantity,
                    sellingPrice: body.sellingPrice,
                    remarks
                }];
            }

            if (!location || items.length === 0) {
                return res.status(400).json({ msg: "Bad Request", result: "location and items are required" });
            }

            let header = await StockOutHeader.findOne({ docNo: parsedDocNo });
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
            }

            const issuedItems = [];
            const updatedProductIds = new Set();

            for (const item of items) {
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
        return stockOutController.getStockOutDocs(req, res);
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
        return stockOutController.createStockOut(req, res);
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
                    await InventoryTransaction.deleteMany({ referenceId: item._id });
                    await StockOutItem.findByIdAndDelete(id);
                    await recalculateRunningBalances(item.productId);
                }
            } else if (docNo) {
                const header = await StockOutHeader.findOne({ docNo: Number(docNo) });
                if (header) {
                    const items = await StockOutItem.find({ stockOutHeaderId: header._id });
                    for (const item of items) {
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
