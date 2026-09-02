const mongoose = require('mongoose')
const Product = require("../models/ProductModule")
const StockBalance = require("../models/StockBalanceModule")
const SellingPriceHistory = require("../models/SellingPriceHistoryModule")
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken")
const _ = require("lodash")
const slugify = require("slugify")
class ProductController {
    async getProduct(req, res) {
        res.send("home routre user")
    }

    async createProduct(req, res) {

        const { name, companyName, type, unit, requiresExpiry } = req.body;

        if (!name || !companyName || !type || !unit) {

            res.status(400).send("Data Missing")

        } else {

            try {

                let slug = slugify(name, {
                    lower: true,
                    strict: true
                })

                const existingSlug = await Product.findOne({ slug })

                if (existingSlug) {
                    slug = `${slug}-${Date.now()}`
                }

                const existingProduct = await Product.findOne({
                    name,
                    companyName,
                    type,
                    unit
                })

                if (existingProduct) {
                    return res.status(400).send("Product Already Exist")
                }

                const newProduct = new Product({

                    name,
                    slug,
                    companyName,
                    type,
                    unit,
                    requiresExpiry: requiresExpiry !== false,

                    createdBy: req.user?._id || null,

                    createdByRole: req.user?.role || 'user',

                    history: [{
                        action: 'created',
                        performedBy: req.user?._id,
                        performedByRole: req.user?.role,
                        timestamp: new Date(),
                        changes: {
                            name,
                            slug,
                            companyName,
                            type,
                            unit
                        }
                    }]
                })

                const newProdResponse = await newProduct.save()

                res.status(200).send({
                    msg: "Product added successfully",
                    result: newProdResponse
                })

            } catch (error) {

                res.status(500).send({
                    msg: "error",
                    error: error.message
                })
            }
        }
    }
    async updateProduct(req, res) {

        const { name, companyName, type, unit, productId, requiresExpiry } = req.body;

        const id = req.params.id || productId;

        if (!name || !companyName || !type || !unit) {
            return res.status(400).send("Data Missing");
        }

        try {

            // Find Existing Product
            const product = await Product.findById(id);

            if (!product) {
                return res.status(404).send("Product not found");
            }

            // Generate Slug
            let slug = slugify(name, {
                lower: true,
                strict: true
            });

            // Check Duplicate Slug
            const existingSlug = await Product.findOne({
                slug,
                _id: { $ne: id }
            });

            if (existingSlug) {
                slug = `${slug}-${Date.now()}`;
            }

            // Check Duplicate Product
            const existingProduct = await Product.findOne({
                name,
                companyName,
                type,
                unit,
                _id: { $ne: id }
            });

            if (existingProduct) {
                return res.status(400).send("Product Already Exist");
            }

            // Track Changes
            const changes = {};

            if (product.name !== name) {
                changes.name = {
                    old: product.name,
                    new: name
                };
            }

            if (product.slug !== slug) {
                changes.slug = {
                    old: product.slug,
                    new: slug
                };
            }

            if (product.companyName !== companyName) {
                changes.companyName = {
                    old: product.companyName,
                    new: companyName
                };
            }

            if (product.type !== type) {
                changes.type = {
                    old: product.type,
                    new: type
                };
            }

            if (product.unit !== unit) {
                changes.unit = {
                    old: product.unit,
                    new: unit
                };
            }

            const nextRequiresExpiry = requiresExpiry !== false;
            if (product.requiresExpiry !== nextRequiresExpiry) {
                changes.requiresExpiry = {
                    old: product.requiresExpiry !== false,
                    new: nextRequiresExpiry
                };
            }

            // Update Product
            const result = await Product.updateOne(

                { _id: mongoose.Types.ObjectId(id) },

                {
                    $set: {
                        name,
                        slug,
                        companyName,
                        type,
                        unit,
                        requiresExpiry: nextRequiresExpiry,

                        updatedBy: req.user?._id,

                        updatedByRole: req.user?.role
                    },

                    $push: {
                        history: {
                            action: 'updated',

                            performedBy: req.user?._id,

                            performedByRole: req.user?.role,

                            timestamp: new Date(),

                            changes
                        }
                    }
                }
            );

            return res.status(200).send({
                msg: "Product updated successfully",
                result
            });

        } catch (error) {

            return res.status(500).send({
                msg: "error",
                error: error.message
            });
        }
    }

    async getAllProducts(req, res) {
        Product.find({ isDeleted: false }) // Only return non-deleted products
            .populate('createdBy', 'userName role')
            .populate('updatedBy', 'userName role')
            .populate('history.performedBy', 'userName role')
            .sort({ name: 1 })
            .then(response => {
                res.status(200).send({ msg: "success", result: response })
            })
            .catch(err => {
                res.status(500).send({ msg: "error", error: err.message })
            })
    }

    async getAllProductType(req, res) {
        Product.find({}, { type: 1 })
            .then(response => {
                res.status(200).send({ msg: "success", result: response })
            })
    }

    async deleteProduct(req, res, next) {
        try {
            // Soft delete instead of hard delete
            const product = await Product.findByIdAndUpdate(
                req.params.id,
                {
                    $set: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: req.user?._id,
                        deletedByRole: req.user?.role
                    },
                    $push: {
                        history: {
                            action: 'deleted',
                            performedBy: req.user?._id,
                            performedByRole: req.user?.role,
                            timestamp: new Date(),
                            changes: { isDeleted: true }
                        }
                    }
                },
                { new: true }
            );

            if (!product) {
                return res.status(404).send("Product not found");
            }
            res.json({ msg: "Product deleted successfully", result: product });
        } catch (error) {
            res.status(500).send({ msg: "error", error: error.message });
        }
    }

    // Migration: Update products with null createdBy
    async fixNullCreatedBy(req, res) {
        try {
            const result = await Product.updateMany(
                { createdBy: null },
                {
                    $set: {
                        createdBy: req.user._id,
                        createdByRole: req.user.role
                    }
                }
            );
            res.status(200).send({
                msg: "success",
                result: `Updated ${result.modifiedCount} products`
            });
        } catch (error) {
            res.status(500).send({ msg: "error", error: error.message });
        }
    }

    /**
     * Bulk import products from parsed Excel rows (admin only).
     * STRICT ALL-OR-NOTHING PIPELINE:
     * 1. Validate ALL rows & detect intra-file duplicates.
     * 2. Detect database duplicates via bulk $in queries.
     * 3. IF ANY ROW HAS AN ERROR (validation error, intra-file duplicate, or database duplicate):
     *    REJECT THE ENTIRE FILE IMMEDIATELY. 0 PRODUCTS INSERTED.
     * 4. IF AND ONLY IF 0 ERRORS EXIST ACROSS ALL ROWS:
     *    Execute bulk insertion inside a MongoDB Transaction session.
     *    If any database write error occurs, abort transaction (rollback -> 0 inserted).
     */
    async bulkImportProducts(req, res) {
        const rows = req.body?.rows;
        if (!Array.isArray(rows)) {
            return res.status(400).json({ msg: 'error', error: 'rows must be a non-empty array' });
        }
        if (rows.length === 0) {
            return res.status(400).json({ msg: 'error', error: 'No rows to import' });
        }
        if (rows.length > 10000) {
            return res.status(400).json({ msg: 'error', error: 'Maximum 10,000 rows per import' });
        }

        const userId = req.user?._id;
        const userRole = req.user?.role || 'admin';

        const compositeKey = (name, companyName, type, unit) =>
            [name, companyName, type, unit].map(s => (s || '').trim().toLowerCase()).join('\u0001');

        try {
            // Stage 1: Attribute Validation & Excel Intra-file Duplicate Detection
            const invalidRows = [];
            const excelDuplicates = [];
            const validCandidates = [];
            const batchCompositeSet = new Set();

            for (let i = 0; i < rows.length; i++) {
                const excelRow = i + 2;
                const raw = rows[i] || {};
                const name = raw.name != null ? String(raw.name).trim() : '';
                const companyName = raw.companyName != null ? String(raw.companyName).trim() : '';
                const type = raw.type != null ? String(raw.type).trim() : '';
                const unit = raw.unit != null ? String(raw.unit).trim() : '';

                // Missing required fields check
                const missingFields = [];
                if (!name) missingFields.push('name');
                if (!companyName) missingFields.push('companyName');
                if (!type) missingFields.push('type');
                if (!unit) missingFields.push('unit');

                if (missingFields.length > 0) {
                    invalidRows.push({
                        row: excelRow,
                        name,
                        companyName,
                        type,
                        unit,
                        reason: `Missing required field(s): ${missingFields.join(', ')}`
                    });
                    continue;
                }

                // Intra-Excel Duplicate Check
                const key = compositeKey(name, companyName, type, unit);
                if (batchCompositeSet.has(key)) {
                    excelDuplicates.push({
                        row: excelRow,
                        name,
                        companyName,
                        type,
                        unit,
                        reason: `Duplicate row inside Excel file: ${name} | ${companyName} | ${type} | ${unit}`
                    });
                    continue;
                }

                batchCompositeSet.add(key);
                validCandidates.push({
                    excelRow,
                    name,
                    companyName,
                    type,
                    unit,
                    compositeKey: key
                });
            }

            // Stage 2: Database Duplicate Check via Bulk $in Queries
            const [allSlugs, activeProducts] = await Promise.all([
                Product.find({}).select('slug').lean(),
                Product.find({ isDeleted: { $ne: true } })
                    .select('name companyName type unit')
                    .lean()
            ]);

            const existingSlugSet = new Set(
                allSlugs.map((d) => d.slug).filter(Boolean)
            );
            const existingCompositeSet = new Set(
                activeProducts.map((d) =>
                    compositeKey(d.name, d.companyName, d.type, d.unit)
                )
            );

            const databaseDuplicates = [];
            const toProcess = [];

            for (const cand of validCandidates) {
                if (existingCompositeSet.has(cand.compositeKey)) {
                    databaseDuplicates.push({
                        row: cand.excelRow,
                        name: cand.name,
                        companyName: cand.companyName,
                        type: cand.type,
                        unit: cand.unit,
                        reason: `Product already exists in database: ${cand.name} | ${cand.companyName} | ${cand.type} | ${cand.unit}`
                    });
                    continue;
                }
                toProcess.push(cand);
            }

            // STRICT ALL-OR-NOTHING GUARD CHECK:
            // If ANY single row has an error (invalid fields, intra-file duplicate, or DB duplicate),
            // REJECT THE ENTIRE FILE IMMEDIATELY. ZERO PRODUCTS INSERTED.
            const totalErrors = invalidRows.length + excelDuplicates.length + databaseDuplicates.length;
            if (totalErrors > 0) {
                return res.status(200).json({
                    success: false,
                    message: `Import rejected. ${totalErrors} row(s) contain validation or duplicate errors. 0 products inserted.`,
                    msg: 'validation_error',
                    total: rows.length,
                    inserted: 0,
                    excelDuplicatesCount: excelDuplicates.length,
                    databaseDuplicatesCount: databaseDuplicates.length,
                    invalidCount: invalidRows.length,
                    failedCount: 0,
                    // Backward-compatibility keys for existing frontend
                    totalRows: rows.length,
                    successCount: 0,
                    duplicateSkipped: excelDuplicates.length + databaseDuplicates.length,
                    failed: [...invalidRows],
                    duplicateErrors: [...excelDuplicates, ...databaseDuplicates].map(d => ({
                        row: d.row,
                        message: `${d.name} | ${d.unit} | ${d.type} | ${d.companyName}`
                    })),
                    details: {
                        excelDuplicates,
                        databaseDuplicates,
                        invalidRows,
                        failedRows: []
                    }
                });
            }

            // Stage 3: Collision-Safe Slug Generation & Document Construction
            const batchSlugSet = new Set();
            const bulkOps = [];

            const historyTemplate = (fields, slug) => ({
                action: 'created',
                performedBy: userId,
                performedByRole: userRole,
                timestamp: new Date(),
                changes: {
                    name: fields.name,
                    slug,
                    companyName: fields.companyName,
                    type: fields.type,
                    unit: fields.unit
                }
            });

            for (const cand of toProcess) {
                const baseSlug = slugify(cand.name, { lower: true, strict: true }) || 'product';
                let slug = baseSlug;
                let counter = 1;

                while (existingSlugSet.has(slug) || batchSlugSet.has(slug)) {
                    const compSlug = slugify(`${cand.name}-${cand.companyName}`, { lower: true, strict: true });
                    if (counter === 1 && compSlug && !existingSlugSet.has(compSlug) && !batchSlugSet.has(compSlug)) {
                        slug = compSlug;
                    } else {
                        slug = `${baseSlug}-${counter}`;
                    }
                    counter++;
                }

                existingSlugSet.add(slug);
                batchSlugSet.add(slug);

                const newDoc = {
                    _id: new mongoose.Types.ObjectId(),
                    name: cand.name,
                    slug,
                    companyName: cand.companyName,
                    type: cand.type,
                    unit: cand.unit,
                    requiresExpiry: true,
                    createdBy: userId || null,
                    createdByRole: userRole,
                    isDeleted: false,
                    history: [historyTemplate({ name: cand.name, companyName: cand.companyName, type: cand.type, unit: cand.unit }, slug)]
                };

                bulkOps.push({
                    insertOne: {
                        document: newDoc
                    }
                });
            }

            // Stage 4: Transactional Bulk Write Execution (Rollback on any DB failure)
            let session = null;
            try {
                session = await mongoose.startSession();
                session.startTransaction();
            } catch (sessErr) {
                session = null;
            }

            let insertedCount = 0;

            try {
                if (session) {
                    try {
                        const resWrite = await Product.bulkWrite(bulkOps, { session, ordered: true });
                        await session.commitTransaction();
                        insertedCount = resWrite.insertedCount || bulkOps.length;
                    } catch (txnErr) {
                        await session.abortTransaction();
                        // Fallback for standalone local MongoDB nodes that do not support replica set transactions
                        if (txnErr.message && (txnErr.message.includes('replica set') || txnErr.message.includes('Transaction numbers'))) {
                            const resWrite = await Product.bulkWrite(bulkOps, { ordered: true });
                            insertedCount = resWrite.insertedCount || bulkOps.length;
                        } else {
                            throw txnErr;
                        }
                    }
                } else {
                    const resWrite = await Product.bulkWrite(bulkOps, { ordered: true });
                    insertedCount = resWrite.insertedCount || bulkOps.length;
                }
            } catch (writeErr) {
                console.error("bulkImportProducts transaction error:", writeErr);
                return res.status(200).json({
                    success: false,
                    message: `Database insertion failed: ${writeErr.message}. 0 products inserted.`,
                    msg: 'database_error',
                    total: rows.length,
                    inserted: 0,
                    excelDuplicatesCount: 0,
                    databaseDuplicatesCount: 0,
                    invalidCount: 0,
                    failedCount: bulkOps.length,
                    totalRows: rows.length,
                    successCount: 0,
                    duplicateSkipped: 0,
                    failed: [{ row: null, message: `Database error: ${writeErr.message}` }],
                    duplicateErrors: [],
                    details: {
                        excelDuplicates: [],
                        databaseDuplicates: [],
                        invalidRows: [],
                        failedRows: [{ row: null, message: writeErr.message }]
                    }
                });
            } finally {
                if (session) {
                    try { session.endSession(); } catch (e) {}
                }
            }

            return res.status(200).json({
                success: true,
                message: 'Products imported successfully.',
                msg: 'success',
                total: rows.length,
                inserted: insertedCount,
                excelDuplicatesCount: 0,
                databaseDuplicatesCount: 0,
                invalidCount: 0,
                failedCount: 0,
                totalRows: rows.length,
                successCount: insertedCount,
                duplicateSkipped: 0,
                failed: [],
                duplicateErrors: [],
                details: {
                    excelDuplicates: [],
                    databaseDuplicates: [],
                    invalidRows: [],
                    failedRows: []
                }
            });
        } catch (error) {
            console.error("bulkImportProducts error:", error);
            return res.status(500).json({
                msg: 'error',
                error: error.message
            });
        }
    }

    // Get product history
    async getProductHistory(req, res) {
        try {
            const product = await Product.findById(req.params.id)
                .populate('history.performedBy', 'userName role department')
                .populate('createdBy', 'userName role')
                .populate('updatedBy', 'userName role')
                .populate('deletedBy', 'userName role');

            if (!product) {
                return res.status(404).send({ msg: "error", error: "Product not found" });
            }

            res.status(200).send({
                msg: "success",
                result: {
                    product: {
                        name: product.name,
                        companyName: product.companyName,
                        type: product.type,
                        unit: product.unit,
                        createdAt: product.createdAt,
                        updatedAt: product.updatedAt,
                        isDeleted: product.isDeleted,
                        createdBy: product.createdBy,
                        updatedBy: product.updatedBy,
                        deletedBy: product.deletedBy
                    },
                    history: product.history
                }
            });
        } catch (error) {
            res.status(500).send({ msg: "error", error: error.message });
        }
    }

    // Update Selling Price for a product
    async updateSellingPrice(req, res) {
        try {
            const { productId, newSellingPrice } = req.body;
            const id = req.body.id || productId;

            if (!id) {
                return res.status(400).send({ msg: "error", error: "Product ID is required" });
            }

            const priceNum = parseFloat(newSellingPrice);
            if (newSellingPrice === undefined || newSellingPrice === null || newSellingPrice === "" || isNaN(priceNum)) {
                return res.status(400).send({ msg: "error", error: "Invalid selling price" });
            }

            if (priceNum < 0) {
                return res.status(400).send({ msg: "error", error: "Selling price cannot be negative" });
            }

            const product = await Product.findById(id);
            if (!product) {
                return res.status(404).send({ msg: "error", error: "Product not found" });
            }

            // Determine current/old selling price
            let oldPrice = product.sellingPrice ?? 0;
            if (oldPrice === 0) {
                const firstStock = await StockBalance.findOne({ productId: product._id, sellingPrice: { $gt: 0 } });
                if (firstStock) {
                    oldPrice = firstStock.sellingPrice || 0;
                }
            }

            const roundedOld = Math.round(oldPrice * 100) / 100;
            const roundedNew = Math.round(priceNum * 100) / 100;

            if (roundedOld === roundedNew && product.sellingPrice === roundedNew) {
                return res.status(200).send({
                    msg: "unchanged",
                    message: "Price is unchanged. No history entry created.",
                    result: product
                });
            }

            // Update Product model
            product.sellingPrice = roundedNew;
            product.updatedBy = req.user?._id || req.userDetails?._id;
            product.updatedByRole = req.user?.role || req.userDetails?.role || 'admin';
            await product.save();

            // Update all StockBalance documents for this product
            await StockBalance.updateMany(
                { productId: product._id },
                { $set: { sellingPrice: roundedNew } }
            );

            // Create SellingPriceHistory record
            const userObj = req.user || req.userDetails || {};
            const userName = userObj.userName || "Admin";

            const historyRecord = await SellingPriceHistory.create({
                productId: product._id,
                productName: product.name,
                companyName: product.companyName || "",
                oldSellingPrice: roundedOld,
                newSellingPrice: roundedNew,
                updatedBy: userObj._id || null,
                updatedByName: userName,
                updatedByRole: userObj.role || "admin"
            });

            return res.status(200).send({
                msg: "success",
                message: "Selling price updated successfully",
                result: product,
                history: historyRecord
            });

        } catch (error) {
            console.error("updateSellingPrice error:", error);
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    // Get selling price history audit trail for a product
    async getSellingPriceHistory(req, res) {
        try {
            const productId = req.params.productId || req.params.id || req.query.productId;
            if (!productId) {
                return res.status(400).send({ msg: "error", error: "Product ID required" });
            }

            const history = await SellingPriceHistory.find({ productId })
                .populate('updatedBy', 'userName role department')
                .sort({ createdAt: -1 })
                .lean();

            return res.status(200).send({
                msg: "success",
                result: history
            });
        } catch (error) {
            console.error("getSellingPriceHistory error:", error);
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    // Get ALL selling price history audit records with optional filters
    async getAllSellingPriceHistory(req, res) {
        try {
            const { fromDate, toDate, search, companyName, updatedBy } = req.query;
            const query = {};

            if (fromDate || toDate) {
                query.createdAt = {};
                if (fromDate) {
                    const start = new Date(fromDate);
                    start.setHours(0, 0, 0, 0);
                    query.createdAt.$gte = start;
                }
                if (toDate) {
                    const end = new Date(toDate);
                    end.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = end;
                }
            }

            if (companyName) {
                query.companyName = { $regex: companyName, $options: 'i' };
            }

            if (updatedBy) {
                query.updatedByName = { $regex: updatedBy, $options: 'i' };
            }

            let history = await SellingPriceHistory.find(query)
                .populate('updatedBy', 'userName role department')
                .sort({ createdAt: -1 })
                .lean();

            if (search && search.trim()) {
                const s = search.trim().toLowerCase();
                history = history.filter(item =>
                    (item.productName || '').toLowerCase().includes(s) ||
                    (item.companyName || '').toLowerCase().includes(s) ||
                    (item.updatedByName || '').toLowerCase().includes(s)
                );
            }

            return res.status(200).send({
                msg: "success",
                result: history
            });
        } catch (error) {
            console.error("getAllSellingPriceHistory error:", error);
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

    // Bulk Update Selling Prices
    async bulkUpdateSellingPrices(req, res) {
        try {
            const { updates } = req.body; // Array of { productId, newSellingPrice }
            if (!Array.isArray(updates) || updates.length === 0) {
                return res.status(400).send({ msg: "error", error: "Updates array is required" });
            }

            const userObj = req.user || req.userDetails || {};
            const userName = userObj.userName || "Admin";
            const userId = userObj._id || null;
            const userRole = userObj.role || "admin";

            const results = [];
            const historyRecords = [];
            let skippedCount = 0;

            for (const item of updates) {
                const { productId, newSellingPrice } = item;
                if (!productId) continue;

                const priceNum = parseFloat(newSellingPrice);
                if (isNaN(priceNum) || priceNum < 0) continue;

                const product = await Product.findById(productId);
                if (!product) continue;

                let oldPrice = product.sellingPrice ?? 0;
                if (oldPrice === 0) {
                    const firstStock = await StockBalance.findOne({ productId: product._id, sellingPrice: { $gt: 0 } });
                    if (firstStock) {
                        oldPrice = firstStock.sellingPrice || 0;
                    }
                }

                const roundedOld = Math.round(oldPrice * 100) / 100;
                const roundedNew = Math.round(priceNum * 100) / 100;

                if (roundedOld === roundedNew && product.sellingPrice === roundedNew) {
                    skippedCount++;
                    continue;
                }

                product.sellingPrice = roundedNew;
                product.updatedBy = userId;
                product.updatedByRole = userRole;
                await product.save();

                await StockBalance.updateMany(
                    { productId: product._id },
                    { $set: { sellingPrice: roundedNew } }
                );

                const historyRecord = await SellingPriceHistory.create({
                    productId: product._id,
                    productName: product.name,
                    companyName: product.companyName || "",
                    oldSellingPrice: roundedOld,
                    newSellingPrice: roundedNew,
                    updatedBy: userId,
                    updatedByName: userName,
                    updatedByRole: userRole
                });

                results.push({ productId: product._id, name: product.name, oldPrice: roundedOld, newPrice: roundedNew });
                historyRecords.push(historyRecord);
            }

            return res.status(200).send({
                msg: "success",
                message: `Updated ${results.length} product price(s). ${skippedCount} unchanged.`,
                updatedCount: results.length,
                skippedCount,
                results,
                historyRecords
            });
        } catch (error) {
            console.error("bulkUpdateSellingPrices error:", error);
            return res.status(500).send({ msg: "error", error: error.message });
        }
    }

}

const productController = new ProductController();
module.exports = productController;