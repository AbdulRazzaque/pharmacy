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

// Document Header & Date Update Routes
router.patch('/documents/:documentId',isUserAuth,stockOutController.updateDocument)
router.put('/documents/:documentId',isUserAuth,stockOutController.updateDocument)
router.patch('/documents/docNo/:docNo',isUserAuth,stockOutController.updateDocument)
router.put('/documents/docNo/:docNo',isUserAuth,stockOutController.updateDocument)
router.post('/updateDocumentDate',isUserAuth,stockOutController.updateDocument)

module.exports=router;