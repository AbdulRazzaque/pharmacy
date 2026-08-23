const mongoose = require("mongoose")


const productScheme = new mongoose.Schema({
    name: { type: String, default: "", required: true },
    slug: { type: String, unique: true },
    companyName: { type: String, default: "", required: true },
    type: { type: String, default: "", required: true },
    unit: { type: String, default: "", required: true },
    requiresExpiry: { type: Boolean, default: true },
    createdBy: { type: mongoose.Types.ObjectId, ref: "User" },
    createdByRole: { type: String, enum: ['admin', 'user'], default: 'user' },
    updatedBy: { type: mongoose.Types.ObjectId, ref: "User" },
    updatedByRole: { type: String, enum: ['admin', 'user'] },
    deletedBy: { type: mongoose.Types.ObjectId, ref: "User" },
    deletedByRole: { type: String, enum: ['admin', 'user'] },
    deletedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    history: [{
        action: { type: String, enum: ['created', 'updated', 'deleted'] },
        performedBy: { type: mongoose.Types.ObjectId, ref: "User" },
        performedByRole: { type: String, enum: ['admin', 'user'] },
        timestamp: { type: Date, default: Date.now },
        changes: { type: Object }
    }]
}, { timestamps: true })

// Generate slug before saving
// productScheme.pre('save', function(next) {
//     if (this.isModified('name') || !this.slug) {
//         this.slug = slugify(this.name, { lower: true, strict: true });
//     }
//     next();
// });

const Product = new mongoose.model("Product", productScheme)
module.exports = Product;