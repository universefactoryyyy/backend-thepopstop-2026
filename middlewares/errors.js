const multer = require('multer');

exports.notFound = (req, res) => {
    res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler: Express 5 forwards rejected async handlers here automatically
exports.errorHandler = (err, req, res, next) => {
    if (res.headersSent) return next(err);

    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = Object.values(err.errors).map(e => e.message).join(', ');
    } else if (err.name === 'CastError') {
        // a malformed :id in the URL simply means "no such record"
        statusCode = err.path === '_id' ? 404 : 400;
        message = err.path === '_id' ? 'Resource not found' : `Invalid ${err.path}: ${err.value}`;
    } else if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue || {})[0] || 'value';
        message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
    } else if (err instanceof multer.MulterError) {
        statusCode = 400;
        message = err.code === 'LIMIT_FILE_SIZE' ? 'Each image must be 5MB or smaller' : err.message;
    } else if (err.message && err.message.startsWith('Unsupported file type')) {
        statusCode = 400;
    } else if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Invalid JSON body';
    }

    if (statusCode >= 500) console.error(err);

    res.status(statusCode).json({ success: false, message });
}
