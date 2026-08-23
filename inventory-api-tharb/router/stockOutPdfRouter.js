const express = require('express');
const router = express.Router();
const isUserAuth = require("../middlewares/isUserAuth");
const stockOutPdfController = require('../controllers/stockOutPdfController');

router.post('/', isUserAuth, stockOutPdfController.createPdfRecord);
router.get('/byDocNo/:docNo', isUserAuth, stockOutPdfController.getPdfRecordByDocNo);
router.get('/:id', stockOutPdfController.getPdfRecordById);

module.exports = router;
