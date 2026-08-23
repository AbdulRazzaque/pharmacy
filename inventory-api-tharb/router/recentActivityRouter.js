const express = require('express');
const router = express.Router();
const isUserAuth = require('../middlewares/isUserAuth');
const recentActivityController = require('../controllers/recentActivityController');

router.get('/', isUserAuth, recentActivityController.getRecentActivity);

module.exports = router;
