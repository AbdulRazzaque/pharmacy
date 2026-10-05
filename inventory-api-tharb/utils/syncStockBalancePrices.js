const mongoose = require('mongoose');
const Product = require('../models/ProductModule');
const StockBalance = require('../models/StockBalanceModule');

/**
 * Synchronizes selling prices across all existing StockBalance records.
 * In our system, selling price belongs to the PRODUCT (by exact productId),
 * not independently to each old stock batch.
 *
 * This function finds all products that have an active sellingPrice > 0,
 * and updates any StockBalance records for that exact productId whose
 * sellingPrice does not match the product's sellingPrice.
 */
async function syncStockBalancePrices() {
  try {
    const products = await Product.find({
      isDeleted: { $ne: true },
      sellingPrice: { $gt: 0 }
    }).select('_id name sellingPrice').lean();

    let totalUpdated = 0;
    for (const p of products) {
      const res = await StockBalance.updateMany(
        {
          productId: p._id,
          sellingPrice: { $ne: p.sellingPrice }
        },
        { $set: { sellingPrice: p.sellingPrice } }
      );
      if (res.modifiedCount > 0) {
        totalUpdated += res.modifiedCount;
      }
    }

    if (totalUpdated > 0) {
      console.log(`[syncStockBalancePrices] Synchronized selling prices for ${totalUpdated} StockBalance batches to match product selling price.`);
    }
    return totalUpdated;
  } catch (err) {
    console.error('[syncStockBalancePrices] Error syncing stock balance selling prices:', err);
    return 0;
  }
}

module.exports = syncStockBalancePrices;
