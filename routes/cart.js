const express = require('express');
const router = express.Router();

const { getCart, addToCart, updateCartItem, removeFromCart, clearCart } = require('../controllers/cart');
const { isAuthenticatedUser } = require('../middlewares/auth')

router.route('/cart')
    .get(isAuthenticatedUser, getCart)
    .post(isAuthenticatedUser, addToCart)
    .delete(isAuthenticatedUser, clearCart);
router.route('/cart/:id')
    .put(isAuthenticatedUser, updateCartItem)
    .delete(isAuthenticatedUser, removeFromCart);

module.exports = router;
