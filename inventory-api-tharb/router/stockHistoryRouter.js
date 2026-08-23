const express = require('express');
const router = express.Router();
const stockHistoryController = require('../controllers/stockHistoryController');
const isUserAuth = require("../middlewares/isUserAuth");
const isAdminAuth = require("../middlewares/isAdminAuth");

// Get complete stock history for a product
router.get('/product/:productId', isUserAuth, stockHistoryController.getStockHistory);

// Get expiry-wise history for a product
router.get('/expiry/:productId', isUserAuth, stockHistoryController.getExpiryWiseHistory);

// Get all stock movements (with filters)
router.get('/movements', isUserAuth, stockHistoryController.getAllStockMovements);

// Get expiry report (all products)
router.get('/expiry-report', isUserAuth, stockHistoryController.getExpiryReport);

// Get specific batch movements
router.post('/batch-movements', isUserAuth, stockHistoryController.getBatchMovements);

module.exports = router;
