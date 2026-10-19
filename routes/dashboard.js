const express = require('express');
const router = express.Router();

const {
    getDashboardStats,
    salesPerMonth,
    salesByDateRange,
    customerSales,
    brandSales,
} = require('../controllers/dashboard');
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth')

const adminOnly = [isAuthenticatedUser, authorizeRoles('admin')];

router.get('/admin/stats', adminOnly, getDashboardStats);
router.get('/admin/sales-per-month', adminOnly, salesPerMonth);
router.get('/admin/sales', adminOnly, salesByDateRange);
router.get('/admin/customer-sales', adminOnly, customerSales);
router.get('/admin/brand-sales', adminOnly, brandSales);

module.exports = router;
