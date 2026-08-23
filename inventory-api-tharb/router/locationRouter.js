const express = require('express')
const router = express.Router();
const locationController = require('../controllers/locationController')
const isUserAuth = require('../middlewares/isUserAuth')
const isAdminAuth = require('../middlewares/isAdminAuth')


router.get('/getAllLocations', isUserAuth, locationController.getAllLocations)
router.get('/getSingleLocation', isUserAuth, locationController.getSingleLocation)
router.post('/createLocation', isUserAuth, locationController.createLocation)
router.post('/UpdateLocation', isUserAuth, locationController.UpdateLocation)
router.put('/updateLocation/:id', isUserAuth, locationController.UpdateLocation)
router.delete('/deletelocationone/:id', isAdminAuth, locationController.deletelocationone)
router.delete('/deleteLocation/:id', isAdminAuth, locationController.deletelocationone)

module.exports = router;