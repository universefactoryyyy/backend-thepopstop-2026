const mongoose = require('mongoose')

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    product: {
        type: mongoose.Schema.ObjectId,
        ref: 'Product',
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: [1, 'Quantity must be at least 1'],
        default: 1
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

// one row per product per user
cartSchema.index({ user: 1, product: 1 }, { unique: true })

module.exports = mongoose.model('Cart', cartSchema);
