const mongoose = require('mongoose')
const Product = require('../models/product')
const Cart = require('../models/cart')
const APIFeatures = require('../utils/apiFeatures');
const { uploadFiles, destroyImages, discardFiles } = require('../utils/cloudinaryUpload');
const { skuPrefix, nextSku } = require('../utils/sku');

const IMAGE_OPTIONS = { width: 1000, crop: 'limit' };

// Validates + converts the multipart form fields of the product form (server side validation, FR1.5)
const parseProductBody = (body, partial = false) => {
    const errors = [];
    const data = {};

    const text = (field, label, required = true) => {
        const value = body[field] === undefined ? undefined : String(body[field]).trim();
        if (value === undefined && partial) return;
        if (!value) {
            if (required) errors.push(`${label} is required`);
            return;
        }
        data[field] = value;
    };
    const number = (field, label, { required = true, integer = false, min = 0 } = {}) => {
        if (body[field] === undefined || body[field] === '') {
            if (required && !partial) errors.push(`${label} is required`);
            return;
        }
        const value = Number(body[field]);
        if (Number.isNaN(value)) return errors.push(`${label} must be a number`);
        if (value < min) return errors.push(`${label} cannot be less than ${min}`);
        if (integer && !Number.isInteger(value)) return errors.push(`${label} must be a whole number`);
        data[field] = value;
    };

    text('name', 'Name');
    text('series', 'Series / category');
    text('brand', 'Brand');
    text('description', 'Description');
    number('price', 'Price', { min: 0.01 });
    number('costPrice', 'Cost price', { required: false });
    number('stock', 'Stock', { integer: true });

    return { data, errors };
}

// Create a new product with multiple photos (Cloudinary)   =>  /api/v1/admin/product/new
exports.newProduct = async (req, res, next) => {
    const files = req.files || [];

    const { data, errors } = parseProductBody(req.body);
    if (!files.length) errors.push('Please upload at least one product photo');
    if (errors.length) {
        discardFiles(files);
        return res.status(400).json({ success: false, message: errors.join(', ') })
    }

    const images = await uploadFiles(files, 'popstop/products', IMAGE_OPTIONS);

    let product;
    try {
        for (let attempt = 0; attempt < 2; attempt++) {
            data.sku = await nextSku(data.brand, data.series);
            try {
                product = await Product.create({ ...data, images, user: req.user.id });
                break;
            } catch (error) {
                if (error.code === 11000 && attempt === 0) continue;
                throw error;
            }
        }
    } catch (error) {
        await destroyImages(images);
        throw error;
    }

    return res.status(201).json({
        success: true,
        product
    })
}

// Next SKU for a brand and category: BRAND-CATEGORY-001   =>  /api/v1/admin/product-sku
exports.previewSku = async (req, res) => {
    const brand = String(req.query.brand || '').trim();
    const series = String(req.query.series || '').trim();
    if (!brand || !series) {
        return res.status(400).json({ success: false, message: 'Brand and series are required' });
    }
    const excludeId = mongoose.isValidObjectId(req.query.exclude) ? req.query.exclude : null;
    if (excludeId) {
        const current = await Product.findById(excludeId).select('sku brand series');
        if (current && current.brand === brand && current.series === series) {
            return res.status(200).json({ success: true, sku: current.sku });
        }
    }
    return res.status(200).json({
        success: true,
        sku: await nextSku(brand, series, excludeId)
    });
};

// Public catalog: search + filters + pagination (used by the infinite scroll)   =>  /api/v1/products
exports.getProducts = async (req, res) => {

    const resPerPage = Math.min(Math.max(Number(req.query.limit) || 8, 1), 48);
    const productsCount = await Product.countDocuments({ deletedAt: null });

    const apiFeatures = new APIFeatures(Product.find({ deletedAt: null }), req.query).search().filter().sort()
    const filteredProductsCount = await Product.countDocuments({ deletedAt: null, ...apiFeatures.filterQuery });

    apiFeatures.pagination(resPerPage);
    const products = await apiFeatures.query;

    const currentPage = Math.max(Number(req.query.page) || 1, 1);

    return res.status(200).json({
        success: true,
        products,
        filteredProductsCount,
        resPerPage,
        productsCount,
        hasMore: currentPage * resPerPage < filteredProductsCount
    })
}

// Autocomplete suggestions for the search bar   =>  /api/v1/products/suggest?q=lab
exports.suggestProducts = async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(200).json({ success: true, suggestions: [] });

    const regex = { $regex: APIFeatures.escapeRegex(q), $options: 'i' };
    const products = await Product.find({
        deletedAt: null,
        $or: [{ name: regex }, { brand: regex }, { series: regex }]
    }).select('name brand series price images').limit(8);

    const suggestions = products.map(p => ({
        _id: p._id,
        name: p.name,
        brand: p.brand,
        series: p.series,
        price: p.price,
        image: p.images.length ? p.images[0].url : ''
    }));
    return res.status(200).json({ success: true, suggestions })
}

// Values for the filter sidebar (categories, brands and price range)   =>  /api/v1/products/filters
exports.getFilterOptions = async (req, res) => {
    const base = { deletedAt: null };
    const [series, brands, price] = await Promise.all([
        Product.distinct('series', base),
        Product.distinct('brand', base),
        Product.aggregate([
            { $match: base },
            { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
        ])
    ]);

    return res.status(200).json({
        success: true,
        series: series.sort((a, b) => a.localeCompare(b)),
        brands: brands.sort((a, b) => a.localeCompare(b)),
        minPrice: price.length ? Math.floor(price[0].min) : 0,
        maxPrice: price.length ? Math.ceil(price[0].max) : 0
    })
}

exports.getSingleProduct = async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!product || (product.deletedAt && !isAdmin)) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }
    return res.status(200).json({
        success: true,
        product
    })
}

// Admin list - includes soft deleted products so they can be restored   =>  /api/v1/admin/products
exports.getAdminProducts = async (req, res, next) => {

    const products = await Product.find().sort({ createdAt: -1 });
    return res.status(200).json({
        success: true,
        products
    })

}

exports.updateProduct = async (req, res, next) => {
    const files = req.files || [];

    let product = await Product.findById(req.params.id);
    if (!product) {
        discardFiles(files);
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }

    const { data, errors } = parseProductBody(req.body, true);

    // keepImages = JSON array of public_ids the admin did NOT remove (all are kept when it is not sent)
    let keptImages = product.images;
    if (req.body.keepImages !== undefined) {
        let keepIds;
        try {
            keepIds = JSON.parse(req.body.keepImages);
        } catch (e) {
            keepIds = null;
        }
        if (!Array.isArray(keepIds)) errors.push('keepImages must be a JSON array');
        else keptImages = product.images.filter(img => keepIds.includes(img.public_id));
    }
    if (keptImages.length + files.length === 0) errors.push('A product needs at least one photo');

    if (errors.length) {
        discardFiles(files);
        return res.status(400).json({ success: false, message: errors.join(', ') })
    }

    const brand = data.brand || product.brand;
    const series = data.series || product.series;
    if ((data.brand || data.series) && !String(product.sku).toUpperCase().startsWith(skuPrefix(brand, series))) {
        data.sku = await nextSku(brand, series, product._id);
    }

    const removedImages = product.images.filter(img => !keptImages.some(k => k.public_id === img.public_id));
    const newImages = await uploadFiles(files, 'popstop/products', IMAGE_OPTIONS);

    product.set({ ...data, images: [...keptImages.map(i => ({ public_id: i.public_id, url: i.url })), ...newImages] });
    try {
        await product.save();
    } catch (error) {
        await destroyImages(newImages);
        throw error;
    }
    await destroyImages(removedImages);

    return res.status(200).json({
        success: true,
        product
    })
}

// Soft delete: the product stays in the database (orders keep working) but disappears from the shop
exports.deleteProduct = async (req, res, next) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }
    product.deletedAt = new Date();
    await product.save({ validateBeforeSave: false });
    await Cart.deleteMany({ product: product._id });

    return res.status(200).json({
        success: true,
        message: 'Product deleted'
    })
}

// Bulk soft delete from the datatable checkboxes   =>  DELETE /api/v1/admin/products  { ids: [...] }
exports.bulkDeleteProducts = async (req, res, next) => {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : []).filter(id => mongoose.isValidObjectId(id));
    if (!ids.length) {
        return res.status(400).json({ success: false, message: 'Please select at least one product' })
    }

    const result = await Product.updateMany({ _id: { $in: ids }, deletedAt: null }, { $set: { deletedAt: new Date() } });
    await Cart.deleteMany({ product: { $in: ids } });

    return res.status(200).json({
        success: true,
        deletedCount: result.modifiedCount
    })
}

exports.restoreProduct = async (req, res, next) => {
    const product = await Product.findByIdAndUpdate(req.params.id, { deletedAt: null }, { returnDocument: 'after' });
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        })
    }
    return res.status(200).json({
        success: true,
        product
    })
}
