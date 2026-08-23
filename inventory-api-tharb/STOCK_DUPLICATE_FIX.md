# Stock Duplicate Fix - Complete

## Problem
The system had duplicate Stock documents for the same product, causing "Insufficient stock quantity" errors during stockOut operations. 

### Example:
- Product: VitaminC (ID: 696ba129ae980fb60f25a047)
- Stock Document 1 (ID: 696ba79b8ffeb89bc18622a6): 35 quantity
- Stock Document 2 (ID: 696ba79b8ffeb89bc18622ab): 10 quantity
- **Frontend displayed**: 45 (correctly combined)
- **Backend checked**: Only one document (35 or 10)
- **Result**: "Insufficient stock quantity" error when trying to stockOut 40

## Root Cause
1. No unique constraint on `Stock.product` field allowed multiple Stock documents for the same product
2. StockIn controller was creating new Stock documents instead of updating existing ones
3. Frontend grouping masked the backend issue by displaying combined quantities

## Solution Implemented

### 1. Schema Changes
- Added `unique: true` constraint on `Stock.product` field in [StockModule.js](o:/pharmacy/inventory-api-tharb/models/StockModule.js)
- Updated enum values for `movements.type` to include 'delete'
- Updated enum values for `stockHistory.action` to include 'deleted'

### 2. Database Migration
- Created `mergeStocks.js` script to consolidate duplicate Stock documents
- Merged expiry arrays by date (combined quantities for same expiry)
- Combined movements, stockIn, stockOut, and stockHistory arrays
- Recalculated totalQuantity from merged expiry array
- Deleted duplicate Stock documents
- **Result**: VitaminC now has single Stock document with 45 quantity

### 3. Database Index
- Created unique index on `Stock.product` field using `createIndex.js`
- Prevents future duplicate Stock documents from being created
- MongoDB will throw error if attempting to create duplicate

### 4. Controller Updates
- Updated `stockInController.js` to consistently use `Stock.findOne({product: productId})` instead of product name
- Ensures existing Stock documents are updated, not duplicated

### 5. API Endpoint
- Added `/api/stock/mergeDuplicates` endpoint in stockRouter.js
- Protected with admin authentication
- Can be called manually if duplicates occur in future

## Files Modified

1. **models/StockModule.js**
   - Added `unique: true` to product field
   - Updated enum values for movements and history

2. **controllers/stockInController.js**
   - Fixed all Stock.findOne calls to use product ID
   - Added comprehensive expiry array update logic

3. **controllers/stockController.js**
   - Added `mergeDuplicateStocks` endpoint

4. **router/stockRouter.js**
   - Added route for mergeDuplicateStocks

## Scripts Created

1. **mergeStocks.js** - Migration script to merge duplicate Stock documents
2. **createIndex.js** - Script to create unique index on product field

## Verification

After migration, confirm in MongoDB that each product has at most one Stock document and that `mergeStocks` / index steps completed without errors.

## Testing

1. Try stockOut with quantity 40 for the merged product
2. Should now work correctly (45 available, 40 requested = 5 remaining)
3. Try creating duplicate Stock for same product - should fail with unique constraint error

## Prevention

The unique index ensures:
- One Stock document per product
- MongoDB enforces data integrity
- StockIn operations update existing Stock, don't create duplicates
- Future duplicates prevented at database level

## Status: ✅ RESOLVED

- Duplicates merged: ✅
- Unique index created: ✅
- Schema updated: ✅
- Controllers fixed: ✅
- API endpoint added: ✅
