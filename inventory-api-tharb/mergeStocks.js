const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const Product = require('./models/ProductModule');
require('dotenv').config();

async function mergeDuplicateStocks() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB');

    // Find all duplicate Stock documents (same product)
    const duplicates = await Stock.aggregate([
      {
        $group: {
          _id: '$product',
          count: { $sum: 1 },
          stockIds: { $push: '$_id' },
          docs: { $push: '$$ROOT' }
        }
      },
      {
        $match: { count: { $gt: 1 } }
      }
    ]);

    console.log(`Found ${duplicates.length} products with duplicate Stock documents`);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates to merge');
      await mongoose.connection.close();
      return;
    }

    const mergedResults = [];

    for (const dup of duplicates) {
      const productId = dup._id;
      const stockDocs = dup.docs;
      
      // Get product name for logging
      const product = await Product.findById(productId);
      const productName = product ? product.productName : 'Unknown';
      
      console.log(`\n📦 Merging ${stockDocs.length} Stock documents for product: ${productName} (${productId})`);
      stockDocs.forEach((doc, i) => {
        console.log(`  ${i + 1}. Stock ID: ${doc._id}, Quantity: ${doc.totalQuantity}`);
      });

      // Keep the first Stock document as primary
      const primaryStock = stockDocs[0];
      const duplicateDocs = stockDocs.slice(1);

      // Merge expiry arrays
      const expiryMap = new Map();
      
      // Add primary stock expiries
      if (primaryStock.expiryArray && primaryStock.expiryArray.length > 0) {
        primaryStock.expiryArray.forEach(exp => {
          const key = new Date(exp.expiry).toISOString();
          expiryMap.set(key, {
            expiry: exp.expiry,
            quantity: exp.quantity,
            movements: exp.movements || [],
            prevQuantity: exp.prevQuantity
          });
        });
      }

      // Merge duplicate stock expiries
      duplicateDocs.forEach(dupStock => {
        if (dupStock.expiryArray && dupStock.expiryArray.length > 0) {
          dupStock.expiryArray.forEach(exp => {
            const key = new Date(exp.expiry).toISOString();
            if (expiryMap.has(key)) {
              const existing = expiryMap.get(key);
              existing.quantity += exp.quantity;
              existing.movements = [...existing.movements, ...(exp.movements || [])];
            } else {
              expiryMap.set(key, {
                expiry: exp.expiry,
                quantity: exp.quantity,
                movements: exp.movements || [],
                prevQuantity: exp.prevQuantity
              });
            }
          });
        }
      });

      const mergedExpiryArray = Array.from(expiryMap.values());

      // Merge other arrays
      let mergedStockIn = [...(primaryStock.stockIn || [])];
      let mergedStockOut = [...(primaryStock.stockOut || [])];
      let mergedStockHistory = [...(primaryStock.stockHistory || [])];
      let mergedMovements = [...(primaryStock.movements || [])];

      duplicateDocs.forEach(dupStock => {
        mergedStockIn = [...mergedStockIn, ...(dupStock.stockIn || [])];
        mergedStockOut = [...mergedStockOut, ...(dupStock.stockOut || [])];
        mergedStockHistory = [...mergedStockHistory, ...(dupStock.stockHistory || [])];
        mergedMovements = [...mergedMovements, ...(dupStock.movements || [])];
      });

      // Recalculate total quantity
      const newTotalQuantity = mergedExpiryArray.reduce((sum, exp) => sum + exp.quantity, 0);

      console.log(`  Combined total quantity: ${newTotalQuantity}`);

      // Update primary Stock document
      await Stock.findByIdAndUpdate(primaryStock._id, {
        expiryArray: mergedExpiryArray,
        totalQuantity: newTotalQuantity,
        stockIn: mergedStockIn,
        stockOut: mergedStockOut,
        stockHistory: mergedStockHistory,
        movements: mergedMovements
      });

      // Delete duplicate Stock documents
      const duplicateIds = duplicateDocs.map(doc => doc._id);
      await Stock.deleteMany({ _id: { $in: duplicateIds } });

      console.log(`  ✅ Merged into Stock ID: ${primaryStock._id}`);
      console.log(`  🗑️  Deleted ${duplicateIds.length} duplicate(s)`);

      mergedResults.push({
        productName,
        productId,
        primaryStockId: primaryStock._id,
        deletedStockIds: duplicateIds,
        oldTotal: stockDocs.reduce((sum, doc) => sum + doc.totalQuantity, 0),
        newTotal: newTotalQuantity,
        expiryBatchCount: mergedExpiryArray.length
      });
    }

    console.log('\n\n📊 MERGE SUMMARY:');
    console.log('='.repeat(80));
    mergedResults.forEach((result, i) => {
      console.log(`${i + 1}. ${result.productName}`);
      console.log(`   Product ID: ${result.productId}`);
      console.log(`   Primary Stock: ${result.primaryStockId}`);
      console.log(`   Deleted ${result.deletedStockIds.length} duplicate(s)`);
      console.log(`   Total Quantity: ${result.oldTotal} → ${result.newTotal}`);
      console.log(`   Expiry Batches: ${result.expiryBatchCount}`);
      console.log('');
    });

    console.log('✅ All duplicates merged successfully!');
    
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    
  } catch (error) {
    console.error('❌ Error merging duplicate stocks:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run the merge
mergeDuplicateStocks();
