const Cart = require('../models/cart');
const Product = require('../models/product');

const PRODUCT_FIELDS = 'name price images stock status series brand deletedAt';

// Loads the user's cart, dropping rows whose product was removed
const loadCart = async (userId) => {
    const rows = await Cart.find({ user: userId }).populate('product', PRODUCT_FIELDS).sort({ createdAt: 1 });
    const orphanIds = rows.filter(r => !r.product || r.product.deletedAt).map(r => r._id);
    if (orphanIds.length) await Cart.deleteMany({ _id: { $in: orphanIds } });
    return rows.filter(r => r.product && !r.product.deletedAt);
}

exports.loadCart = loadCart;

// GET /api/v1/cart
exports.getCart = async (req, res, next) => {
    const cartItems = await loadCart(req.user._id);
    return res.status(200).json({ success: true, cartItems });
}

// POST /api/v1/cart   { productId, quantity }
exports.addToCart = async (req, res, next) => {
    const { productId } = req.body;
    const quantity = Number(req.body.quantity) || 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const product = await Product.findById(productId);
    if (!product || product.deletedAt) return res.status(404).json({ message: 'Product not found' });
    if (product.stock <= 0) return res.status(400).json({ message: `${product.name} is out of stock` });

    const existing = await Cart.findOne({ user: req.user._id, product: product._id });
    const newQuantity = (existing ? existing.quantity : 0) + quantity;
    if (newQuantity > product.stock) {
        return res.status(400).json({ message: `Only ${product.stock} of ${product.name} left in stock` });
    }

    if (existing) {
        existing.quantity = newQuantity;
        await existing.save();
    } else {
        await Cart.create({ user: req.user._id, product: product._id, quantity: newQuantity });
    }

    const cartItems = await loadCart(req.user._id);
    return res.status(200).json({ success: true, message: 'Added to cart', cartItems });
}

// PUT /api/v1/cart/:id   { quantity }
exports.updateCartItem = async (req, res, next) => {
    const quantity = Number(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
        return res.status(400).json({ message: 'Quantity must be at least 1' });
    }

    const item = await Cart.findOne({ _id: req.params.id, user: req.user._id }).populate('product', PRODUCT_FIELDS);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });
    if (!item.product || item.product.deletedAt) return res.status(404).json({ message: 'Product no longer available' });
    if (quantity > item.product.stock) {
        return res.status(400).json({ message: `Only ${item.product.stock} of ${item.product.name} left in stock` });
    }

    item.quantity = quantity;
    await item.save();

    const cartItems = await loadCart(req.user._id);
    return res.status(200).json({ success: true, cartItems });
}

// DELETE /api/v1/cart/:id
exports.removeFromCart = async (req, res, next) => {
    await Cart.deleteOne({ _id: req.params.id, user: req.user._id });
    const cartItems = await loadCart(req.user._id);
    return res.status(200).json({ success: true, message: 'Removed from cart', cartItems });
}

// DELETE /api/v1/cart
exports.clearCart = async (req, res, next) => {
    await Cart.deleteMany({ user: req.user._id });
    return res.status(200).json({ success: true, cartItems: [] });
}
