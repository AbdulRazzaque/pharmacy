const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const Product = require('./models/ProductModule');
require('dotenv').config();

async function debugStock() {
  try {
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB\n');

    const productId = '696bac4ebb66f62a7d1f232b';
    
    console.log('🔍 Testing different query methods:\n');
    
    // Method 1: String
    console.log('1. Query with string:');
    const result1 = await Stock.findOne({product: productId});
    console.log('   Result:', result1 ? `Found: ${result1._id}` : 'null');
    
    // Method 2: new mongoose.Types.ObjectId
    console.log('\n2. Query with new mongoose.Types.ObjectId:');
    const result2 = await Stock.findOne({product: new mongoose.Types.ObjectId(productId)});
    console.log('   Result:', result2 ? `Found: ${result2._id}` : 'null');
    
    // Method 3: Find all and check
    console.log('\n3. All Stock documents:');
    const allStocks = await Stock.find();
    console.log(`   Total: ${allStocks.length}`);
    allStocks.forEach(stock => {
      console.log(`   - Stock ID: ${stock._id}`);
      console.log(`     Product ID: ${stock.product}`);
      console.log(`     Product ID type: ${typeof stock.product}`);
      console.log(`     Match: ${stock.product.toString() === productId}`);
    });
    
    // Method 4: Check if product exists
    console.log('\n4. Check Product:');
    const product = await Product.findById(productId);
    console.log('   Product:', product ? product.productName : 'Not found');
    
    await mongoose.connection.close();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

debugStock();
