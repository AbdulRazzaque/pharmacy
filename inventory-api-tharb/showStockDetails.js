const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const Product = require('./models/ProductModule');
require('dotenv').config();

async function showStockDetails() {
  try {
    await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy');
    
    const product = await Product.findOne({ name: /vitamin/i });
    const stock = await Stock.findOne({ product: product._id });
    
    console.log('📊 COMPLETE STOCK DOCUMENT:');
    console.log(JSON.stringify(stock, null, 2));
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
    await mongoose.connection.close();
  }
}

showStockDetails();
