const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const isAdminAuth = require("../middlewares/isAdminAuth");
const isUserAuth = require("../middlewares/isUserAuth");
const Product = require("../models/ProductModule");
const recalculateRunningBalances = require("../utils/recalculateRunningBalances");

router.get('/getAllStocks', stockController.getAllStocks);
router.get('/getAllStocksNew', stockController.getAllStocksNew);
router.post('/getStockDocuments', isUserAuth, stockController.getStockDocuments);
router.delete('/deleteStock/:id', isAdminAuth, stockController.deleteStock);
router.post('/mergeDuplicates', isAdminAuth, stockController.mergeDuplicateStocks);

router.get('/fixQuantities', async function (req, res) {
    try {
        const products = await Product.find({}).select("_id");
        for (const p of products) {
            await recalculateRunningBalances(p._id);
        }
        res.status(200).send({ msg: 'success', result: `Fixed ${products.length} stock(s)` });
    } catch (error) {
        res.status(500).send({ msg: 'error', result: error.message });
    }
});

module.exports = router;