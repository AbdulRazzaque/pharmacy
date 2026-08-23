const express = require('express')
const router = express.Router();
const supplierController = require('../controllers/supplierController')
const isUserAuth = require('../middlewares/isUserAuth')
const isAdminAuth = require('../middlewares/isAdminAuth')


router.get('/getAllSuppliers', isUserAuth, supplierController.getAllSuppliers)
router.post('/createSupplier', isUserAuth, supplierController.createSupplier)
router.post('/updateSupplier', isUserAuth, supplierController.updateSupplier)
router.put('/updateSupplier/:id', isUserAuth, supplierController.updateSupplier)
router.post('/deleteSuppliers', isAdminAuth, supplierController.deleteSuppliers)
router.delete('/deleteSupplier/:id', isAdminAuth, supplierController.deleteSuppliers)

module.exports = router;