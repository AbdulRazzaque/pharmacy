const mongoose = require('mongoose');
const InventoryTransaction = require("../models/InventoryTransactionModule");
const StockBalance = require("../models/StockBalanceModule");

const recalculateRunningBalances = async (productId, session = null) => {
  if (!productId) return;
  const pId = new mongoose.Types.ObjectId(String(productId));

  // Find all transactions for this product sorted chronologically
  const txns = await InventoryTransaction.find({ productId: pId })
    .sort({ date: 1, createdAt: 1 })
    .session(session);

  if (!txns || txns.length === 0) {
    return;
  }

  let running = 0;
  for (const t of txns) {
    const prev = running;
    running += t.quantityDelta;
    t.previousBalance = prev;
    t.newBalance = Math.max(0, running);
    await t.save(session ? { session } : {});
  }

  // Group by (batchNumber, expiry) across all transactions to update StockBalances
  const batchMap = new Map();
  for (const t of txns) {
    const expKey = t.expiry ? new Date(t.expiry).toISOString() : 'no-expiry';
    const batchKey = t.batchNumber || '';
    const key = `${batchKey}|${expKey}`;

    if (!batchMap.has(key)) {
      batchMap.set(key, {
        batchNumber: batchKey,
        expiry: t.expiry || null,
        quantity: 0,
        purchasingPrice: t.unitCost || 0,
        sellingPrice: t.sellingPrice || 0
      });
    }

    const item = batchMap.get(key);
    item.quantity += t.quantityDelta;
    if (t.unitCost) item.purchasingPrice = t.unitCost;
    if (t.sellingPrice) item.sellingPrice = t.sellingPrice;
  }

  // Fetch authoritative Product selling price
  const Product = require("../models/ProductModule");
  const product = await Product.findById(pId).session(session);
  const authoritativeSellingPrice = product ? Number(product.sellingPrice || 0) : 0;

  // Preserve existing StockBalance documents in-place to keep their stable _id (stockBalanceId)
  const existingBalances = await StockBalance.find({ productId: pId }).session(session);
  const matchedBalanceIds = new Set();

  for (const item of batchMap.values()) {
    const finalPrice = authoritativeSellingPrice > 0 ? authoritativeSellingPrice : (item.sellingPrice || 0);

    // Find existing balance for this batch & expiry
    let existingBal = existingBalances.find(b => {
      const bBatch = b.batchNumber || '';
      const iBatch = item.batchNumber || '';
      const bExp = b.expiry ? new Date(b.expiry).getTime() : null;
      const iExp = item.expiry ? new Date(item.expiry).getTime() : null;
      return bBatch === iBatch && bExp === iExp;
    });

    if (existingBal) {
      matchedBalanceIds.add(String(existingBal._id));
      existingBal.quantity = Math.max(0, item.quantity);
      existingBal.purchasingPrice = item.purchasingPrice || existingBal.purchasingPrice || 0;
      existingBal.sellingPrice = finalPrice;
      await existingBal.save(session ? { session } : {});
    } else if (item.quantity > 0) {
      const newArr = await StockBalance.create(
        [{
          productId: pId,
          locationId: null,
          batchNumber: item.batchNumber,
          expiry: item.expiry,
          quantity: item.quantity,
          purchasingPrice: item.purchasingPrice,
          sellingPrice: finalPrice
        }],
        session ? { session } : {}
      );
      matchedBalanceIds.add(String(newArr[0]._id));
    }
  }

  // Remove zero-quantity or orphaned duplicate balances that were not in active batches
  for (const b of existingBalances) {
    if (!matchedBalanceIds.has(String(b._id)) && (b.quantity || 0) <= 0) {
      await StockBalance.findByIdAndDelete(b._id, session ? { session } : {});
    }
  }

  if (authoritativeSellingPrice > 0) {
    await StockBalance.updateMany(
      { productId: pId },
      { $set: { sellingPrice: authoritativeSellingPrice } },
      session ? { session } : {}
    );
  }
};

module.exports = recalculateRunningBalances;
