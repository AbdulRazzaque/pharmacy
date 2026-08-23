const mongoose = require('mongoose')
const Supplier = require("../models/Supplier.Module")
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken")

class SupplierController {
    async createSupplier(req, res) {
        const { name, email, address, location, contact } = req.body;
        if (!name) {
            res.status(400).send("Data Missing")
        } else {
            const newSupplier = new Supplier({
                name,
                email,
                address: address || location, // Support both field names
                location: location || address,
                contact,
                createdBy: req.user?._id || null,
                createdByRole: req.user?.role || 'user',
                history: [{
                    action: 'created',
                    performedBy: req.user?._id,
                    performedByRole: req.user?.role,
                    timestamp: new Date(),
                    changes: { name, email, address: address || location, contact }
                }]
            })
            newSupplier.save()
                .then(response => {
                    res.status(200).send({ msg: "success", result: response })
                })

        }
    }

    async getAllSuppliers(req, res) {
        Supplier.find({ isDeleted: { $ne: true } })
            .populate('history.performedBy', 'userName role')
            .then(response => {
                res.status(200).send({ msg: "success", result: response })
            })
    }
    async deleteSuppliers(req, res) {
        // Support both single ID from params and array from body
        if (req.params.id) {
            Supplier.updateOne(
                { _id: req.params.id },
                {
                    $set: {
                        isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: req.user?._id,
                        deletedByRole: req.user?.role
                    },
                    $push: {
                        history: {
                            action: 'deleted',
                            performedBy: req.user?._id,
                            performedByRole: req.user?.role,
                            timestamp: new Date(),
                            changes: { isDeleted: true }
                        }
                    }
                }
            )
                .then(response => {
                    if (response.matchedCount) {
                        res.status(200).send({ msg: "success", result: "Deleted" })
                    } else {
                        res.status(404).send({ msg: "error", result: "Supplier not found" })
                    }
                })
                .catch(err => {
                    res.status(400).send({ msg: "error", result: err })
                })
        } else {
            let { array } = req.body;
            if (!req.body.array) {
                res.status(400).send("Data Missing")
            } else {
                array = array.map(item => mongoose.Types.ObjectId(item))
                Supplier.updateMany(
                    { _id: { $in: array } },
                    {
                        $set: {
                            isDeleted: true,
                            deletedAt: new Date(),
                            deletedBy: req.user?._id,
                            deletedByRole: req.user?.role
                        },
                        $push: {
                            history: {
                                action: 'deleted',
                                performedBy: req.user?._id,
                                performedByRole: req.user?.role,
                                timestamp: new Date(),
                                changes: { isDeleted: true }
                            }
                        }
                    }
                )
                    .then(response => {
                        if (response.matchedCount > 0) {
                            res.status(200).send({ msg: "success", result: `Deleted ${response.modifiedCount} suppliers` })
                        } else {
                            res.status(400).send("Not deleted")
                        }
                    })
            }
        }
    }

    async updateSupplier(req, res) {
        const { id: bodyId, name, email, address, location, contact } = req.body;
        const id = req.params.id || bodyId; // Support both URL param and body
        if (!id || !name) {
            res.status(400).send("Data Missing")
        } else {
            Supplier.findByIdAndUpdate(
                id,
                {
                    $set: {
                        name,
                        email,
                        address: address || location,
                        location: location || address,
                        contact,
                        updatedBy: req.user?._id,
                        updatedByRole: req.user?.role
                    },
                    $push: {
                        history: {
                            action: 'updated',
                            performedBy: req.user?._id,
                            performedByRole: req.user?.role,
                            timestamp: new Date(),
                            changes: { name, email, address: address || location, contact }
                        }
                    }
                },
                { new: true }
            )
                .then(response => {
                    res.status(200).send({ msg: "success", result: response })
                })
                .catch(err => {
                    res.status(400).send({ msg: "error", result: err })
                })
        }
    }

}

const supplierController = new SupplierController();
module.exports = supplierController;