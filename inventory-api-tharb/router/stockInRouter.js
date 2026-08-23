const express = require('express')
const router = express.Router();
const isUserAuth = require("../middlewares/isUserAuth");
const stockInController = require('../controllers/stockInController');



router.post('/stockIn',isUserAuth,stockInController.stockIn)
router.post('/stockInAgainByDocNo',isUserAuth,stockInController.stockInAgainByDocNo)
router.post('/getStockInByDocNo',isUserAuth,stockInController.getStockInByDocNo)
router.post('/deleteStockIn',isUserAuth,stockInController.deleteStockIn)
router.get('/getStockInDocNo',isUserAuth,stockInController.getStockInDocNo) 
router.get('/getStockInDocs',isUserAuth,stockInController.getStockInDocs)
router.post('/stockInBulkUpdate',isUserAuth,stockInController.bulkUpdate)
router.post('/stockInUpdateQuantity/:id',isUserAuth,stockInController.stockInUpdateQuantity)
router.delete('/stockInDelete/:id',stockInController.deleteStockIn);
router.get('/test-delete-code',function(req,res) {
    res.send({msg: 'New delete code is loaded!', version: '2.0', timestamp: new Date()});
});
router.put('/updateStockIn/:name',stockInController.updateStockIn)
module.exports=router;
