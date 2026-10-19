const express = require('express');
const router = express.Router();

const {
    validateDiscount,
    getApplicableDiscounts,
    getAllDiscounts,
    createDiscount,
    updateDiscount,
    deleteDiscount,
} = require('../controllers/discount');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth')

router.post('/discount/validate', isAuthenticatedUser, validateDiscount);
router.get('/discounts/applicable', isAuthenticatedUser, getApplicableDiscounts);

router.get('/admin/discounts', isAuthenticatedUser, authorizeRoles('admin'), getAllDiscounts);
router.post('/admin/discount/new', isAuthenticatedUser, authorizeRoles('admin'), createDiscount);
router.route('/admin/discount/:id')
    .put(isAuthenticatedUser, authorizeRoles('admin'), updateDiscount)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteDiscount);

module.exports = router;
