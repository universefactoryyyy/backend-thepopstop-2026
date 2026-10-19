const mongoose = require('mongoose');
const validator = require('validator');
const jwt = require('jsonwebtoken');

// users + customer tables of the old MySQL schema merged into one collection.
// Passwords live in Firebase Authentication; roles / profile live here.
const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter your name'],
        trim: true,
        maxLength: [60, 'Your name cannot exceed 60 characters']
    },
    username: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxLength: [20, 'Username cannot exceed 20 characters'],
        match: [/^[a-z0-9_.]+$/, 'Username may only contain letters, numbers, underscores and dots']
    },
    email: {
        type: String,
        required: [true, 'Please enter your email'],
        unique: true,
        lowercase: true,
        trim: true,
        validate: [validator.isEmail, 'Please enter valid email address']
    },
    firebaseUid: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    // Legacy bcrypt hash carried over from the MySQL database (never used for login, never returned)
    password: {
        type: String,
        select: false
    },
    fname: { type: String, trim: true, maxLength: [40, 'First name cannot exceed 40 characters'] },
    lname: { type: String, trim: true, maxLength: [40, 'Last name cannot exceed 40 characters'] },
    addressline: { type: String, trim: true, maxLength: [250, 'Address cannot exceed 250 characters'] },
    zipcode: { type: String, trim: true, maxLength: [10, 'Zip code cannot exceed 10 characters'] },
    phone: { type: String, trim: true, maxLength: [20, 'Phone cannot exceed 20 characters'] },
    avatar: {
        public_id: { type: String, default: '' },
        url: { type: String, default: '' }
    },
    role: {
        type: String,
        enum: {
            values: ['customer', 'employee', 'admin'],
            message: 'Role must be customer, employee, or admin'
        },
        default: 'customer'
    },
    isActive: {
        type: Boolean,
        default: true
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

userSchema.methods.getJwtToken = function () {
    return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_TIME || '7d'
    });
}

module.exports = mongoose.model('User', userSchema);
