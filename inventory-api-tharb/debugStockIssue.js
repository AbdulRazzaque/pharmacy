const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const StockIn = require('./models/StockInModule');
const Product = require('./models/ProductModule');
const moment = require('moment');
require('dotenv').config();

async function debugStockIssue() {
  try {
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB\n');

    // Find VitaminC product
    const product = await Product.findOne({ name: /vitamin/i });
    if (!product) {
      console.log('❌ VitaminC product not found');
      await mongoose.connection.close();
      return;
    }
    
    console.log('📦 Product:', product.productName);
    console.log('   Product ID:', product._id);
    console.log('');

    // Find Stock document
    const stock = await Stock.findOne({ product: product._id });
    if (!stock) {
      console.log('❌ Stock document not found');
      await mongoose.connection.close();
      return;
    }

    console.log('📊 STOCK DOCUMENT:');
    console.log('   Stock ID:', stock._id);
    console.log('   Total Quantity:', stock.totalQuantity);
    console.log('   StockIn References:', stock.stockIn.length);
    console.log('');

    console.log('📅 EXPIRY BATCHES:');
    stock.expiryArray.forEach((exp, i) => {
      console.log(`   ${i + 1}. Expiry: ${moment(exp.expiry).format('DD/MM/YYYY')}`);
      console.log(`      Quantity: ${exp.quantity}`);
      console.log(`      Price: ${exp.price}`);
      console.log(`      Movements: ${exp.movements?.length || 0}`);
      if (exp.movements && exp.movements.length > 0) {
        exp.movements.forEach((mov, j) => {
          console.log(`         ${j + 1}. ${mov.type}: ${mov.quantity} (${moment(mov.date).format('DD/MM/YY HH:mm')})`);
        });
      }
      console.log('');
    });

    // Find all StockIn records (including deleted)
    const allStockIns = await StockIn.find({ productId: product._id }).sort({ createdAt: -1 });
    
    console.log('📥 ALL STOCKIN RECORDS (including deleted):');
    allStockIns.forEach((si, i) => {
      console.log(`   ${i + 1}. StockIn ID: ${si._id}`);
      console.log(`      Quantity: ${si.quantity}`);
      console.log(`      Expiry: ${moment(si.expiry).format('DD/MM/YYYY')}`);
      console.log(`      Deleted: ${si.isDeleted ? '❌ YES' : '✅ NO'}`);
      console.log(`      Created: ${moment(si.createdAt).format('DD/MM/YY HH:mm')}`);
      console.log('');
    });

    // Calculate expected quantity
    const activeStockIns = allStockIns.filter(si => !si.isDeleted);
    const expectedQuantity = activeStockIns.reduce((sum, si) => sum + si.quantity, 0);
    
    console.log('🔍 ANALYSIS:');
    console.log(`   Total StockIn Records: ${allStockIns.length}`);
    console.log(`   Active StockIn Records: ${activeStockIns.length}`);
    console.log(`   Expected Quantity (sum of active): ${expectedQuantity}`);
    console.log(`   Actual Stock Quantity: ${stock.totalQuantity}`);
    console.log(`   Match: ${expectedQuantity === stock.totalQuantity ? '✅ YES' : '❌ NO - MISMATCH!'}`);
    
    if (expectedQuantity !== stock.totalQuantity) {
      console.log('\n⚠️  MISMATCH DETECTED!');
      console.log(`   Difference: ${stock.totalQuantity - expectedQuantity}`);
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

debugStockIssue();
