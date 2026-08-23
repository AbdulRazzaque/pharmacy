const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const StockIn = require('./models/StockInModule');
const Product = require('./models/ProductModule');
const moment = require('moment');
require('dotenv').config();

async function fixStockQuantities() {
  try {
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB\n');

    // Get all Stock documents
    const allStocks = await Stock.find().populate('product');
    
    console.log(`Found ${allStocks.length} Stock documents\n`);
    
    for (const stock of allStocks) {
      const productName = stock.product?.productName || stock.name || 'Unknown';
      console.log(`\n📦 Processing: ${productName}`);
      console.log(`   Stock ID: ${stock._id}`);
      console.log(`   Current Total: ${stock.totalQuantity}`);
      
      // Get all active StockIn records for this product
      const activeStockIns = await StockIn.find({ 
        productId: stock.product,
        isDeleted: { $ne: true }
      });
      
      console.log(`   Active StockIns: ${activeStockIns.length}`);
      
      // Group by expiry date
      const expiryMap = new Map();
      
      activeStockIns.forEach(si => {
        const expiryKey = moment(si.expiry).format('YYYY-MM-DD');
        if (!expiryMap.has(expiryKey)) {
          expiryMap.set(expiryKey, {
            expiry: si.expiry,
            quantity: 0,
            price: si.price,
            stockInIds: []
          });
        }
        const batch = expiryMap.get(expiryKey);
        batch.quantity += si.quantity;
        batch.stockInIds.push(si._id);
      });
      
      // Rebuild expiryArray
      const newExpiryArray = [];
      expiryMap.forEach((batch, key) => {
        console.log(`   - ${moment(batch.expiry).format('DD/MM/YYYY')}: ${batch.quantity} qty`);
        newExpiryArray.push({
          expiry: batch.expiry,
          quantity: batch.quantity,
          price: batch.price,
          prevQuantity: 0,
          movements: [] // Keep existing movements if you want, or reset
        });
      });
      
      // Calculate new total
      const newTotal = newExpiryArray.reduce((sum, exp) => sum + exp.quantity, 0);
      
      console.log(`   New Total: ${newTotal}`);
      
      if (newTotal !== stock.totalQuantity) {
        console.log(`   ⚠️  Updating stock (${stock.totalQuantity} → ${newTotal})`);
        
        // Update Stock document
        stock.expiryArray = newExpiryArray;
        stock.totalQuantity = newTotal;
        stock.stockIn = activeStockIns.map(si => si._id);
        stock.stockOut = []; // Reset stockOut references
        
        // Rebuild stockHistory from active StockIns only
        stock.stockHistory = activeStockIns.map(si => ({
          action: 'stockIn',
          quantity: si.quantity,
          previousTotal: 0,
          newTotal: si.quantity,
          expiry: si.expiry,
          date: si.createdAt,
          docNo: si.docNo,
          reference: si._id,
          performedBy: si.createdBy,
          performedByRole: si.createdByRole
        }));
        
        await stock.save();
        console.log(`   ✅ Updated successfully`);
      } else {
        console.log(`   ✅ Already correct`);
      }
    }
    
    console.log('\n\n✅ All stocks fixed!');
    
    await mongoose.connection.close();
    console.log('✅ Connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

fixStockQuantities();
