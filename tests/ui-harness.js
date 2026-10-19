/*
 * Local UI harness (node tests/ui-harness.js) - NOT part of the real app.
 * Starts the real API on http://localhost:4001 against an in-memory MongoDB, seeded with the PopStop data,
 * with Cloudinary / Firebase / SMTP replaced by local stubs, so the React app can be clicked through
 * without any account. It also adds:
 *   GET /dev-login?role=admin|customer   -> sets the session cookie (open it once in the browser)
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'ui_harness_secret';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.SMTP_FROM_NAME = 'The Pop Stop';
process.env.SMTP_FROM_EMAIL = 'noreply@popstop.test';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
process.argv.push('--skip-firebase');

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const PORT = 4001;

// ---- stubs
const firebase = require('../config/firebase');
firebase.verifyFirebaseToken = async (token) => ({ uid: `uid-${token}`, email: `${token}@example.com`, email_verified: true });

const cloudinary = require('cloudinary');
let counter = 0;
cloudinary.v2.uploader.upload = async (file, options = {}) => {
    counter++;
    const name = path.basename(file);
    const local = /scripts[\\/]images/.test(file);
    const id = options.public_id || `${options.folder}/upload${counter}`;
    return { public_id: id, secure_url: local ? `http://localhost:${PORT}/seed-images/${name}` : `http://localhost:${PORT}/seed-images/placeholder.jpg` };
};
cloudinary.v2.uploader.destroy = async () => ({ result: 'ok' });

const nodemailer = require('nodemailer');
nodemailer.createTransport = () => ({
    sendMail: async (message) => {
        console.log(`[mail] to=${message.to} subject="${message.subject}" attachments=${(message.attachments || []).map(a => a.filename).join(',')}`);
        return {};
    },
});

(async () => {
    const mongod = await MongoMemoryServer.create();
    process.env.DB_URI = mongod.getUri('popstop_ui');

    const seed = require('../scripts/seed');
    const log = console.log;
    console.log = () => {};
    const out = process.stdout.write.bind(process.stdout);
    process.stdout.write = () => true;
    try { await seed.main(); } finally { console.log = log; process.stdout.write = out; }
    await mongoose.connect(process.env.DB_URI);

    const User = require('../models/user');
    const Product = require('../models/product');
    const Order = require('../models/order');
    const sendToken = require('../utils/jwtToken');

    // a customer with a delivered order (can review) and a pending one, plus older orders for the charts
    const customer = await User.create({
        name: 'Cara Customer', fname: 'Cara', lname: 'Customer', username: 'cara', email: 'cara@example.com',
        firebaseUid: 'uid-cara', phone: '09123456789', addressline: '12 Mint Street, Quezon City', zipcode: '1100',
    });
    const products = await Product.find({ deletedAt: null }).limit(6);
    const makeOrder = (items, status, createdAt) => {
        const orderItems = items.map(([p, quantity]) => ({
            name: p.name, series: p.series, quantity, image: p.images[0].url, price: p.price, product: p._id,
        }));
        const itemsPrice = orderItems.reduce((s, i) => s + i.price * i.quantity, 0);
        return Order.create({
            user: customer._id,
            shippingInfo: { address: customer.addressline, phoneNo: customer.phone, postalCode: customer.zipcode },
            orderItems, paymentInfo: { method: 'Cash on Delivery' }, itemsPrice, totalPrice: itemsPrice,
            orderStatus: status, createdAt, deliveredAt: status === 'Delivered' ? createdAt : undefined,
        });
    };
    const year = new Date().getFullYear();
    await makeOrder([[products[0], 1]], 'Delivered', new Date(year, 0, 15));
    await makeOrder([[products[1], 2]], 'Delivered', new Date(year, 2, 3));
    await makeOrder([[products[2], 1]], 'Delivered', new Date(year, 5, 20));
    await makeOrder([[products[3], 1], [products[4], 1]], 'Shipped', new Date(year, 8, 9));
    await makeOrder([[products[5], 1]], 'Pending', new Date());

    const app = require('../app');
    const outer = express();
    outer.use('/seed-images', express.static(path.join(__dirname, '..', 'scripts', 'images')));
    outer.get('/dev-login', async (req, res) => {
        const user = await User.findOne(req.query.role === 'customer' ? { email: 'cara@example.com' } : { role: 'admin' });
        sendToken(user, 200, res);
    });
    outer.use(app);
    outer.listen(PORT, () => console.log(`UI harness ready on http://localhost:${PORT}  (admin: /dev-login?role=admin, customer: /dev-login?role=customer)`));
})().catch(error => { console.error(error); process.exit(1); });
