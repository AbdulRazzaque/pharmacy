const jwt = require('jsonwebtoken')
const User = require('../models/UserModule')

exports.checkLogin = async (req, res, next) => {
    try {
        const token = req.headers.token || req.headers.authorization?.replace('Bearer ', '')
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'yourSecretKey')
            const user = await User.findById(decoded._id)
            
            if (user) {
                req.user = {
                    _id: user._id,
                    userName: user.userName,
                    role: user.role,
                    department: user.department
                }
            }
        }
        
        next()
    } catch (err) {
        // Continue without user if token is invalid
        next()
    }
}