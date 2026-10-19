const User = require('../models/user')
const jwt = require("jsonwebtoken")

// Checks the session cookie (our own JWT, issued after the Firebase ID token was verified)
exports.isAuthenticatedUser = async (req, res, next) => {

    const { token } = req.cookies

    if (!token) {
        return res.status(401).json({ message: 'Login first to access this resource' })
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET)
    } catch (error) {
        return res.status(401).json({ message: 'Your session has expired. Please login again' })
    }

    const user = await User.findById(decoded.id);
    if (!user || user.deletedAt) {
        return res.status(401).json({ message: 'User no longer exists' })
    }
    if (!user.isActive) {
        return res.status(403).json({ message: 'Your account has been deactivated' })
    }

    req.user = user;
    next()
};

// Same as isAuthenticatedUser but never blocks - used by public routes that behave differently for admins
exports.optionalUser = async (req, res, next) => {
    const { token } = req.cookies
    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET)
            const user = await User.findById(decoded.id);
            if (user && !user.deletedAt && user.isActive) req.user = user;
        } catch (error) {
            // ignore - treated as a guest
        }
    }
    next()
};

// Role based access control: authorizeRoles('admin')
exports.authorizeRoles = (...roles) => {

    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: `Role (${req.user ? req.user.role : 'guest'}) is not allowed to access this resource` })
        }
        next()
    }
}
