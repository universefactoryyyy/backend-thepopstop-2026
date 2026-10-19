/*
 * The Pop Stop - database seeder            (npm run seed)
 *
 *   npm run seed            insert / update everything (safe to run again, nothing is duplicated)
 *   npm run seed:reset      wipe users, products, discounts, carts, orders and reviews first, then seed
 *   npm run seed:dry        only parse the SQL + check the image files (no database, no Cloudinary)
 *
 * What it does
 *   1. parses scripts/popstop_db.sql (the data of the old MySQL database)
 *   2. groups the local images in scripts/images (skullpanda1.jpg, skullpanda1.2.jpg, skullpanda1.3.jpg ...)
 *      as the photos of the same product, using the product_photos table
 *   3. uploads every image once to Cloudinary (folder popstop/products)
 *   4. inserts the admin account, products (with images[]), and discount codes into MongoDB
 *   5. creates the admin user in Firebase Authentication (admin@popstop.com / password) when Firebase Admin is configured
 */
require('../config/env');

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RESET = args.includes('--reset');
const SKIP_FIREBASE = args.includes('--skip-firebase');

const SQL_FILE = path.join(__dirname, 'popstop_db.sql');
const IMAGES_DIR = path.join(__dirname, 'images');
const CLOUDINARY_FOLDER = 'popstop/products';
const ADMIN_PASSWORD = 'password'; // the SQL file stores only the bcrypt hash of this password

// ------------------------------------------------------------------ SQL parsing

// Returns the rows of every `INSERT INTO <table> (cols) VALUES (...), (...);` statement as objects
const parseInsert = (sql, table) => {
    const header = new RegExp(`INSERT INTO ${table}\\s*\\(([^)]+)\\)\\s*VALUES`, 'i').exec(sql);
    if (!header) return [];
    const columns = header[1].split(',').map(c => c.trim());

    const rows = [];
    let row = null;
    let token = '';
    let tokenIsString = false;
    let inString = false;
    let parens = 0;

    const pushToken = () => {
        let value;
        if (tokenIsString) value = token;
        else {
            const raw = token.trim();
            if (/^NULL$/i.test(raw)) value = null;
            else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
            else if (/^NOW\(\)$/i.test(raw)) value = new Date();
            else value = raw;
        }
        row.push(value);
        token = '';
        tokenIsString = false;
    };

    for (let i = header.index + header[0].length; i < sql.length; i++) {
        const ch = sql[i];
        if (inString) {
            if (ch === '\\') { token += sql[++i]; continue; }
            if (ch === "'") {
                if (sql[i + 1] === "'") { token += "'"; i++; continue; }
                inString = false;
                continue;
            }
            token += ch;
            continue;
        }
        if (ch === "'") { inString = true; tokenIsString = true; token = ''; continue; }
        if (row === null) {
            if (ch === '(') { row = []; token = ''; tokenIsString = false; parens = 0; }
            else if (ch === ';') break;
            continue;
        }
        if (ch === '(') { parens++; token += ch; continue; }
        if (ch === ')') {
            if (parens > 0) { parens--; token += ch; continue; }
            pushToken();
            rows.push(Object.fromEntries(columns.map((c, idx) => [c, row[idx]])));
            row = null;
            continue;
        }
        if (ch === ',' && parens === 0) { pushToken(); continue; }
        token += ch;
    }
    return rows;
}

const loadSqlData = () => {
    const sql = fs.readFileSync(SQL_FILE, 'utf8');
    return {
        users: parseInsert(sql, 'users'),
        products: parseInsert(sql, 'products'),
        photos: parseInsert(sql, 'product_photos'),
        discounts: parseInsert(sql, 'discounts')
    };
}

// 'images/skullpanda1.2.jpg' -> file info
const imageInfo = (photoPath) => {
    const file = path.basename(photoPath);
    return {
        file,
        localPath: path.join(IMAGES_DIR, file),
        publicId: `${CLOUDINARY_FOLDER}/${path.parse(file).name}`
    };
}

// main image (products.image_url) first, then the extra photos (product_photos) in order
const buildProductImages = (data) => {
    const byProduct = new Map();
    data.products.forEach(p => byProduct.set(p.id, p.image_url ? [imageInfo(p.image_url)] : []));
    data.photos.forEach(photo => {
        const list = byProduct.get(photo.product_id);
        if (list && photo.photo_path) list.push(imageInfo(photo.photo_path));
    });
    return byProduct;
}

// ------------------------------------------------------------------ Cloudinary

// uploads once per file; `overwrite: false` means re-running the seed re-uses what is already in Cloudinary
const uploadAll = async (files) => {
    const results = new Map();
    const queue = [...files.values()];
    let done = 0;

    const worker = async () => {
        while (queue.length) {
            const info = queue.shift();
            const result = await cloudinary.v2.uploader.upload(info.localPath, {
                public_id: info.publicId,
                overwrite: false,
                resource_type: 'image'
            });
            results.set(info.file, { public_id: result.public_id, url: result.secure_url });
            done++;
            process.stdout.write(`\r  uploaded ${done}/${files.size} images`);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    process.stdout.write('\n');
    return results;
}

// ------------------------------------------------------------------ Firebase

const ensureFirebaseAdminUser = async (email) => {
    const { isFirebaseConfigured, getFirebaseAdmin } = require('../config/firebase');
    if (SKIP_FIREBASE) return null;
    if (!isFirebaseConfigured()) {
        console.warn('  ! Firebase Admin is not configured, so the admin login was NOT created in Firebase.');
        console.warn('    Fill in the Firebase variables in backend/.env and run `npm run seed` again.');
        return null;
    }
    try {
        const auth = getFirebaseAdmin().auth();
        try {
            const existing = await auth.getUserByEmail(email);
            if (!existing.emailVerified) await auth.updateUser(existing.uid, { emailVerified: true });
            console.log(`  Firebase user ${email} already exists`);
            return existing.uid;
        } catch (error) {
            if (error.code !== 'auth/user-not-found') throw error;
        }
        const created = await auth.createUser({ email, password: ADMIN_PASSWORD, emailVerified: true, displayName: 'Admin' });
        console.log(`  Created Firebase user ${email} (password: ${ADMIN_PASSWORD})`);
        return created.uid;
    } catch (error) {
        console.warn(`  ! Could not create the Firebase admin user: ${error.message}`);
        return null;
    }
}

// ------------------------------------------------------------------ main

const main = async () => {
    console.log(`\nThe Pop Stop seeder${DRY_RUN ? ' (dry run)' : ''}${RESET ? ' (RESET)' : ''}`);

    const data = loadSqlData();
    const imagesByProduct = buildProductImages(data);

    const allFiles = new Map();
    imagesByProduct.forEach(list => list.forEach(info => allFiles.set(info.file, info)));
    const missingFiles = [...allFiles.values()].filter(info => !fs.existsSync(info.localPath));

    console.log(`Parsed SQL: ${data.users.length} user(s), ${data.products.length} products, ${data.photos.length} extra photos, ${data.discounts.length} discount codes`);
    console.log(`Images: ${allFiles.size} unique files used by products`);
    if (missingFiles.length) {
        console.error(`Missing image files in scripts/images: ${missingFiles.map(f => f.file).join(', ')}`);
        process.exit(1);
    }

    if (DRY_RUN) {
        data.products.forEach(p => {
            const imgs = imagesByProduct.get(p.id).map(i => i.file).join(', ');
            console.log(`  ${String(p.sku).padEnd(11)} ${String(p.stock_quantity).padStart(3)} ${p.status.padEnd(12)} ${p.name}  [${imgs}]`);
        });
        console.log('\nDry run finished - nothing was written.');
        return;
    }

    // ---- configuration checks
    const { configureCloudinary, isCloudinaryConfigured } = require('../config/cloudinary');
    if (!process.env.DB_URI) { console.error('DB_URI is not set in backend/.env'); process.exit(1); }
    if (!isCloudinaryConfigured()) { console.error('Cloudinary is not configured in backend/.env (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)'); process.exit(1); }
    configureCloudinary();

    const User = require('../models/user');
    const Product = require('../models/product');
    const Discount = require('../models/discount');
    const Cart = require('../models/cart');
    const Order = require('../models/order');
    const Review = require('../models/review');

    await mongoose.connect(process.env.DB_URI);
    console.log(`Connected to MongoDB (${mongoose.connection.host}/${mongoose.connection.name})`);
    await Promise.all([User, Product, Discount, Cart, Order, Review].map(model => model.init()));

    if (RESET) {
        console.log('Resetting collections...');
        await Promise.all([User, Product, Discount, Cart, Order, Review].map(model => model.deleteMany({})));
    }

    // ---- 1. images -> Cloudinary
    console.log('Uploading images to Cloudinary...');
    const uploaded = await uploadAll(allFiles);

    // ---- 2. admin user(s)
    console.log('Seeding users...');
    for (const row of data.users) {
        const firebaseUid = await ensureFirebaseAdminUser(row.email);
        const update = {
            name: row.name,
            fname: row.name,
            lname: '',
            email: row.email.toLowerCase(),
            password: row.password, // legacy bcrypt hash, kept for data fidelity (login is handled by Firebase)
            role: row.role,
            isActive: Boolean(row.is_active)
        };
        if (row.role === 'admin') update.username = 'admin';
        if (firebaseUid) update.firebaseUid = firebaseUid;
        await User.findOneAndUpdate({ email: update.email }, { $set: update }, { upsert: true, setDefaultsOnInsert: true });
        console.log(`  ${row.role}: ${row.email}`);
    }
    const admin = await User.findOne({ role: 'admin' });

    // ---- 3. products
    console.log('Seeding products...');
    for (const row of data.products) {
        const images = imagesByProduct.get(row.id).map(info => uploaded.get(info.file));
        const doc = {
            name: row.name,
            series: row.series,
            brand: row.brand,
            price: row.price,
            costPrice: row.cost_price,
            sku: row.sku,
            description: row.description,
            stock: row.stock_quantity,
            status: row.status,
            images,
            deletedAt: row.deleted_at || null,
            user: admin ? admin._id : undefined
        };
        await Product.findOneAndUpdate({ sku: row.sku }, { $set: doc }, { upsert: true, setDefaultsOnInsert: true });
    }
    console.log(`  ${data.products.length} products (${[...imagesByProduct.values()].reduce((n, l) => n + l.length, 0)} photos)`);

    // ---- 4. discounts
    console.log('Seeding discounts...');
    for (const row of data.discounts) {
        const doc = {
            code: row.code,
            description: row.description,
            discountType: row.discount_type,
            discountValue: row.discount_value,
            minOrderAmount: row.min_order_amount,
            maxUses: row.max_uses,
            isActive: Boolean(row.is_active),
            expiresAt: row.expires_at || null
        };
        // usedCount is only set the first time, so re-seeding never resets real usage
        await Discount.findOneAndUpdate({ code: row.code }, { $set: doc, $setOnInsert: { usedCount: 0 } }, { upsert: true, setDefaultsOnInsert: true });
        console.log(`  ${row.code}`);
    }

    console.log('\nSeed finished.');
    console.log(`  Admin login: ${data.users[0].email} / ${ADMIN_PASSWORD}  (change this password after your first login)`);
    console.log(`  Products: ${await Product.countDocuments()}, discounts: ${await Discount.countDocuments()}, users: ${await User.countDocuments()}`);
}

module.exports = { main, parseInsert, loadSqlData };

// `npm run seed` runs the file directly; the smoke test imports main() instead
if (require.main === module) {
    main()
        .catch((error) => {
            console.error('\nSeed failed:', error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
        });
}
