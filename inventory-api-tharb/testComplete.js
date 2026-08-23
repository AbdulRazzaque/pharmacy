// Complete test to verify StockIn creation and deletion
const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const StockIn = require('./models/StockInModule');
const Product = require('./models/ProductModule');
const moment = require('moment');

async function completeTest() {
    try {
        await mongoose.connect(process.env.MONGODB || 'mongodb://localhost:27017/inventroy');
        console.log('✅ Connected to MongoDB (inventroy database)\n');
        
        // Step 1: Check if Product exists
        console.log('STEP 1: Checking Product...');
        let product = await Product.findOne({ name: 'VitaminC' });
        
        if (!product) {
            console.log('❌ Product "VitaminC" does NOT exist!');
            console.log('   Please create it from frontend first.\n');
            
            // List all products
            const allProducts = await Product.find({});
            console.log(`📦 Available Products: ${allProducts.length}`);
            allProducts.forEach(p => console.log(`   - ${p.name} (${p._id})`));
            
            await mongoose.connection.close();
            return;
        }
        
        console.log('✅ Product found:', product.name, `(${product._id})\n`);
        
        // Step 2: Check StockIns
        console.log('STEP 2: Checking StockIns...');
        const allStockIns = await StockIn.find({ productId: product._id });
        const activeStockIns = await StockIn.find({ 
            productId: product._id,
            isDeleted: { $ne: true }
        });
        
        console.log(`📥 Total StockIns: ${allStockIns.length}`);
        console.log(`✅ Active StockIns: ${activeStockIns.length}`);
        
        if (allStockIns.length > 0) {
            console.log('\n   All StockIn Entries:');
            allStockIns.forEach((si, idx) => {
                const status = si.isDeleted ? '❌ DELETED' : '✅ ACTIVE';
                const expiryStr = moment(si.expiryDate).format('DD/MM/YYYY');
                console.log(`   ${idx + 1}. ${status} - Qty: ${si.quantity} - Expiry: ${expiryStr} - DocNo: ${si.docNo}`);
            });
        }
        console.log('');
        
        // Step 3: Check Stock document
        console.log('STEP 3: Checking Stock Document...');
        const stock = await Stock.findOne({ product: product._id });
        
        if (!stock) {
            console.log('❌ Stock document does NOT exist!');
            if (activeStockIns.length > 0) {
                console.log('⚠️  WARNING: Active StockIns exist but NO Stock document!');
                console.log('   This should NOT happen. Stock should have been created.\n');
            }
        } else {
            console.log('✅ Stock document found:');
            console.log(`   Total Quantity: ${stock.totalQuantity}`);
            console.log(`   Expiry Batches: ${stock.expiryArray.length}`);
            
            if (stock.expiryArray.length > 0) {
                console.log('\n   Expiry Details:');
                stock.expiryArray.forEach((exp, idx) => {
                    const expiryStr = moment(exp.expiry).format('DD/MM/YYYY');
                    console.log(`   ${idx + 1}. Expiry: ${expiryStr} - Qty: ${exp.quantity}`);
                });
            }
            console.log('');
        }
        
        // Step 4: Calculate expected quantity
        console.log('STEP 4: Verification...');
        const expectedQty = activeStockIns.reduce((sum, si) => sum + si.quantity, 0);
        const actualQty = stock ? stock.totalQuantity : 0;
        
        console.log(`Expected Quantity (from active StockIns): ${expectedQty}`);
        console.log(`Actual Quantity (from Stock): ${actualQty}`);
        
        if (expectedQty === actualQty) {
            console.log('✅ MATCH! Everything is correct.\n');
        } else {
            console.log('❌ MISMATCH! Stock needs to be fixed.\n');
            console.log('Run this command to fix:');
            console.log('   node fixStockQuantities.js\n');
        }
        
        // Step 5: Summary
        console.log('='.repeat(60));
        console.log('SUMMARY:');
        console.log(`Product: ${product ? 'EXISTS ✅' : 'MISSING ❌'}`);
        console.log(`StockIns: ${allStockIns.length} total, ${activeStockIns.length} active`);
        console.log(`Stock Document: ${stock ? 'EXISTS ✅' : 'MISSING ❌'}`);
        console.log(`Quantity Match: ${expectedQty === actualQty ? 'YES ✅' : 'NO ❌'}`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

completeTest();
