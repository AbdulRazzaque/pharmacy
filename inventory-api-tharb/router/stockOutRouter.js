const express = require('express')
const router = express.Router();
const isUserAuth = require("../middlewares/isUserAuth");
const stockOutController = require('../controllers/stockOutController');

router.post('/stockOuts',isUserAuth,stockOutController.stockOuts)
router.post('/stockOutAgainByDocNo',isUserAuth,stockOutController.stockOutAgainByDocNo)
router.post('/getStockOutByDocNo',isUserAuth,stockOutController.getStockOutByDocNo)
router.post('/deleteStockOut',isUserAuth,stockOutController.deleteStockOut)
router.get('/getStockOutDocNo',isUserAuth,stockOutController.getStockOutDocNo) 
router.get('/getStockOutDocs',isUserAuth,stockOutController.getStockOutDocs)
router.post('/stockOutBulkUpdate',isUserAuth,stockOutController.bulkUpdate)
router.post('/stockOutUpdateQuantity/:id',isUserAuth,stockOutController.stockOutUpdateQuantity)
router.put('/stockOutUpdateQuantity/:id',isUserAuth,stockOutController.stockOutUpdateQuantity)
router.patch('/stockOutUpdateQuantity/:id',isUserAuth,stockOutController.stockOutUpdateQuantity)
router.put('/items/:itemId',isUserAuth,stockOutController.stockOutUpdateQuantity)
router.patch('/items/:itemId',isUserAuth,stockOutController.stockOutUpdateQuantity)
router.post('/deleteStockOut/:id',stockOutController.deleteStockOut)
router.post('/getDocumentStockOut',isUserAuth,stockOutController.getDocumentStockOut)
router.post('/getSummaryStockOut',isUserAuth,stockOutController.getSummaryStockOut)
router.post('/getStockAllStockOut',isUserAuth,stockOutController.getStockAllStockOut)

module.exports=router;