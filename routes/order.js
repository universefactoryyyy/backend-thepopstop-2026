const express = require('express')
const router = express.Router();

const {
    newOrder,
    myOrders,
    getSingleOrder,
    getOrderReceipt,
    downloadReceiptFile,
    deleteOrder,
    allOrders,
    updateOrder,
} = require('../controllers/order')
const { isAuthenticatedUser, authorizeRoles } = require('../middlewares/auth')

router.post('/order/new', isAuthenticatedUser, newOrder);
router.get('/orders/me', isAuthenticatedUser, myOrders);
router.get('/order/:id', isAuthenticatedUser, getSingleOrder);
router.get('/order/:id/receipt/file', downloadReceiptFile);
router.get('/order/:id/receipt', isAuthenticatedUser, getOrderReceipt);

router.get('/admin/orders', isAuthenticatedUser, authorizeRoles('admin', 'employee'), allOrders);
router.route('/admin/order/:id')
    .put(isAuthenticatedUser, authorizeRoles('admin', 'employee'), updateOrder)
    .delete(isAuthenticatedUser, authorizeRoles('admin'), deleteOrder);

module.exports = router;
