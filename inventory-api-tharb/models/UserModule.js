const mongoose = require("mongoose")

const userScheme = new mongoose.Schema({
    userName:{type:String,default:"",required:true},
    password:{type:String,default:"",required:true},
    department:{type:String,default:"",required:true},
    role:{type:String,enum:['admin','user'],default:"user"}
})

const User = new mongoose.model("User",userScheme)
module.exports = User;