const express = require('express')
const router = express.Router();
const isUserAuth = require("../middlewares/isUserAuth");
const reportController = require('../controllers/reportController');

router.post('/getMonthlyReport', isUserAuth, reportController.getMonthlyReport);
router.post('/getStockReport', isUserAuth, reportController.getStockReport);
router.post('/getStockInReport', isUserAuth, reportController.getStockInReport);
router.post('/getStockOutReport', isUserAuth, reportController.getStockOutReport);
router.post('/getMonthlySummarizedReport', isUserAuth, reportController.getMonthlySummarizedReport);
router.post('/getMonthlyIssuedReport', isUserAuth, reportController.getMonthlyIssuedReport);
router.post('/getSummaryReport', isUserAuth, reportController.getSummaryReport);
router.post('/getStockAdjustmentHistory', isUserAuth, reportController.getStockAdjustmentHistory);

module.exports = router;