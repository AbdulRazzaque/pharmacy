const express = require('express')
const router = express.Router();
const userController = require('../controllers/userController')
const isAdminAuth = require("../middlewares/isAdminAuth")

router.get('/',isAdminAuth,userController.getUser)
router.post('/createUser',isAdminAuth,userController.createUser)
router.post('/deleteUsers',isAdminAuth,userController.deleteUsers)
router.post('/loginUser',userController.loginUser)

module.exports=router;