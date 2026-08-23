// Script to fix all stocks before starting server
const mongoose = require('mongoose');
const Stock = require('./models/StockModule');
const StockIn = require('./models/StockInModule');
const moment = require('moment');

async function fixAllStocks() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/pharmacy');
        console.log('✅ Connected to MongoDB');
        
        const allStocks = await Stock.find({});
        console.log(`📦 Found ${allStocks.length} stocks to check`);
        
        let fixedCount = 0;
        
        for (const stock of allStocks) {
            // Get all active (non-deleted) StockIns for this product
            const activeStockIns = await StockIn.find({
                productId: stock.product,
                isDeleted: { $ne: true }
            });
            
            if (activeStockIns.length === 0) {
                console.log(`⚠️  ${stock.name} - No active StockIns, setting quantity to 0`);
                stock.totalQuantity = 0;
                stock.expiryArray = [];
                stock.stockHistory = [{
                    action: 'adjustment',
                    quantityChange: 0,
                    newTotal: 0,
                    timestamp: new Date(),
                    reason: 'Fixed - no active StockIns'
                }];
                await stock.save();
                fixedCount++;
                continue;
            }
            
            // Group by expiry date
            const expiryMap = new Map();
            let totalQty = 0;
            
            for (const stockIn of activeStockIns) {
                const expiryKey = moment(stockIn.expiryDate).format('DD/MM/YY');
                const qty = stockIn.quantity || 0;
                
                if (expiryMap.has(expiryKey)) {
                    expiryMap.set(expiryKey, expiryMap.get(expiryKey) + qty);
                } else {
                    expiryMap.set(expiryKey, qty);
                }
                
                totalQty += qty;
            }
            
            // Rebuild expiryArray
            const newExpiryArray = [];
            for (const [expiryKey, qty] of expiryMap.entries()) {
                const stockInWithExpiry = activeStockIns.find(
                    si => moment(si.expiryDate).format('DD/MM/YY') === expiryKey
                );
                
                newExpiryArray.push({
                    expiry: stockInWithExpiry.expiryDate,
                    quantity: qty,
                    movements: [{
                        type: 'in',
                        quantity: qty,
                        timestamp: new Date()
                    }]
                });
            }
            
            // Check if fix needed
            if (stock.totalQuantity !== totalQty) {
                console.log(`🔧 ${stock.name}: Fixing ${stock.totalQuantity} → ${totalQty}`);
                stock.totalQuantity = totalQty;
                stock.expiryArray = newExpiryArray;
                stock.stockHistory = [{
                    action: 'adjustment',
                    quantityChange: totalQty - stock.totalQuantity,
                    newTotal: totalQty,
                    timestamp: new Date(),
                    reason: 'Fixed based on active StockIns'
                }];
                await stock.save();
                fixedCount++;
            }
        }
        
        console.log(`\n✅ Fixed ${fixedCount} stocks`);
        console.log('🎉 All stocks are now clean and accurate!');
        console.log('\n📝 Now you can start the server with: npm start');
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.connection.close();
    }
}

fixAllStocks();
