const express = require('express')
const router = express.Router();
const isUserAuth = require("../middlewares/isUserAuth");
const stockAdjustmentController = require('../controllers/stockAdjustmentController');


router.post('/createStockAdjustment', isUserAuth, stockAdjustmentController.createStockAdjustment);
router.post('/updateStockInAdjustment', isUserAuth, stockAdjustmentController.updateStockInAdjustment);
router.post('/UpdateStockOutAdjustment', isUserAuth, stockAdjustmentController.updateStockOutAdjustment);
router.get('/getStockAdjustmentDocNo', isUserAuth, stockAdjustmentController.getStockAdjustmentDocNo);
router.post('/createAdjustmentDocument', isUserAuth, stockAdjustmentController.createAdjustmentDocument);
router.post('/getStockAdjustmentByDocNo', isUserAuth, stockAdjustmentController.getStockAdjustmentByDocNo);
router.put('/updateAdjustmentItem', isUserAuth, stockAdjustmentController.updateAdjustmentItem);
router.post('/adjustStock', isUserAuth, stockAdjustmentController.adjustStock);
module.exports = router;
