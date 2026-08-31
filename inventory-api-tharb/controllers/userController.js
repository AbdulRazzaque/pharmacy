const mongoose = require('mongoose')
const User = require("../models/UserModule")
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken")

class UserController{
    async getUser (req,res){
        User.find({})
        .then(response=>{
            res.status(200).send({msg:"success",result:response})
        })
        
    }

    async createUser(req,res){
        const {userName, password, department, role} = req.body;
        if(!userName || !password || !department || !role){
            res.status(400).send("Bad Request")
        }else{
            let hashPassword = await bcrypt.hash(req.body.password, 10)
            User.findOne({userName})
            .then(response=>{
                if(response){
                    res.status(400).send("User already exist")
                }else{
                    const newUser = new User({
                        userName,
                        department,
                        role,
                        password:hashPassword
                    })
                    newUser.save()
                    .then(response=>{
                        res.status(201).send({msg:"success",result:response})
                    })
                    .catch(err=>{
                        res.status(500).send("Couldn't save something went wrong")
                    })
                }
            })


        }
    }

    async loginUser(req,res){
        if(!req.body.userName || !req.body.password){
            res.status(400).send("Bad Request")
        }else{
            User.findOne({userName:req.body.userName})
            .then(async response=>{
                if(response){
                    const hashPassword = await bcrypt.compare(req.body.password,response.password)
                    if(hashPassword){
                        //log in success
                        var token = jwt.sign({ userName: req.body.userName,_id:response._id,role:response.role }, process.env.TOKEN);
                        res.status(201).send({msg:"success",result:{token,role:response.role,userInfo:response}})
                    }else{
                        //log in failed
                        res.status(400).send("Incorrect Password")
                    }
                }else{
                    res.status(400).send("User doesn't exist")
                }
            })
            
        }
    }

    async deleteUsers(req,res){
        let {array} = req.body;
        if(!req.body.array){
            res.status(400).send("Data Missing")
        }else{
            array = array.map(item=>mongoose.Types.ObjectId(item))
            User.deleteMany({_id: { $in: array}})
            .then(response=>{
                if(response.deletedCount > 0){
                    res.status(200).send({msg:"success",result:"Deleted"})
                }else{
                    res.status(400).send("Not deleted")
                }
            })
        }
    }
}

const userController = new UserController();
module.exports=userController;