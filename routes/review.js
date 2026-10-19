const express = require('express');
const router = express.Router();

const {
    getProductReviews,
    getReviewEligibility,
    createProductReview,
    getAllReviews,
    deleteReview,
} = require('../controllers/review');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth')

router.get('/reviews', getProductReviews);
router.get('/review/eligibility', isAuthenticatedUser, getReviewEligibility);
router.put('/review', isAuthenticatedUser, createProductReview);

router.get('/admin/reviews', isAuthenticatedUser, authorizeRoles('admin'), getAllReviews);
router.delete('/admin/review/:id', isAuthenticatedUser, authorizeRoles('admin'), deleteReview);

module.exports = router;
