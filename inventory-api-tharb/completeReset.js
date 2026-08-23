const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const StockIn = require('./models/StockInModule');
const StockOut = require('./models/StockOutModule');
const Product = require('./models/ProductModule');
require('dotenv').config();

async function completeReset() {
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
    
    console.log('📦 Product: VitaminC');
    console.log('   Product ID:', product._id);
    console.log('');

    // Delete all StockIn, StockOut and Stock for this product
    console.log('🗑️  Deleting all records for VitaminC...');
    
    const deletedStockIns = await StockIn.deleteMany({ productId: product._id });
    console.log(`   Deleted ${deletedStockIns.deletedCount} StockIn records`);
    
    const deletedStockOuts = await StockOut.deleteMany({ productId: product._id });
    console.log(`   Deleted ${deletedStockOuts.deletedCount} StockOut records`);
    
    const deletedStocks = await Stock.deleteMany({ product: product._id });
    console.log(`   Deleted ${deletedStocks.deletedCount} Stock records`);
    
    console.log('\n✅ Complete reset done!');
    console.log('   You can now start fresh with StockIn operations');
    
    await mongoose.connection.close();
    console.log('\n✅ Connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

completeReset();
