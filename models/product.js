const mongoose = require('mongoose')
const { getStockStatus } = require('../utils/stock')

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter product name'],
        trim: true,
        maxLength: [150, 'Product name cannot exceed 150 characters']
    },
    series: {
        type: String,
        required: [true, 'Please enter product series / category'],
        trim: true,
        maxLength: [60, 'Series cannot exceed 60 characters']
    },
    brand: {
        type: String,
        required: [true, 'Please enter product brand'],
        trim: true,
        maxLength: [60, 'Brand cannot exceed 60 characters']
    },
    price: {
        type: Number,
        required: [true, 'Please enter product price'],
        min: [0, 'Price cannot be negative'],
        max: [9999999, 'Price is too large'],
        default: 0.0
    },
    costPrice: {
        type: Number,
        min: [0, 'Cost price cannot be negative'],
        default: 0.0
    },
    sku: {
        type: String,
        required: [true, 'Please enter product SKU'],
        unique: true,
        trim: true,
        uppercase: true,
        maxLength: [40, 'SKU cannot exceed 40 characters']
    },
    description: {
        type: String,
        required: [true, 'Please enter product description'],
        maxLength: [3000, 'Description cannot exceed 3000 characters']
    },
    stock: {
        type: Number,
        required: [true, 'Please enter product stock'],
        min: [0, 'Stock cannot be negative'],
        default: 0
    },
    // In Stock / Low Stock / Out of Stock - always derived from `stock`
    status: {
        type: String,
        enum: ['In Stock', 'Low Stock', 'Out of Stock'],
        default: 'Out of Stock'
    },
    images: [
        {
            public_id: {
                type: String,
                required: true
            },
            url: {
                type: String,
                required: true
            },
        }
    ],
    ratings: {
        type: Number,
        default: 0
    },
    numOfReviews: {
        type: Number,
        default: 0
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    },
    // soft delete
    deletedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

productSchema.pre('validate', function () {
    this.status = getStockStatus(this.stock);
});

module.exports = mongoose.model('Product', productSchema);
