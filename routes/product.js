const express = require('express');
const router = express.Router();
const upload = require("../utils/multer");

const {
    newProduct,
    previewSku,
    getSingleProduct,
    getProducts,
    suggestProducts,
    getFilterOptions,
    getAdminProducts,
    updateProduct,
    deleteProduct,
    bulkDeleteProducts,
    restoreProduct,
} = require('../controllers/product');
const { isAuthenticatedUser, authorizeRoles, optionalUser } = require('../middlewares/auth')

// public catalog
router.get('/products', getProducts)
router.get('/products/suggest', suggestProducts)
router.get('/products/filters', getFilterOptions)
router.get('/product/:id', optionalUser, getSingleProduct)

// admin product CRUD (multiple photos => Cloudinary)
router.get('/admin/products', isAuthenticatedUser, authorizeRoles('admin'), getAdminProducts);
router.get('/admin/product-sku', isAuthenticatedUser, authorizeRoles('admin'), previewSku);
router.delete('/admin/products', isAuthenticatedUser, authorizeRoles('admin'), bulkDeleteProducts);
router.post('/admin/product/new', isAuthenticatedUser, authorizeRoles('admin'), upload.array('images', 10), newProduct);
router.route('/admin/product/:id')
    .put(isAuthenticatedUser, authorizeRoles('admin'), upload.array('images', 10), updateProduct)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteProduct);
router.put('/admin/product/:id/restore', isAuthenticatedUser, authorizeRoles('admin'), restoreProduct);

module.exports = router
