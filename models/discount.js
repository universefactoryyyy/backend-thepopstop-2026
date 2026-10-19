const mongoose = require('mongoose')

const discountSchema = new mongoose.Schema({
    code: {
        type: String,
        required: [true, 'Please enter discount code'],
        unique: true,
        uppercase: true,
        trim: true,
        maxLength: [50, 'Code cannot exceed 50 characters']
    },
    description: {
        type: String,
        trim: true,
        maxLength: [255, 'Description cannot exceed 255 characters']
    },
    discountType: {
        type: String,
        enum: {
            values: ['percent', 'fixed'],
            message: 'Discount type must be percent or fixed'
        },
        default: 'percent'
    },
    discountValue: {
        type: Number,
        required: [true, 'Please enter discount value'],
        min: [0.01, 'Discount value must be greater than 0']
    },
    minOrderAmount: {
        type: Number,
        default: 0,
        min: [0, 'Minimum order cannot be negative']
    },
    maxUses: {
        type: Number,
        default: null,
        min: [1, 'Max uses must be at least 1']
    },
    usedCount: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    expiresAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

discountSchema.pre('validate', function () {
    if (this.discountType === 'percent' && this.discountValue > 100) {
        this.invalidate('discountValue', 'Percent discount cannot be more than 100');
    }
});

module.exports = mongoose.model('Discount', discountSchema);
