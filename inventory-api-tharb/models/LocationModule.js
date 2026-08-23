const mongoose = require("mongoose")

const locationScheme = new mongoose.Schema({
    name:{type:String,default:"",required:true},
    trainerName:{type:String,default:""},
    doctorName:{type:String,default:""},
    createdBy:{type:mongoose.Types.ObjectId,ref:"User"},
    createdByRole:{type:String,enum:['admin','user'],default:'user'},
    updatedBy:{type:mongoose.Types.ObjectId,ref:"User"},
    updatedByRole:{type:String,enum:['admin','user']},
    deletedBy:{type:mongoose.Types.ObjectId,ref:"User"},
    deletedByRole:{type:String,enum:['admin','user']},
    deletedAt:{type:Date,default:null},
    isDeleted:{type:Boolean,default:false},
    history:[{
        action:{type:String,enum:['created','updated','deleted']},
        performedBy:{type:mongoose.Types.ObjectId,ref:"User"},
        performedByRole:{type:String,enum:['admin','user']},
        timestamp:{type:Date,default:Date.now},
        changes:{type:Object}
    }]
},{timestamps:true})

const Location = new mongoose.model("Location",locationScheme)
module.exports = Location;