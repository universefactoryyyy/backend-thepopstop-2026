const crypto = require('crypto')
const mongoose = require('mongoose')

const ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']

const orderSchema = mongoose.Schema({
    shippingInfo: {
        address: {
            type: String,
            required: [true, 'Shipping address is required']
        },
        phoneNo: {
            type: String,
            required: [true, 'Phone number is required']
        },
        postalCode: {
            type: String,
            default: ''
        }
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User'
    },
    orderItems: [
        {
            name: {
                type: String,
                required: true
            },
            series: {
                type: String,
                default: ''
            },
            quantity: {
                type: Number,
                required: true
            },
            image: {
                type: String,
                default: ''
            },
            // unit price at the time of purchase
            price: {
                type: Number,
                required: true
            },
            product: {
                type: mongoose.Schema.Types.ObjectId,
                required: true,
                ref: 'Product'
            }
        }
    ],
    paymentInfo: {
        method: {
            type: String,
            required: [true, 'Payment method is required']
        }
    },
    // sum of all items, before discount
    itemsPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    discountCode: {
        type: String,
        default: null
    },
    discountAmount: {
        type: Number,
        default: 0.0
    },
    // grand total = itemsPrice - discountAmount
    totalPrice: {
        type: Number,
        required: true,
        default: 0.0
    },
    orderStatus: {
        type: String,
        required: true,
        enum: {
            values: ORDER_STATUSES,
            message: 'Order status must be one of: ' + ORDER_STATUSES.join(', ')
        },
        default: 'Pending'
    },
    deliveredAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    // secret used by the download link in the order email; never sent back in API responses
    receiptToken: {
        type: String,
        default: () => crypto.randomBytes(24).toString('hex'),
        select: false
    }
})

orderSchema.set('toJSON', {
    transform: (_doc, ret) => {
        delete ret.receiptToken
        return ret
    }
})

orderSchema.statics.STATUSES = ORDER_STATUSES;

module.exports = mongoose.model('Order', orderSchema)
