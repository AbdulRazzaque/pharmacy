const jwt = require("jsonwebtoken");
const User = require('../models/UserModule');

module.exports = isUserAuth = async (req, res, next) => {
    //console.log(req.headers)
    if (!req.headers.token || req.headers.token === "undefined") {
        res.status(402).send("Unauthorized Access")
    } else {
        try {
            let decoded = jwt.verify(req.headers.token, process.env.TOKEN || 'yourSecretKey');
            if (!decoded.userName || !decoded._id) {
                res.status(402).send("Unauthorized Access")
            } else {
                // Set both userDetails (legacy) and user (for createdBy)
                req.userDetails = decoded;
                req.user = {
                    _id: decoded._id,
                    userName: decoded.userName,
                    role: decoded.role || 'user',
                    department: decoded.department
                };
                next();
            }
        } catch {
            res.status(402).send("Unauthorized Access")
        }



    }
}