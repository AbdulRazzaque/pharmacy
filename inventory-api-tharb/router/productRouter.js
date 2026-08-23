const express = require('express')
const router = express.Router();
const productController = require('../controllers/productController')
const isUserAuth = require('../middlewares/isUserAuth')
const isAdminAuth = require('../middlewares/isAdminAuth')

router.get('/getAllProducts', isUserAuth, productController.getAllProducts)
router.get('/getAllProductType', isUserAuth, productController.getAllProductType)
router.get('/history/:id', isUserAuth, productController.getProductHistory)
router.post('/createProduct', isUserAuth, productController.createProduct)
router.post('/bulkImport', isAdminAuth, productController.bulkImportProducts)
router.delete('/deleteProduct/:id', isUserAuth, productController.deleteProduct)
router.post('/updateProduct', isUserAuth, productController.updateProduct)
router.put('/updateProduct/:id', isUserAuth, productController.updateProduct)
router.post('/fixNullCreatedBy', isUserAuth, productController.fixNullCreatedBy)
module.exports = router;