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
    await StockBalance.deleteMany({ productId: pId }, session ? { session } : {});
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

  const { normalizeExpiryDate } = require("./stockBalanceHelper");

  // Group by (batchNumber, normalized expiry) across all transactions to update StockBalances
  const batchMap = new Map();
  for (const t of txns) {
    const normExp = normalizeExpiryDate(t.expiry);
    const expKey = normExp ? normExp.toISOString().slice(0, 10) : 'no-expiry';
    const batchKey = (t.batchNumber || '').trim();
    const key = `${batchKey}|${expKey}`;

    if (!batchMap.has(key)) {
      batchMap.set(key, {
        batchNumber: batchKey,
        expiry: normExp,
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

  // If any batch ended up with negative balance (e.g. from an unbatched/mismatched stock out),
  // offset that deficit against positive batches so total StockBalance strictly equals total transaction quantity
  let negativeDeficit = 0;
  for (const item of batchMap.values()) {
    if (item.quantity < 0) {
      negativeDeficit += Math.abs(item.quantity);
      item.quantity = 0;
    }
  }

  if (negativeDeficit > 0) {
    for (const item of batchMap.values()) {
      if (item.quantity > 0) {
        const deduct = Math.min(item.quantity, negativeDeficit);
        item.quantity -= deduct;
        negativeDeficit -= deduct;
        if (negativeDeficit === 0) break;
      }
    }
  }

  // Fetch authoritative Product selling price
  const Product = require("../models/ProductModule");
  const product = await Product.findById(pId).session(session);
  const authoritativeSellingPrice = product ? Number(product.sellingPrice || 0) : 0;

  // Preserve existing StockBalance documents in-place to keep their stable _id (stockBalanceId)
  const existingBalances = await StockBalance.find({ productId: pId }).session(session);
  const matchedBalanceIds = new Set();

  for (const [key, item] of batchMap.entries()) {
    const finalPrice = authoritativeSellingPrice > 0 ? authoritativeSellingPrice : (item.sellingPrice || 0);

    // Find existing balance for this batch & normalized expiry
    let existingBal = existingBalances.find(b => {
      const bBatch = (b.batchNumber || '').trim();
      const bExp = normalizeExpiryDate(b.expiry);
      const bExpKey = bExp ? bExp.toISOString().slice(0, 10) : 'no-expiry';
      const targetExpKey = item.expiry ? item.expiry.toISOString().slice(0, 10) : 'no-expiry';
      return bBatch === item.batchNumber && bExpKey === targetExpKey && !matchedBalanceIds.has(String(b._id));
    });

    if (existingBal) {
      matchedBalanceIds.add(String(existingBal._id));
      existingBal.quantity = Math.max(0, item.quantity);
      existingBal.expiry = item.expiry;
      existingBal.batchNumber = item.batchNumber;
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

  // Remove zero-quantity or duplicate balances that were not matched to any active batch
  for (const b of existingBalances) {
    if (!matchedBalanceIds.has(String(b._id))) {
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
