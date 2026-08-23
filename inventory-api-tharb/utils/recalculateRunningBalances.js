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

  // Clean up any old location-specific or orphaned StockBalance documents for this product
  await StockBalance.deleteMany({ productId: pId }, session ? { session } : {});

  // Upsert/Update consolidated StockBalances for active batches
  for (const item of batchMap.values()) {
    if (item.quantity > 0) {
      await StockBalance.create(
        [{
          productId: pId,
          locationId: null,
          batchNumber: item.batchNumber,
          expiry: item.expiry,
          quantity: item.quantity,
          purchasingPrice: item.purchasingPrice,
          sellingPrice: item.sellingPrice
        }],
        session ? { session } : {}
      );
    }
  }
};

module.exports = recalculateRunningBalances;
