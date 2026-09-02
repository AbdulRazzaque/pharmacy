const mongoose = require('mongoose');
const SellingPriceHistory = require('../models/SellingPriceHistoryModule');
const Product = require('../models/ProductModule');
const StockBalance = require('../models/StockBalanceModule');

/**
 * Checks if selling price has changed for a product, updates Product & StockBalance,
 * and records a SellingPriceHistory entry if a change occurred.
 * Does NOT create duplicate history records if newSellingPrice === current sellingPrice.
 */
async function recordSellingPriceChangeIfModified({
    productId,
    newSellingPrice,
    source = "Selling Price Update",
    expiryDate = null,
    userObj = {},
    session = null
}) {
    if (!productId || newSellingPrice == null) return null;
    const priceNum = parseFloat(newSellingPrice);
    if (isNaN(priceNum) || priceNum < 0) return null;

    const productDoc = await Product.findById(productId).session(session);
    if (!productDoc) return null;

    let oldPrice = productDoc.sellingPrice ?? 0;
    if (oldPrice === 0) {
        const firstStock = await StockBalance.findOne({
            productId: productDoc._id,
            sellingPrice: { $gt: 0 }
        }).session(session);
        if (firstStock) {
            oldPrice = firstStock.sellingPrice || 0;
        }
    }

    const roundedOld = Math.round(oldPrice * 100) / 100;
    const roundedNew = Math.round(priceNum * 100) / 100;

    // Check if price actually changed!
    if (roundedOld === roundedNew && productDoc.sellingPrice === roundedNew) {
        return null; // No price change, skip history creation
    }

    // Update Product's current selling price
    productDoc.sellingPrice = roundedNew;
    if (userObj._id) productDoc.updatedBy = userObj._id;
    if (userObj.role) productDoc.updatedByRole = userObj.role;
    await productDoc.save(session ? { session } : {});

    // Update all StockBalance documents for this product
    await StockBalance.updateMany(
        { productId: productDoc._id },
        { $set: { sellingPrice: roundedNew } },
        session ? { session } : {}
    );

    // Resolve expiry date if not explicitly passed
    let expDate = expiryDate;
    if (!expDate) {
        const stockWithExp = await StockBalance.findOne({ productId: productDoc._id }).session(session);
        if (stockWithExp && stockWithExp.expiryArray && stockWithExp.expiryArray.length > 0) {
            const validExps = stockWithExp.expiryArray.filter(e => e.expiry).map(e => new Date(e.expiry)).sort((a, b) => a - b);
            if (validExps.length > 0) expDate = validExps[0];
        }
    }

    const userName = userObj.userName || userObj.name || "Admin";
    const userId = userObj._id || null;
    const userRole = userObj.role || "admin";

    const historyData = {
        productId: productDoc._id,
        productName: productDoc.name,
        companyName: productDoc.companyName || "",
        expiryDate: expDate ? new Date(expDate) : null,
        oldSellingPrice: roundedOld,
        newSellingPrice: roundedNew,
        source,
        updatedBy: userId,
        updatedByName: userName,
        updatedByRole: userRole
    };

    let historyRecord;
    if (session) {
        const res = await SellingPriceHistory.create([historyData], { session });
        historyRecord = res[0];
    } else {
        historyRecord = await SellingPriceHistory.create(historyData);
    }

    return historyRecord;
}

module.exports = {
    recordSellingPriceChangeIfModified
};
