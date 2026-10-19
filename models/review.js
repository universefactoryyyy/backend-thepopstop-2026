const mongoose = require('mongoose')

const reviewSchema = new mongoose.Schema({
    product: {
        type: mongoose.Schema.ObjectId,
        ref: 'Product',
        required: true
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    // the delivered order that makes the author a verified buyer
    order: {
        type: mongoose.Schema.ObjectId,
        ref: 'Order',
        required: true
    },
    rating: {
        type: Number,
        required: [true, 'Please select a rating'],
        min: [1, 'Rating must be at least 1'],
        max: [5, 'Rating cannot be more than 5']
    },
    // already masked with the bad-words filter
    comment: {
        type: String,
        trim: true,
        maxLength: [1000, 'Review cannot exceed 1000 characters'],
        default: ''
    },
    // when true, shoppers see "Anonymous" instead of the author's name
    anonymous: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
})

// one editable review per customer per product
reviewSchema.index({ user: 1, product: 1 }, { unique: true })

module.exports = mongoose.model('Review', reviewSchema);
