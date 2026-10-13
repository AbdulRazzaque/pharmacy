const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const moment = require('moment');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Product = require('../models/ProductModule');
const StockBalance = require('../models/StockBalanceModule');
const InventoryTransaction = require('../models/InventoryTransactionModule');
const StockOutItem = require('../models/StockOutItemModule');
const { normalizeExpiryDate, getExpiryKey } = require('../utils/inventoryGroupingHelper');

async function reconcileInventory({ isDryRun = true, createBackup = false } = {}) {
  const mongoUri = process.env.MONGODB || 'mongodb://127.0.0.1:27017/pharmacy';
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  PHARMACARE INVENTORY RECONCILIATION & AUDIT TOOL`);
  console.log(`  Mode: ${isDryRun ? 'DRY-RUN (No changes applied)' : 'EXECUTE (Applying changes)'}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Step 1: Backup if requested
  if (!isDryRun && createBackup) {
    const backupDir = path.join(__dirname, '../backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = moment().format('YYYYMMDD_HHmmss');
    const allBalances = await StockBalance.find({}).lean();
    const allTxns = await InventoryTransaction.find({}).lean();

    const backupFile = path.join(backupDir, `inventory_backup_${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      stockBalancesCount: allBalances.length,
      inventoryTransactionsCount: allTxns.length,
      stockBalances: allBalances,
      inventoryTransactions: allTxns
    }, null, 2));

    console.log(`[BACKUP] Created verified backup with ${allBalances.length} balances at: ${backupFile}\n`);
  }

  // Step 2: Fetch all products, balances, and transactions
  const products = await Product.find({ isDeleted: { $ne: true } }).lean();
  const balances = await StockBalance.find({}).lean();
  const txns = await InventoryTransaction.find({}).lean();

  console.log(`[INVENTORY SCAN] Found ${products.length} products, ${balances.length} StockBalance documents, ${txns.length} InventoryTransactions.\n`);

  // Step 3: Analyze Ledger vs StockBalance per product
  const productDiscrepancies = [];
  const identicalDuplicates = [];
  const negativeBalances = [];
  const orphanBalances = [];
  const expiryTimezoneShifts = [];

  // Group transactions by productId
  const txnsByProduct = new Map();
  for (const t of txns) {
    const pid = String(t.productId);
    if (!txnsByProduct.has(pid)) txnsByProduct.set(pid, []);
    txnsByProduct.get(pid).push(t);
  }

  // Group balances by productId
  const balancesByProduct = new Map();
  for (const b of balances) {
    const pid = String(b.productId);
    if (!balancesByProduct.has(pid)) balancesByProduct.set(pid, []);
    balancesByProduct.get(pid).push(b);
  }

  for (const p of products) {
    const pid = String(p._id);
    const prodBalances = balancesByProduct.get(pid) || [];
    const prodTxns = txnsByProduct.get(pid) || [];

    // Sum ledger net delta
    const ledgerNet = prodTxns.reduce((sum, t) => sum + (Number(t.quantityDelta) || 0), 0);
    // Sum stock balance quantity
    const sbTotal = prodBalances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

    if (ledgerNet !== sbTotal) {
      productDiscrepancies.push({
        productId: pid,
        productName: p.name,
        companyName: p.companyName,
        ledgerNet,
        sbTotal,
        discrepancy: sbTotal - ledgerNet
      });
    }

    // Check for identical batch fragments (same product, same normalized expiry, same clean batchNumber, same location)
    const batchGroupMap = new Map();
    for (const b of prodBalances) {
      if ((b.quantity || 0) < 0) {
        negativeBalances.push({ productId: pid, productName: p.name, balanceId: b._id, quantity: b.quantity });
      }

      const normExp = normalizeExpiryDate(b.expiry);
      const expKey = getExpiryKey(b.expiry);
      const cleanBatch = (b.batchNumber || '').trim();
      const locKey = b.locationId ? String(b.locationId) : 'none';
      const key = `${expKey}__${cleanBatch}__${locKey}`;

      if (!batchGroupMap.has(key)) batchGroupMap.set(key, []);
      batchGroupMap.get(key).push(b);

      // Check timezone precision on stored expiry
      if (b.expiry) {
        const rawDate = new Date(b.expiry);
        if (normExp && rawDate.getTime() !== normExp.getTime()) {
          expiryTimezoneShifts.push({
            balanceId: b._id,
            productName: p.name,
            raw: rawDate.toISOString(),
            normalized: normExp.toISOString()
          });
        }
      }
    }

    for (const [key, group] of batchGroupMap.entries()) {
      if (group.length > 1) {
        identicalDuplicates.push({
          productId: pid,
          productName: p.name,
          key,
          records: group.map(g => ({ _id: g._id, quantity: g.quantity, expiry: g.expiry, batchNumber: g.batchNumber }))
        });
      }
    }
  }

  // Check orphan balances (balances with no product or deleted product)
  for (const b of balances) {
    const pid = String(b.productId);
    const prodExists = products.some(p => String(p._id) === pid);
    if (!prodExists) {
      orphanBalances.push({ balanceId: b._id, productId: b.productId, quantity: b.quantity });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════════════════════
  console.log('--- RECONCILIATION AUDIT FINDINGS ---');
  console.log(`1. Ledger vs StockBalance Discrepancies: ${productDiscrepancies.length} products`);
  if (productDiscrepancies.length > 0) {
    productDiscrepancies.forEach(d => {
      console.log(`   - ${d.productName} (${d.companyName}): Ledger = ${d.ledgerNet}, StockBalance = ${d.sbTotal} (Diff: ${d.discrepancy > 0 ? '+' : ''}${d.discrepancy})`);
    });
  }

  console.log(`\n2. Identical Batch Fragments (exact same batch & expiry): ${identicalDuplicates.length} groups`);
  if (identicalDuplicates.length > 0) {
    identicalDuplicates.forEach(dup => {
      const totalQty = dup.records.reduce((s, r) => s + (r.quantity || 0), 0);
      console.log(`   - ${dup.productName} [${dup.key}]: ${dup.records.length} duplicate records (Combined Qty: ${totalQty})`);
      dup.records.forEach(r => console.log(`       ID: ${r._id} | Qty: ${r.quantity} | Batch: "${r.batchNumber}" | Expiry: ${r.expiry ? new Date(r.expiry).toISOString().slice(0, 10) : 'none'}`));
    });
  }

  console.log(`\n3. Negative Stock Balances: ${negativeBalances.length}`);
  if (negativeBalances.length > 0) {
    negativeBalances.forEach(nb => console.log(`   - ${nb.productName} (ID: ${nb.balanceId}): Qty = ${nb.quantity}`));
  }

  console.log(`\n4. Orphan Stock Balances (unmatched product): ${orphanBalances.length}`);
  if (orphanBalances.length > 0) {
    orphanBalances.forEach(ob => console.log(`   - ID: ${ob.balanceId} | Product: ${ob.productId} | Qty: ${ob.quantity}`));
  }

  console.log(`\n5. Timezone/Timestamp Shift Inconsistencies: ${expiryTimezoneShifts.length}`);
  if (expiryTimezoneShifts.length > 0) {
    expiryTimezoneShifts.slice(0, 5).forEach(ts => console.log(`   - ${ts.productName} (ID: ${ts.balanceId}): Raw ${ts.raw} -> Norm ${ts.normalized}`));
  }

  // Step 4: If --execute flag is passed, safely normalize and consolidate identical batch duplicates
  if (!isDryRun) {
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  APPLYING SAFE CONSOLIDATION FOR IDENTICAL BATCH FRAGMENTS');
    console.log('═══════════════════════════════════════════════════════════════════');

    let consolidatedCount = 0;
    for (const dup of identicalDuplicates) {
      const records = dup.records;
      // Sort: keep record with highest quantity as primary
      records.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));
      const primary = records[0];
      const duplicates = records.slice(1);
      const duplicateIds = duplicates.map(d => d._id);
      const totalQty = records.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
      const normExp = normalizeExpiryDate(primary.expiry);

      // Update primary record
      await StockBalance.findByIdAndUpdate(primary._id, {
        $set: {
          quantity: totalQty,
          expiry: normExp,
          batchNumber: (primary.batchNumber || '').trim()
        }
      });

      // Repoint references
      await StockOutItem.updateMany(
        { stockBalanceId: { $in: duplicateIds } },
        { $set: { stockBalanceId: primary._id } }
      );
      await InventoryTransaction.updateMany(
        { stockBalanceId: { $in: duplicateIds } },
        { $set: { stockBalanceId: primary._id } }
      );

      // Remove redundant fragments
      await StockBalance.deleteMany({ _id: { $in: duplicateIds } });
      consolidatedCount += duplicates.length;

      console.log(`[CONSOLIDATED] ${dup.productName}: kept primary ${primary._id}, merged ${duplicates.length} fragments into Qty = ${totalQty}`);
    }

    // Normalize stored expiry dates
    let normalizedDatesCount = 0;
    for (const ts of expiryTimezoneShifts) {
      await StockBalance.findByIdAndUpdate(ts.balanceId, {
        $set: { expiry: new Date(ts.normalized) }
      });
      normalizedDatesCount++;
    }

    console.log(`\n[SUCCESS] Completed consolidation: ${consolidatedCount} redundant fragments merged, ${normalizedDatesCount} expiry dates normalized.`);
  } else {
    console.log('\n[NOTICE] Dry run complete. To apply changes, run with: node scripts/reconcileStockBalances.js --execute --backup');
  }

  return {
    discrepanciesCount: productDiscrepancies.length,
    identicalDuplicatesCount: identicalDuplicates.length,
    negativeBalancesCount: negativeBalances.length,
    orphanBalancesCount: orphanBalances.length,
    expiryTimezoneShiftsCount: expiryTimezoneShifts.length
  };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const createBackup = args.includes('--backup');

  reconcileInventory({ isDryRun: !isExecute, createBackup })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Reconciliation error:', err);
      process.exit(1);
    });
}

module.exports = reconcileInventory;
