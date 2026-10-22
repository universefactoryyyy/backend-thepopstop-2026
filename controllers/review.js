const Review = require('../models/review');
const Product = require('../models/product');
const Order = require('../models/order');
const mongoose = require('mongoose');
const { filterProfanity } = require('../utils/filterProfanity');

// Keeps product.ratings / product.numOfReviews in sync after a review is added, edited or deleted
const updateProductRating = async (productId) => {
    const [stats] = await Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(String(productId)) } },
        { $group: { _id: '$product', average: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    await Product.findByIdAndUpdate(productId, {
        ratings: stats ? Math.round(stats.average * 100) / 100 : 0,
        numOfReviews: stats ? stats.count : 0
    });
}

// The delivered order that proves the customer bought this product (null when they never received it)
const findPurchase = (userId, productId) => {
    const id = mongoose.isValidObjectId(productId) ? new mongoose.Types.ObjectId(String(productId)) : productId;
    return Order.findOne({ user: userId, orderStatus: 'Delivered', 'orderItems.product': id }).sort({ createdAt: -1 });
}

// Shoppers never receive the author's name or photo when the review is anonymous.
const forShoppers = (review) => {
    const plain = review.toObject();
    if (!plain.anonymous) return plain;
    return { ...plain, user: { name: 'Anonymous' } };
};

// GET /api/v1/reviews?productId=...   (public)
exports.getProductReviews = async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.query.productId)) {
        return res.status(400).json({ message: 'A valid productId is required' });
    }
    const reviews = await Review.find({ product: req.query.productId })
        .populate('user', 'name avatar')
        .sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        reviews: reviews.map(forShoppers)
    })
}

// Can the logged in shopper review this product, and have they already?   GET /api/v1/review/eligibility?productId=...
exports.getReviewEligibility = async (req, res, next) => {
    if (!mongoose.isValidObjectId(req.query.productId)) {
        return res.status(400).json({ message: 'A valid productId is required' });
    }
    const purchase = await findPurchase(req.user._id, req.query.productId);
    const review = await Review.findOne({ user: req.user._id, product: req.query.productId });

    res.status(200).json({
        success: true,
        canReview: Boolean(purchase),
        review
    })
}

// Create OR edit the logged in shopper's review of a product   =>  PUT /api/v1/review
// Anyone with a delivered order containing the product may review (including admin); authors may edit it later.
exports.createProductReview = async (req, res, next) => {
    const { productId, comment } = req.body;
    const anonymous = req.body.anonymous === true || req.body.anonymous === 'true';
    const rating = Number(req.body.rating);

    if (!mongoose.isValidObjectId(productId)) {
        return res.status(400).json({ message: 'A valid productId is required' });
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: 'Rating must be a whole number from 1 to 5' });
    }
    if (comment && comment.length > 1000) {
        return res.status(400).json({ message: 'Review cannot exceed 1000 characters' });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const purchase = await findPurchase(req.user._id, productId);
    if (!purchase) {
        return res.status(403).json({ message: 'You can only review products from your delivered orders' });
    }

    // bad words are masked with ****  (bad-words package)
    const cleanComment = await filterProfanity(comment);

    let review = await Review.findOne({ user: req.user._id, product: productId });
    const isEdit = Boolean(review);
    if (review) {
        review.rating = rating;
        review.comment = cleanComment;
        review.anonymous = anonymous;
        review.updatedAt = new Date();
        await review.save();
    } else {
        review = await Review.create({
            product: productId,
            user: req.user._id,
            order: purchase._id,
            rating,
            comment: cleanComment,
            anonymous
        });
    }

    await updateProductRating(productId);

    return res.status(isEdit ? 200 : 201).json({
        success: true,
        isEdit,
        review
    })
}

// ------------------------- admin -------------------------

// GET /api/v1/admin/reviews
exports.getAllReviews = async (req, res, next) => {
    const reviews = await Review.find()
        .populate('user', 'name email')
        .populate('product', 'name')
        .sort({ createdAt: -1 });
    res.status(200).json({
        success: true,
        reviews
    })
}

// Admin can permanently remove any review   =>  DELETE /api/v1/admin/review/:id
exports.deleteReview = async (req, res, next) => {
    const review = await Review.findByIdAndDelete(req.params.id);
    if (!review) {
        return res.status(404).json({ message: 'Review not found' });
    }
    await updateProductRating(review.product);

    return res.status(200).json({
        success: true
    })
}
