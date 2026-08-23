const jwt = require("jsonwebtoken");
const User = require('../models/UserModule');

module.exports = isAdminAuth = async (req,res,next)=> {
    if(!req.headers.token){
        res.status(402).send("Unauthorized Access")
    }else{
        try {
            const decoded = jwt.verify(req.headers.token, process.env.TOKEN || 'yourSecretKey');
            
            if(!decoded.userName || !decoded._id || decoded.role!=="admin"){
                res.status(402).send("Unauthorized Access")
            }else{
                // Set both userDetails (legacy) and user (for createdBy)
                req.userDetails = decoded;
                req.user = {
                    _id: decoded._id,
                    userName: decoded.userName,
                    role: decoded.role,
                    department: decoded.department
                };
                next();
            }
        } catch (err) {
            res.status(402).send("Unauthorized Access")
        }
    }
}