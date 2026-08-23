const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
require('dotenv').config();

async function createUniqueIndex() {
  try {
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to MongoDB\n');

    // Create unique index on product field
    await Stock.collection.createIndex({ product: 1 }, { unique: true });
    
    console.log('✅ Created unique index on Stock.product field');
    
    // List all indexes
    const indexes = await Stock.collection.getIndexes();
    console.log('\n📑 All indexes on Stock collection:');
    console.log(JSON.stringify(indexes, null, 2));
    
    await mongoose.connection.close();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

createUniqueIndex();
