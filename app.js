const express = require('express');
const app = express();
const cors = require('cors')
const cookieParser = require('cookie-parser')
const products = require('./routes/product');
const auth = require('./routes/auth');
const order = require('./routes/order');
const cart = require('./routes/cart');
const discount = require('./routes/discount');
const review = require('./routes/review');
const dashboard = require('./routes/dashboard');
const { notFound, errorHandler } = require('./middlewares/errors');

app.disable('x-powered-by');

// FRONTEND_URL can hold several origins separated by commas
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(o => o.trim());

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
// Express 5 leaves req.body undefined when nothing was sent
app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
});

app.get('/api/v1/health', (req, res) => res.status(200).json({ success: true, message: 'The Pop Stop API is running' }));

app.use('/api/v1', products);
app.use('/api/v1', auth);
app.use('/api/v1', order);
app.use('/api/v1', cart);
app.use('/api/v1', discount);
app.use('/api/v1', review);
app.use('/api/v1', dashboard);

app.use(notFound);
app.use(errorHandler);

module.exports = app
