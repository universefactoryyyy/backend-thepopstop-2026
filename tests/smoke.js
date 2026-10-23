/*
 * End-to-end smoke test (npm test).
 * Runs the real Express app + seed script against an in-memory MongoDB.
 * Only the three external services are replaced with stubs: Firebase token verification,
 * Cloudinary uploads and the Brevo mail API - so no accounts or credentials are needed.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_for_smoke_test_only';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.BREVO_API_KEY = 'test-brevo-key';
process.env.BREVO_FROM_NAME = 'The Pop Stop';
process.env.BREVO_FROM_EMAIL = 'noreply@popstop.test';
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';
process.argv.push('--skip-firebase');

const assert = require('assert');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// ---------- stubs ----------
const firebase = require('../config/firebase');
const FIREBASE_USERS = {
    'tok-admin': { uid: 'uid-admin', email: 'admin@popstop.com', email_verified: true },
    'tok-cust1': { uid: 'uid-cust1', email: 'cust1@example.com', email_verified: false },
    'tok-cust2': { uid: 'uid-cust2', email: 'cust2@example.com', email_verified: false },
    'tok-google': { uid: 'uid-google', email: 'gina@gmail.com', email_verified: true, name: 'Gina Google', picture: 'https://example.com/gina.png' },
    'tok-google-nopic': { uid: 'uid-nopic', email: 'nopic@gmail.com', email_verified: true, name: 'No Pic' },
    'tok-unverified-admin': { uid: 'uid-evil', email: 'admin@popstop.com', email_verified: false },
};
firebase.verifyFirebaseToken = async (token) => {
    if (!FIREBASE_USERS[token]) throw new Error('bad token');
    return FIREBASE_USERS[token];
};

const cloudinary = require('cloudinary');
let uploadCount = 0;
const destroyed = [];
cloudinary.v2.uploader.upload = async (file, options = {}) => {
    uploadCount++;
    const id = options.public_id || `${options.folder}/img${uploadCount}`;
    return { public_id: id, secure_url: `https://res.cloudinary.com/test/image/upload/${id}.jpg` };
};
cloudinary.v2.uploader.destroy = async (id) => { destroyed.push(id); return { result: 'ok' }; };

const mails = [];
const originalFetch = global.fetch.bind(global);
global.fetch = async (url, init = {}) => {
    if (String(url).includes('api.brevo.com')) {
        const body = JSON.parse(init.body);
        mails.push({
            to: body.to[0].email,
            subject: body.subject,
            html: body.htmlContent,
            attachments: (body.attachment || []).map((file) => ({
                filename: file.name,
                content: Buffer.from(file.content, 'base64'),
                contentDisposition: 'attachment',
            })),
        });
        return { ok: true, status: 201, json: async () => ({ messageId: 'test' }) };
    }
    return originalFetch(url, init);
};

// ---------- tiny test helpers ----------
let passed = 0;
const step = async (name, fn) => {
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (error) {
        console.log(`  FAIL ${name}\n       ${error.message}`);
        process.exitCode = 1;
        throw error;
    }
};

let baseUrl;
const makeClient = () => {
    let cookie = '';
    const request = async (method, url, body, isForm = false) => {
        const headers = {};
        if (cookie) headers.cookie = cookie;
        let payload;
        if (body !== undefined) {
            if (isForm) payload = body;
            else { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
        }
        const res = await fetch(baseUrl + url, { method, headers, body: payload });
        const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
        setCookie.forEach(c => {
            const [pair] = c.split(';');
            if (pair.startsWith('token=')) cookie = pair.endsWith('=') ? '' : pair;
        });
        const type = res.headers.get('content-type') || '';
        const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
        return { status: res.status, data, headers: res.headers };
    };
    return {
        get: (u) => request('GET', u),
        post: (u, b) => request('POST', u, b),
        put: (u, b) => request('PUT', u, b),
        del: (u, b) => request('DELETE', u, b),
        form: (method, u, fields, files = []) => {
            const form = new FormData();
            Object.entries(fields).forEach(([k, v]) => form.append(k, v));
            files.forEach(f => form.append(f.field, new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }), f.name));
            return request(method, u, form, true);
        }
    };
};

const run = async () => {
    const mongod = await MongoMemoryServer.create();
    process.env.DB_URI = mongod.getUri('popstop_test');
    console.log('In-memory MongoDB started');

    // ---------- seed ----------
    const seed = require('../scripts/seed');
    await step('seed script inserts products, images and discounts', async () => {
        const log = console.log; console.log = () => { }; const out = process.stdout.write; process.stdout.write = () => true;
        try { await seed.main(); } finally { console.log = log; process.stdout.write = out; }
        await mongoose.disconnect();
        await mongoose.connect(process.env.DB_URI);
        const Product = require('../models/product');
        const Discount = require('../models/discount');
        const User = require('../models/user');
        assert.strictEqual(await Product.countDocuments(), 24);
        assert.strictEqual(await Discount.countDocuments(), 3);
        const sku3 = await Product.findOne({ sku: 'PM-SKP-001' });
        assert.strictEqual(sku3.images.length, 3);
        assert.strictEqual(sku3.price, 1700);
        assert.strictEqual(sku3.costPrice, 1600);
        assert.strictEqual(sku3.stock, 20);
        const crybaby = await Product.findOne({ sku: 'PM-CRY-001' });
        assert.strictEqual(crybaby.status, 'Low Stock');
        assert.strictEqual(crybaby.price, 7280);
        const save100 = await Discount.findOne({ code: 'SAVE100' });
        assert.strictEqual(save100.discountType, 'fixed');
        assert.strictEqual(save100.minOrderAmount, 1000);
        assert.strictEqual(save100.maxUses, 50);
        const welcome = await Discount.findOne({ code: 'WELCOME50' });
        assert.strictEqual(welcome.maxUses, null);
        const admin = await User.findOne({ email: 'admin@popstop.com' }).select('+password');
        assert.strictEqual(admin.role, 'admin');
        assert.ok(admin.password.startsWith('$2b$10$'));
        // running again must not duplicate anything
        const total = uploadCount;
        console.log = () => { }; process.stdout.write = () => true;
        try { await seed.main(); } finally { console.log = log; process.stdout.write = out; }
        await mongoose.disconnect();
        await mongoose.connect(process.env.DB_URI);
        assert.strictEqual(await Product.countDocuments(), 24);
        assert.strictEqual(await Discount.countDocuments(), 3);
        assert.strictEqual(await User.countDocuments(), 1);
        assert.ok(uploadCount >= total);
    });

    const app = require('../app');
    const server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

    const admin = makeClient();
    const cust1 = makeClient();
    const cust2 = makeClient();
    const guest = makeClient();
    const Product = require('../models/product');

    // ---------- authentication ----------
    await step('guest cannot reach protected routes', async () => {
        assert.strictEqual((await guest.get('/me')).status, 401);
        assert.strictEqual((await guest.get('/admin/products')).status, 401);
        assert.strictEqual((await guest.get('/cart')).status, 401);
    });
    await step('unverified email cannot hijack the seeded admin profile', async () => {
        const r = await guest.post('/login', { idToken: 'tok-unverified-admin' });
        assert.strictEqual(r.status, 403);
    });
    await step('admin logs in with a Firebase token (profile linked by verified email)', async () => {
        const r = await admin.post('/login', { idToken: 'tok-admin' });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.data.user.role, 'admin');
        assert.ok(!('password' in r.data.user));
        const me = await admin.get('/me');
        assert.strictEqual(me.data.user.email, 'admin@popstop.com');
    });
    await step('login rejects invalid tokens and unknown profiles', async () => {
        assert.strictEqual((await guest.post('/login', { idToken: 'nope' })).status, 401);
        assert.strictEqual((await guest.post('/login', { idToken: 'tok-cust1' })).status, 404);
        assert.strictEqual((await guest.post('/login', {})).status, 400);
    });
    await step('register validates fields (server-side) and creates profile + avatar', async () => {
        const bad = await cust1.form('POST', '/register', { idToken: 'tok-cust1', fname: 'Cara' });
        assert.strictEqual(bad.status, 400);
        const r = await cust1.form('POST', '/register', {
            idToken: 'tok-cust1', fname: 'Cara', lname: 'Customer', username: 'Cara_C', phone: '09123456789',
            addressline: '1 Pastel St, Manila', zipcode: '1000'
        }, [{ field: 'avatar', name: 'me.png' }]);
        assert.strictEqual(r.status, 201, JSON.stringify(r.data));
        assert.strictEqual(r.data.user.role, 'customer');
        assert.ok(r.data.user.avatar.url.includes('popstop/avatars'));
        assert.strictEqual(r.data.user.username, 'cara_c');
        const dup = await guest.form('POST', '/register', { idToken: 'tok-cust1', fname: 'Cara', lname: 'C', phone: '09123456789', addressline: 'x' });
        assert.strictEqual(dup.status, 409);
        const r2 = await cust2.form('POST', '/register', { idToken: 'tok-cust2', fname: 'Dan', lname: 'Dee', phone: '09123456780', addressline: '2 Beige Ave' });
        assert.strictEqual(r2.status, 201);
    });
    await step('logout removes the session token', async () => {
        const session = makeClient();
        assert.strictEqual((await session.post('/login', { idToken: 'tok-cust1' })).status, 200);
        assert.strictEqual((await session.get('/me')).status, 200);
        assert.strictEqual((await session.get('/logout')).status, 200);
        assert.strictEqual((await session.get('/me')).status, 401);
    });
    await step('username lookup returns the email for login', async () => {
        const ok = await guest.post('/login/lookup', { identifier: 'CARA_C' });
        assert.strictEqual(ok.data.email, 'cust1@example.com');
        assert.strictEqual((await guest.post('/login/lookup', { identifier: 'nobody' })).status, 401);
    });
    await step('Google sign-in creates a profile and keeps the Google photo', async () => {
        const g = makeClient();
        const r = await g.post('/login/social', { idToken: 'tok-google' });
        assert.strictEqual(r.status, 201);
        assert.strictEqual(r.data.user.fname, 'Gina');
        assert.strictEqual(r.data.user.avatar.url, 'https://example.com/gina.png');
        const again = await g.post('/login/social', { idToken: 'tok-google' });
        assert.strictEqual(again.status, 200);
        assert.strictEqual(again.data.user.avatar.url, 'https://example.com/gina.png');
        const plain = await makeClient().post('/login/social', { idToken: 'tok-google-nopic' });
        assert.strictEqual(plain.status, 201);
        assert.strictEqual(plain.data.user.avatar.url, '');
        assert.strictEqual(plain.data.user.fname, 'No');
    });
    await step('profile update with new photo (old Cloudinary photo removed)', async () => {
        const r = await cust1.form('PUT', '/me/update', { fname: 'Cara', lname: 'Updated', username: 'cara_c', phone: '09999999999', addressline: 'New Address 5', zipcode: '2000' }, [{ field: 'avatar', name: 'new.png' }]);
        assert.strictEqual(r.status, 200, JSON.stringify(r.data));
        assert.strictEqual(r.data.user.lname, 'Updated');
        assert.strictEqual(r.data.user.name, 'Cara Updated');
        assert.ok(destroyed.some(id => id.includes('avatars')));
        const invalid = await cust1.form('PUT', '/me/update', { fname: '', lname: 'x', phone: '1', addressline: '' });
        assert.strictEqual(invalid.status, 400);
    });
    await step('role-based access: customer is blocked from admin endpoints', async () => {
        for (const url of ['/admin/products', '/admin/users', '/admin/orders', '/admin/discounts', '/admin/reviews', '/admin/stats', '/admin/sales-per-month']) {
            assert.strictEqual((await cust1.get(url)).status, 403, url);
        }
    });

    // ---------- catalog ----------
    await step('catalog: pagination (infinite scroll), search, filters, sort', async () => {
        const p1 = await guest.get('/products?limit=8&page=1');
        assert.strictEqual(p1.data.products.length, 8);
        assert.strictEqual(p1.data.filteredProductsCount, 24);
        assert.strictEqual(p1.data.hasMore, true);
        const p3 = await guest.get('/products?limit=8&page=3');
        assert.strictEqual(p3.data.products.length, 8);
        assert.strictEqual(p3.data.hasMore, false);
        const ids = new Set([...p1.data.products, ...(await guest.get('/products?limit=8&page=2')).data.products, ...p3.data.products].map(p => p._id));
        assert.strictEqual(ids.size, 24);
        assert.strictEqual((await guest.get('/products?keyword=labubu')).data.filteredProductsCount, 2);
        assert.strictEqual((await guest.get('/products?series=Crybaby')).data.filteredProductsCount, 4);
        assert.strictEqual((await guest.get('/products?brand=Funko')).data.filteredProductsCount, 10);
        assert.strictEqual((await guest.get('/products?series=Skullpanda,Crybaby')).data.filteredProductsCount, 7);
        const price = await guest.get('/products?price[gte]=1000&price[lte]=2000');
        assert.strictEqual(price.data.filteredProductsCount, 10);  // nine 1700-priced figures + the 1195 Funko
        assert.ok(price.data.products.every(p => p.price >= 1000 && p.price <= 2000));
        assert.strictEqual((await guest.get('/products?ratings[gte]=4')).data.filteredProductsCount, 0);
        assert.strictEqual((await guest.get('/products?numOfReviews[gte]=1')).data.filteredProductsCount, 0);
        const sorted = (await guest.get('/products?sort=price_desc&limit=3')).data.products;
        assert.strictEqual(sorted[0].price, 7280);
        assert.strictEqual((await guest.get('/products?keyword=%5B')).status, 200);  // regex characters are escaped
    });
    await step('autocomplete + filter options', async () => {
        const s = await guest.get('/products/suggest?q=skull');
        assert.ok(s.data.suggestions.length >= 3);
        assert.ok(s.data.suggestions[0].image.startsWith('https://'));
        assert.strictEqual((await guest.get('/products/suggest?q=')).data.suggestions.length, 0);
        const f = await guest.get('/products/filters');
        assert.deepStrictEqual(f.data.brands, ['Funko', 'Pop Mart']);
        assert.ok(f.data.series.includes('Skullpanda'));
        assert.strictEqual(f.data.minPrice, 695);
        assert.strictEqual(f.data.maxPrice, 7280);
    });

    // ---------- product CRUD ----------
    let newProductId;
    await step('admin creates a product with several photos; validation rejects bad input', async () => {
        const bad = await admin.form('POST', '/admin/product/new', { name: 'x' });
        assert.strictEqual(bad.status, 400);
        const fields = { name: 'Test Dimoo', series: 'Dimoo', brand: 'Pop Mart', price: '999', costPrice: '800', sku: 'pm-dim-001', description: 'Cute test figure', stock: '4' };
        const r = await admin.form('POST', '/admin/product/new', fields, [{ field: 'images', name: 'a.png' }, { field: 'images', name: 'b.jpg' }, { field: 'images', name: 'c.png' }]);
        assert.strictEqual(r.status, 201, JSON.stringify(r.data));
        assert.strictEqual(r.data.product.images.length, 3);
        assert.strictEqual(r.data.product.status, 'Low Stock');
        assert.strictEqual(r.data.product.sku, 'PM-DIM-001');
        newProductId = r.data.product._id;
        const dup = await admin.form('POST', '/admin/product/new', fields, [{ field: 'images', name: 'a.png' }]);
        assert.strictEqual(dup.status, 201, JSON.stringify(dup.data));
        assert.strictEqual(dup.data.product.sku, 'PM-DIM-002');
        const noPhoto = await admin.form('POST', '/admin/product/new', { ...fields, sku: 'X-1' });
        assert.strictEqual(noPhoto.status, 400);
        const negative = await admin.form('POST', '/admin/product/new', { ...fields, sku: 'X-2', price: '-5' }, [{ field: 'images', name: 'a.png' }]);
        assert.strictEqual(negative.status, 400);
    });
    await step('admin updates a product: stock status recalculates, removed photos are deleted', async () => {
        const before = (await guest.get(`/product/${newProductId}`)).data.product;
        const keep = [before.images[0].public_id];
        const r = await admin.form('PUT', `/admin/product/${newProductId}`, { stock: '30', price: '1100', keepImages: JSON.stringify(keep) }, [{ field: 'images', name: 'd.png' }]);
        assert.strictEqual(r.status, 200, JSON.stringify(r.data));
        assert.strictEqual(r.data.product.status, 'In Stock');
        assert.strictEqual(r.data.product.images.length, 2);
        assert.strictEqual(r.data.product.price, 1100);
        assert.ok(destroyed.includes(before.images[1].public_id));
        const none = await admin.form('PUT', `/admin/product/${newProductId}`, { keepImages: '[]' });
        assert.strictEqual(none.status, 400);
    });
    await step('soft delete (single + bulk) hides products from the shop, restore brings them back', async () => {
        const list = (await admin.get('/admin/products')).data.products;
        const [a, b] = list.filter(p => p._id !== newProductId).slice(0, 2).map(p => p._id);
        assert.strictEqual((await admin.del(`/admin/product/${newProductId}`)).status, 200);
        assert.strictEqual((await guest.get(`/product/${newProductId}`)).status, 404);
        assert.strictEqual((await admin.get(`/product/${newProductId}`)).status, 200);
        const bulk = await admin.del('/admin/products', { ids: [a, b] });
        assert.strictEqual(bulk.data.deletedCount, 2);
        assert.strictEqual((await guest.get('/products')).data.filteredProductsCount, 23);
        assert.strictEqual((await admin.get('/admin/products')).data.products.length, 26);
        assert.strictEqual((await admin.del('/admin/products', { ids: [] })).status, 400);
        await admin.put(`/admin/product/${a}/restore`);
        await admin.put(`/admin/product/${b}/restore`);
        await admin.put(`/admin/product/${newProductId}/restore`);
        assert.strictEqual((await guest.get('/products')).data.filteredProductsCount, 26);
    });

    // ---------- cart + discounts + checkout ----------
    const wolverine = await Product.findOne({ sku: 'FK-MAR-001' });   // 695, stock 30
    const skp = await Product.findOne({ sku: 'PM-SKP-001' });        // 1700, stock 20
    const crybaby1 = await Product.findOne({ sku: 'PM-CRY-001' });   // 7280, stock 5
    let cartItemId;
    await step('cart: add, merge quantity, update, stock limits, remove', async () => {
        assert.strictEqual((await cust1.post('/cart', { productId: skp._id, quantity: 1 })).status, 200);
        const added = await cust1.post('/cart', { productId: skp._id, quantity: 1 });
        assert.strictEqual(added.data.cartItems.length, 1);
        assert.strictEqual(added.data.cartItems[0].quantity, 2);
        cartItemId = added.data.cartItems[0]._id;
        assert.strictEqual((await cust1.post('/cart', { productId: crybaby1._id, quantity: 6 })).status, 400);
        assert.strictEqual((await cust1.put(`/cart/${cartItemId}`, { quantity: 0 })).status, 400);
        assert.strictEqual((await cust1.put(`/cart/${cartItemId}`, { quantity: 99 })).status, 400);
        const upd = await cust1.put(`/cart/${cartItemId}`, { quantity: 1 });
        assert.strictEqual(upd.data.cartItems[0].quantity, 1);
        await cust1.post('/cart', { productId: wolverine._id, quantity: 2 });
        const cart = (await cust1.get('/cart')).data.cartItems;
        assert.strictEqual(cart.length, 2);
        assert.strictEqual((await cust2.get('/cart')).data.cartItems.length, 0);
        assert.strictEqual((await cust2.del(`/cart/${cartItemId}`)).status, 200);          // cannot remove someone else's row
        assert.strictEqual((await cust1.get('/cart')).data.cartItems.length, 2);
    });
    await step('discount codes: validate, applicable list, rules', async () => {
        const ok = await cust1.post('/discount/validate', { code: 'popstop10', subtotal: 3090 });
        assert.strictEqual(ok.data.discountAmount, 309);
        assert.strictEqual((await cust1.post('/discount/validate', { code: 'SAVE100', subtotal: 500 })).status, 400);
        assert.strictEqual((await cust1.post('/discount/validate', { code: 'NOPE', subtotal: 5000 })).status, 404);
        const list = await cust1.get('/discounts/applicable?subtotal=1000');
        assert.deepStrictEqual(list.data.discounts.map(d => d.code).sort(), ['POPSTOP10', 'SAVE100', 'WELCOME50']);
        assert.strictEqual((await cust1.get('/discounts/applicable?subtotal=400')).data.discounts.length, 1);
    });
    let order1;
    await step('checkout: server-priced order, discount applied, stock reduced, cart cleared, email + PDF sent', async () => {
        assert.strictEqual((await cust1.post('/order/new', { shippingInfo: { address: '' }, paymentMethod: 'COD' })).status, 400);
        const r = await cust1.post('/order/new', {
            shippingInfo: { address: '1 Pastel St', phoneNo: '09123456789', postalCode: '1000' },
            paymentMethod: 'Cash on Delivery', discountCode: 'save100'
        });
        assert.strictEqual(r.status, 201, JSON.stringify(r.data));
        order1 = r.data.order;
        assert.strictEqual(order1.itemsPrice, 1700 + 695 * 2);
        assert.strictEqual(order1.discountAmount, 100);
        assert.strictEqual(order1.totalPrice, 1700 + 1390 - 100);
        assert.strictEqual(order1.orderStatus, 'Pending');
        assert.strictEqual(r.data.emailSent, true);
        const mail = mails[mails.length - 1];
        assert.strictEqual(mail.to, 'cust1@example.com');
        assert.ok(mail.attachments[0].filename.endsWith('.pdf'));
        assert.strictEqual(mail.attachments[0].contentDisposition, 'attachment');
        assert.strictEqual(mail.attachments[0].content.slice(0, 4).toString(), '%PDF');
        assert.ok(mail.html.includes('Download PDF receipt'));
        assert.ok(mail.html.includes('/receipt/file?token='));
        assert.strictEqual(order1.receiptToken, undefined);
        const Order = require('../models/order');
        const stored = await Order.findById(order1._id).select('+receiptToken');
        const file = await guest.get(`/order/${order1._id}/receipt/file?token=${stored.receiptToken}`);
        assert.strictEqual(file.status, 200);
        assert.strictEqual(file.headers.get('content-type'), 'application/pdf');
        assert.ok(String(file.headers.get('content-disposition')).includes('attachment'));
        assert.strictEqual(file.data.slice(0, 4).toString(), '%PDF');
        assert.strictEqual((await guest.get(`/order/${order1._id}/receipt/file`)).status, 403);
        assert.strictEqual((await guest.get(`/order/${order1._id}/receipt/file?token=nope`)).status, 403);
        assert.ok(mail.html.includes('Grand Total') && mail.html.includes('SAVE100'));
        assert.strictEqual((await Product.findById(skp._id)).stock, 19);
        assert.strictEqual((await Product.findById(wolverine._id)).stock, 28);
        assert.strictEqual((await cust1.get('/cart')).data.cartItems.length, 0);
        assert.strictEqual((await require('../models/discount').findOne({ code: 'SAVE100' })).usedCount, 1);
        assert.strictEqual((await cust1.post('/order/new', { shippingInfo: { address: 'a', phoneNo: '1' }, paymentMethod: 'COD' })).status, 400); // empty cart
    });
    await step('checkout cannot oversell the last items', async () => {
        await cust1.post('/cart', { productId: crybaby1._id, quantity: 5 });
        await cust2.post('/cart', { productId: crybaby1._id, quantity: 5 });
        const body = { shippingInfo: { address: 'x', phoneNo: '123' }, paymentMethod: 'GCash' };
        const [a, b] = await Promise.all([cust1.post('/order/new', body), cust2.post('/order/new', body)]);
        assert.deepStrictEqual([a.status, b.status].sort(), [201, 400]);
        const p = await Product.findById(crybaby1._id);
        assert.strictEqual(p.stock, 0);
        assert.strictEqual(p.status, 'Out of Stock');
        assert.strictEqual((await cust1.post('/cart', { productId: crybaby1._id, quantity: 1 })).status, 400);
    });
    await step('orders: owner/admin access only, receipt PDF download', async () => {
        const mine = await cust1.get('/orders/me');
        assert.ok(mine.data.orders.length >= 1);
        assert.strictEqual((await cust1.get(`/order/${order1._id}`)).status, 200);
        assert.strictEqual((await cust2.get(`/order/${order1._id}`)).status, 403);
        assert.strictEqual((await cust2.get(`/order/${order1._id}/receipt`)).status, 403);
        const pdf = await cust1.get(`/order/${order1._id}/receipt`);
        assert.strictEqual(pdf.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(pdf.data.slice(0, 4).toString(), '%PDF');
        const all = await admin.get('/admin/orders');
        assert.ok(all.data.orders.length >= 2);
        assert.ok(all.data.orders[0].user.email);
    });

    // ---------- reviews ----------
    await step('reviews: only after the order is delivered', async () => {
        const body = { productId: skp._id, rating: 5, comment: 'Love it' };
        assert.strictEqual((await cust1.put('/review', body)).status, 403);            // order is Pending
        assert.strictEqual((await guest.put('/review', body)).status, 401);
        assert.strictEqual((await cust1.get(`/review/eligibility?productId=${skp._id}`)).data.canReview, false);

        // admin updates status -> email with PDF attached each time
        const mailsBefore = mails.length;
        const proc = await admin.put(`/admin/order/${order1._id}`, { status: 'Processing' });
        assert.strictEqual(proc.status, 200);
        assert.strictEqual(proc.data.emailSent, true);
        assert.strictEqual(mails.length, mailsBefore + 1);
        assert.ok(mails[mails.length - 1].subject.includes('Status Update'));
        assert.ok(mails[mails.length - 1].html.includes('Processing'));
        assert.ok(mails[mails.length - 1].attachments[0].content.slice(0, 4).toString() === '%PDF');
        assert.strictEqual((await admin.put(`/admin/order/${order1._id}`, { status: 'Processing' })).status, 400);
        assert.strictEqual((await admin.put(`/admin/order/${order1._id}`, { status: 'Bogus' })).status, 400);
        assert.strictEqual((await cust1.put(`/admin/order/${order1._id}`, { status: 'Shipped' })).status, 403);
        await admin.put(`/admin/order/${order1._id}`, { status: 'Shipped' });
        assert.strictEqual((await cust1.put('/review', body)).status, 403);            // still not delivered
        const delivered = await admin.put(`/admin/order/${order1._id}`, { status: 'Delivered' });
        assert.strictEqual(delivered.data.order.orderStatus, 'Delivered');
        assert.ok(delivered.data.order.deliveredAt);
        assert.strictEqual((await admin.put(`/admin/order/${order1._id}`, { status: 'Cancelled' })).status, 400); // final
        assert.strictEqual((await cust1.get(`/review/eligibility?productId=${skp._id}`)).data.canReview, true);
    });
    let reviewId;
    await step('reviews: create, bad words masked (bad-words), edit own review, ratings recalculated', async () => {
        assert.strictEqual((await cust2.put('/review', { productId: skp._id, rating: 4, comment: 'nice' })).status, 403); // never bought it
        assert.strictEqual((await cust1.put('/review', { productId: skp._id, rating: 9, comment: 'x' })).status, 400);
        const created = await cust1.put('/review', { productId: skp._id, rating: 5, comment: 'This shit is fucking awesome, gago!' });
        assert.strictEqual(created.status, 201);
        assert.ok(!/shit|fuck|gago/i.test(created.data.review.comment), created.data.review.comment);
        assert.ok(created.data.review.comment.includes('****'));
        reviewId = created.data.review._id;
        let p = await Product.findById(skp._id);
        assert.strictEqual(p.ratings, 5);
        assert.strictEqual(p.numOfReviews, 1);
        const edited = await cust1.put('/review', { productId: skp._id, rating: 3, comment: 'Changed my mind, it is ok' });
        assert.strictEqual(edited.status, 200);
        assert.strictEqual(edited.data.isEdit, true);
        assert.strictEqual(edited.data.review._id, reviewId);
        p = await Product.findById(skp._id);
        assert.strictEqual(p.ratings, 3);
        assert.strictEqual(p.numOfReviews, 1);
        const list = await guest.get(`/reviews?productId=${skp._id}`);
        assert.strictEqual(list.data.reviews.length, 1);
        assert.strictEqual(list.data.reviews[0].user.name, 'Cara Updated');
        assert.strictEqual(list.data.reviews[0].anonymous, false);
        const hidden = await cust1.put('/review', { productId: skp._id, rating: 3, comment: 'Changed my mind, it is ok', anonymous: true });
        assert.strictEqual(hidden.status, 200);
        assert.strictEqual(hidden.data.review.anonymous, true);
        const hiddenList = await guest.get(`/reviews?productId=${skp._id}`);
        assert.strictEqual(hiddenList.data.reviews[0].user.name, 'Anonymous');
        assert.strictEqual(hiddenList.data.reviews[0].user._id, undefined);
        assert.strictEqual(hiddenList.data.reviews[0].user.avatar, undefined);
        const moderated = await admin.get('/admin/reviews');
        assert.strictEqual(moderated.data.reviews[0].anonymous, true);
        assert.strictEqual(moderated.data.reviews[0].user.name, 'Cara Updated');
        assert.strictEqual((await guest.get('/products?ratings[gte]=3')).data.filteredProductsCount, 1);
        assert.strictEqual((await guest.get('/products?numOfReviews[gte]=1')).data.filteredProductsCount, 1);
        assert.strictEqual((await guest.get('/products?numOfReviews[gte]=5')).data.filteredProductsCount, 0);
    });
    await step('reviews: only admin can delete a review', async () => {
        assert.strictEqual((await cust1.del(`/admin/review/${reviewId}`)).status, 403);
        assert.strictEqual((await admin.get('/admin/reviews')).data.reviews.length, 1);
        assert.strictEqual((await admin.del(`/admin/review/${reviewId}`)).status, 200);
        const p = await Product.findById(skp._id);
        assert.strictEqual(p.ratings, 0);
        assert.strictEqual(p.numOfReviews, 0);
    });
    await step('admin can review products from their own delivered orders', async () => {
        assert.strictEqual((await admin.get(`/review/eligibility?productId=${wolverine._id}`)).data.canReview, false);
        await admin.post('/cart', { productId: wolverine._id, quantity: 1 });
        const placed = await admin.post('/order/new', {
            shippingInfo: { address: 'Admin HQ', phoneNo: '09999999999', postalCode: '1000' },
            paymentMethod: 'Cash on Delivery',
        });
        assert.strictEqual(placed.status, 201, JSON.stringify(placed.data));
        await admin.put(`/admin/order/${placed.data.order._id}`, { status: 'Processing' });
        await admin.put(`/admin/order/${placed.data.order._id}`, { status: 'Shipped' });
        await admin.put(`/admin/order/${placed.data.order._id}`, { status: 'Delivered' });
        assert.strictEqual((await admin.get(`/review/eligibility?productId=${wolverine._id}`)).data.canReview, true);
        const created = await admin.put('/review', { productId: wolverine._id, rating: 5, comment: 'Bought this myself' });
        assert.strictEqual(created.status, 201, JSON.stringify(created.data));
        assert.strictEqual(created.data.review.rating, 5);
    });

    // ---------- cancel restores stock ----------
    await step('cancelling an order restores stock and discount usage', async () => {
        const Discount = require('../models/discount');
        await cust2.del('/cart');   // the loser of the previous test still has the sold-out item in the cart
        await cust2.post('/cart', { productId: wolverine._id, quantity: 3 });
        const before = (await Product.findById(wolverine._id)).stock;
        const o = await cust2.post('/order/new', { shippingInfo: { address: 'y', phoneNo: '1234567' }, paymentMethod: 'Credit Card', discountCode: 'WELCOME50' });
        assert.strictEqual(o.status, 201, JSON.stringify(o.data));
        assert.strictEqual(o.data.order.totalPrice, 695 * 3 - 50);
        assert.strictEqual((await Product.findById(wolverine._id)).stock, before - 3);
        const usedBefore = (await Discount.findOne({ code: 'WELCOME50' })).usedCount;
        const c = await admin.put(`/admin/order/${o.data.order._id}`, { status: 'Cancelled' });
        assert.strictEqual(c.status, 200);
        assert.strictEqual((await Product.findById(wolverine._id)).stock, before);
        assert.strictEqual((await Discount.findOne({ code: 'WELCOME50' })).usedCount, usedBefore - 1);
    });

    // ---------- admin: discounts, users, analytics ----------
    await step('admin discount CRUD with validation', async () => {
        const created = await admin.post('/admin/discount/new', { code: 'summer20', description: '20% off', discountType: 'percent', discountValue: 20, minOrderAmount: 100, maxUses: '', expiresAt: '' });
        assert.strictEqual(created.status, 201, JSON.stringify(created.data));
        assert.strictEqual(created.data.discount.code, 'SUMMER20');
        assert.strictEqual(created.data.discount.maxUses, null);
        assert.strictEqual((await admin.post('/admin/discount/new', { code: 'SUMMER20', discountValue: 5 })).status, 409);
        assert.strictEqual((await admin.post('/admin/discount/new', { code: 'BAD', discountType: 'percent', discountValue: 150 })).status, 400);
        const id = created.data.discount._id;
        assert.strictEqual((await admin.put(`/admin/discount/${id}`, { isActive: false })).data.discount.isActive, false);
        assert.strictEqual((await cust1.post('/discount/validate', { code: 'SUMMER20', subtotal: 500 })).status, 404);
        assert.strictEqual((await admin.del(`/admin/discount/${id}`)).status, 200);
        assert.strictEqual((await admin.get('/admin/discounts')).data.discounts.length, 3);
    });
    await step('admin users: list, assign role, deactivate (blocks sessions), soft delete, no self lock-out', async () => {
        const users = (await admin.get('/admin/users')).data.users;
        assert.ok(users.length >= 4);
        const cara = users.find(u => u.email === 'cust1@example.com');
        const adminUser = users.find(u => u.role === 'admin');
        assert.strictEqual((await admin.put(`/admin/user/${adminUser._id}`, { role: 'customer' })).status, 400);
        assert.strictEqual((await admin.put(`/admin/user/${adminUser._id}`, { isActive: false })).status, 400);
        assert.strictEqual((await admin.del(`/admin/user/${adminUser._id}`)).status, 400);
        assert.strictEqual((await admin.put(`/admin/user/${cara._id}`, { role: 'superuser' })).status, 400);
        assert.strictEqual((await admin.put(`/admin/user/${cara._id}`, { role: 'admin' })).status, 400);
        await admin.put(`/admin/user/${cara._id}`, { role: 'customer', isActive: false });
        assert.strictEqual((await cust1.get('/me')).status, 403);
        assert.strictEqual((await guest.post('/login', { idToken: 'tok-cust1' })).status, 403);
        await admin.put(`/admin/user/${cara._id}`, { isActive: true });
        assert.strictEqual((await cust1.get('/me')).status, 200);
        assert.strictEqual((await admin.put(`/admin/user/${cara._id}`, { role: 'employee' })).data.user.role, 'employee');
        assert.strictEqual((await admin.put(`/admin/user/${cara._id}`, { role: 'admin' })).status, 400);
        assert.strictEqual((await cust1.get('/admin/products')).status, 403);
        assert.strictEqual((await cust1.get('/admin/orders')).status, 200);
        assert.strictEqual((await cust1.get(`/order/${order1._id}`)).status, 200);
        assert.strictEqual((await cust1.del(`/admin/order/${order1._id}`)).status, 403);
        assert.strictEqual((await cust1.put(`/admin/order/${order1._id}`, { status: 'Processing' })).status, 400);
        await admin.put(`/admin/user/${cara._id}`, { role: 'customer' });
        assert.strictEqual((await cust1.get('/admin/orders')).status, 403);
        const dan = users.find(u => u.email === 'cust2@example.com');
        assert.strictEqual((await admin.del(`/admin/user/${dan._id}`)).status, 200);
        assert.strictEqual((await cust2.get('/me')).status, 401);
        assert.ok(!(await admin.get('/admin/users')).data.users.some(u => u.email === 'cust2@example.com'));
    });
    await step('analytics: monthly sales has all 12 months, date-range sales, stats', async () => {
        const m = await admin.get('/admin/sales-per-month');
        assert.strictEqual(m.data.salesPerMonth.length, 12);
        assert.deepStrictEqual(m.data.salesPerMonth.map(x => x.month), ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
        const sum = m.data.salesPerMonth.reduce((s, x) => s + x.total, 0);
        assert.ok(sum > 0);
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        const startDate = new Date(`${today}T00:00:00Z`);
        startDate.setUTCDate(startDate.getUTCDate() - 6);
        const start = startDate.toISOString().slice(0, 10);
        const range = await admin.get(`/admin/sales?start=${start}&end=${today}`);
        assert.strictEqual(range.data.sales.length, 7);
        assert.ok(range.data.totalSales > 0);
        assert.strictEqual((await admin.get('/admin/sales?start=2026-02-01&end=2026-01-01')).status, 400);
        assert.strictEqual((await admin.get('/admin/sales?start=abc&end=2026-01-01')).status, 400);
        assert.ok((await admin.get('/admin/customer-sales')).data.customerSales.length >= 1);
        assert.ok((await admin.get('/admin/brand-sales')).data.brandSales.length >= 1);
        const stats = (await admin.get('/admin/stats')).data.stats;
        assert.ok(stats.totalOrders >= 3 && stats.totalProducts === 26);
        assert.ok(stats.completedOrders >= 1);
    });
    await step('unknown routes and malformed ids return JSON 404', async () => {
        assert.strictEqual((await guest.get('/nope')).status, 404);
        assert.strictEqual((await guest.get('/product/not-an-id')).status, 404);
    });

    server.close();
    await mongoose.disconnect();
    await mongod.stop();
    console.log(`\n${passed} checks passed`);
};

run().catch(async (error) => {
    console.error('\nSmoke test aborted:', error.message);
    process.exitCode = 1;
    try { await mongoose.disconnect(); } catch (e) { /* ignore */ }
    process.exit(1);
});
