const mongoose = require('mongoose')
const Location = require("../models/LocationModule")
const bcrypt = require('bcrypt');
const jwt = require("jsonwebtoken")

class LocationController {
    async createLocation(req, res) {
        const { name, trainerName, doctorName } = req.body;

        if (!name) {
            return res.status(400).send("Data Missing");
        }

        const existingLocation = await Location.findOne({
            name,
            trainerName,
            doctorName
        });

        if (existingLocation) {
            return res.status(400).send({
                message: 'This Location is already available'
            });
        }

        const newLocation = new Location({
            name,
            trainerName,
            doctorName,
            createdBy: req.user?._id || null,
            createdByRole: req.user?.role || 'user',
            history: [{
                action: 'created',
                performedBy: req.user?._id,
                performedByRole: req.user?.role,
                timestamp: new Date(),
                changes: { name, trainerName, doctorName }
            }]
        });

        const response = await newLocation.save();

        res.status(200).send({
            msg: "success",
            result: response
        });
    }
    async UpdateLocation(req, res) {

        const {
            name,
            trainerName,
            doctorName,
            locationId
        } = req.body;

        const id = req.params.id || locationId;

        if (!name || !trainerName) {
            return res.status(400).send("Data Missing");
        }

        await Location.updateOne(
            { _id: mongoose.Types.ObjectId(id) },
            {
                $set: {
                    name,
                    trainerName,
                    doctorName,
                    updatedBy: req.user?._id,
                    updatedByRole: req.user?.role
                },
                $push: {
                    history: {
                        action: 'updated',
                        performedBy: req.user?._id,
                        performedByRole: req.user?.role,
                        timestamp: new Date(),
                        changes: { name, trainerName, doctorName }
                    }
                }
            }
        );

        res.status(200).send({
            msg: "success"
        });
    }


    async deletelocationone(req, res, next) {
        try {
            const locationDelete = await Location.updateOne(
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
            );
            if (!locationDelete.matchedCount) {
                return next(new Error("Nothing to delete"));
            }
            res.json({ msg: "success", result: "Location soft deleted" });
        } catch (error) {
            return next(error);
        }
    }

    async getAllLocations(req, res) {
        Location.find({ isDeleted: { $ne: true } })
            .populate('history.performedBy', 'userName role')
            .then(response => {
                res.status(200).send({ msg: "success", result: response })
            })
    }

    async getSingleLocation(req, res) {
        Location.find({ _id: mongoose.Types.ObjectId(req.body.id), isDeleted: { $ne: true } })
            .populate('history.performedBy', 'userName role')
            .then(response => {
                res.status(200).send({ msg: "success", result: response })
            })
    }

}

const locationController = new LocationController();
module.exports = locationController;