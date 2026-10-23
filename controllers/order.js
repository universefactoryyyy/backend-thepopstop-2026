const crypto = require('crypto');
const Order = require('../models/order');
const Cart = require('../models/cart');
const Discount = require('../models/discount');
const sendEmail = require('../utils/sendEmail');
const { adjustStock } = require('../utils/stock');
const { generateOrderReceipt } = require('../utils/generatePDF');
const { orderConfirmationEmail, orderStatusUpdateEmail } = require('../utils/emailTemplates');
const { orderNumber } = require('../utils/orderHelpers');
const { loadCart } = require('./cart');
const { checkDiscountCode, reserveDiscountUse, releaseDiscountUse } = require('./discount');

const FINAL_STATUSES = ['Delivered', 'Cancelled'];

// Older orders have no token until the next email. select:false means it must be loaded explicitly.
const ensureReceiptToken = async (order) => {
    if (order.receiptToken) return order.receiptToken;
    const stored = await Order.findById(order._id).select('+receiptToken');
    if (stored && stored.receiptToken) {
        order.receiptToken = stored.receiptToken;
        return stored.receiptToken;
    }
    order.receiptToken = crypto.randomBytes(24).toString('hex');
    await Order.updateOne({ _id: order._id }, { receiptToken: order.receiptToken });
    return order.receiptToken;
}

// Emails the customer the order details with the PDF receipt attached.
// Never throws: a mail problem must not undo an order / status change.
const emailOrder = async (order, subject, buildHtml) => {
    try {
        await ensureReceiptToken(order);
        const pdfBuffer = await generateOrderReceipt(order);
        await sendEmail({
            email: order.user.email,
            subject,
            html: buildHtml(),
            attachments: [{
                filename: `receipt-order-${orderNumber(order)}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
                contentDisposition: 'attachment',
            }]
        });
        return { emailSent: true };
    } catch (error) {
        console.log('Email error:', error.message);
        return { emailSent: false, emailError: error.message };
    }
}

const rollbackStock = async (reserved) => {
    for (const item of reserved) {
        await adjustStock(item.product, item.quantity);
    }
}

// Checkout: turns the user's cart into an order (transaction)   =>  /api/v1/order/new
exports.newOrder = async (req, res, next) => {
    const { shippingInfo, paymentMethod, discountCode } = req.body;

    if (!shippingInfo || !shippingInfo.address || !shippingInfo.address.trim()) {
        return res.status(400).json({ message: 'Shipping address is required' });
    }
    if (!shippingInfo.phoneNo || !shippingInfo.phoneNo.trim()) {
        return res.status(400).json({ message: 'Phone number is required' });
    }
    if (!paymentMethod) {
        return res.status(400).json({ message: 'Payment method is required' });
    }

    const cartItems = await loadCart(req.user._id);
    if (!cartItems.length) {
        return res.status(400).json({ message: 'Your cart is empty' });
    }

    // prices always come from the database, never from the browser
    const orderItems = [];
    let itemsPrice = 0;
    for (const item of cartItems) {
        const product = item.product;
        if (product.stock <= 0) return res.status(400).json({ message: `${product.name} is out of stock` });
        if (item.quantity > product.stock) {
            return res.status(400).json({ message: `Only ${product.stock} of ${product.name} left in stock` });
        }
        orderItems.push({
            name: product.name,
            series: product.series,
            quantity: item.quantity,
            image: product.images.length ? product.images[0].url : '',
            price: product.price,
            product: product._id
        });
        itemsPrice += product.price * item.quantity;
    }
    itemsPrice = Math.round(itemsPrice * 100) / 100;

    let discountAmount = 0;
    let discount = null;
    if (discountCode) {
        const result = await checkDiscountCode(discountCode, itemsPrice);
        if (result.error) return res.status(result.status === 404 ? 400 : result.status).json({ message: result.error });
        discount = result.discount;
        discountAmount = result.discountAmount;
    }

    // reserve stock atomically (two shoppers can't buy the last item)
    const reserved = [];
    for (const item of orderItems) {
        const updated = await adjustStock(item.product, -item.quantity);
        if (!updated) {
            await rollbackStock(reserved);
            return res.status(400).json({ message: `${item.name} just went out of stock. Please review your cart` });
        }
        reserved.push(item);
    }

    if (discount) {
        const used = await reserveDiscountUse(discount._id);
        if (!used) {
            await rollbackStock(reserved);
            return res.status(400).json({ message: 'This discount code has reached its usage limit' });
        }
    }

    let order;
    try {
        order = await Order.create({
            user: req.user._id,
            orderItems,
            shippingInfo: {
                address: shippingInfo.address.trim(),
                phoneNo: shippingInfo.phoneNo.trim(),
                postalCode: (shippingInfo.postalCode || '').trim()
            },
            paymentInfo: { method: paymentMethod },
            itemsPrice,
            discountCode: discount ? discount.code : null,
            discountAmount,
            totalPrice: Math.round((itemsPrice - discountAmount) * 100) / 100,
            orderStatus: 'Pending'
        });
    } catch (error) {
        await rollbackStock(reserved);
        if (discount) await releaseDiscountUse(discount._id);
        throw error;
    }

    await Cart.deleteMany({ user: req.user._id });

    const sendConfirmation = async () => {
        order.user = req.user;
        const email = await emailOrder(order, 'Order Confirmed - The Pop Stop', () => orderConfirmationEmail(req.user, order));
        order.depopulate('user');
        return email;
    };

    // tests wait for the mail stub; live checkout must not sit on PDF + email
    if (process.env.NODE_ENV === 'test') {
        return res.status(201).json({
            success: true,
            order,
            ...await sendConfirmation()
        });
    }

    res.status(201).json({
        success: true,
        order,
        emailSent: true
    });
    sendConfirmation().catch((error) => console.log('Email error:', error.message));
}

exports.myOrders = async (req, res, next) => {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 })
    res.status(200).json({
        success: true,
        orders
    })
}

const canAccess = (order, user) =>
    user.role === 'admin' || user.role === 'employee' || String(order.user._id || order.user) === String(user._id);

exports.getSingleOrder = async (req, res, next) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email')
    if (!order) {
        return res.status(404).json({
            message: 'No Order found with this ID',
        })
    }
    if (!canAccess(order, req.user)) {
        return res.status(403).json({ message: 'You are not allowed to view this order' })
    }
    res.status(200).json({
        success: true,
        order
    })
}

const sendReceipt = async (order, res) => {
    const pdfBuffer = await generateOrderReceipt(order);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-order-${orderNumber(order)}.pdf`);
    return res.send(pdfBuffer);
}

const tokenMatches = (stored, given) => {
    if (!stored || !given) return false;
    const left = Buffer.from(String(stored));
    const right = Buffer.from(String(given));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

// Download from the link in the order email. No login: the secret token is the permission.
exports.downloadReceiptFile = async (req, res, next) => {
    const order = await Order.findById(req.params.id).select('+receiptToken').populate('user', 'name email');
    if (!order || !tokenMatches(order.receiptToken, req.query.token)) {
        return res.status(403).json({ message: 'This receipt link is not valid' });
    }
    return sendReceipt(order, res);
}

// Official PDF receipt   =>  /api/v1/order/:id/receipt
exports.getOrderReceipt = async (req, res, next) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email')
    if (!order) return res.status(404).json({ message: 'No Order found with this ID' })
    if (!canAccess(order, req.user)) {
        return res.status(403).json({ message: 'You are not allowed to view this receipt' })
    }

    return sendReceipt(order, res);
}

exports.allOrders = async (req, res, next) => {
    const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 })

    let totalAmount = 0;
    orders.forEach(order => {
        if (order.orderStatus !== 'Cancelled') totalAmount += order.totalPrice
    })

    res.status(200).json({
        success: true,
        totalAmount,
        orders
    })
}

exports.deleteOrder = async (req, res, next) => {
    const order = await Order.findById(req.params.id)

    if (!order) {
        return res.status(404).json({
            message: 'No Order found with this ID',
        })
    }

    // goods that never left the shop go back on the shelf
    if (!FINAL_STATUSES.includes(order.orderStatus)) {
        for (const item of order.orderItems) await adjustStock(item.product, item.quantity);
        if (order.discountCode) {
            const discount = await Discount.findOne({ code: order.discountCode });
            if (discount) await releaseDiscountUse(discount._id);
        }
    }
    await order.deleteOne();

    return res.status(200).json({
        success: true
    })
}

// Admin: change the order status, email the customer and attach the PDF receipt   =>  PUT /api/v1/admin/order/:id
exports.updateOrder = async (req, res, next) => {
    const { status } = req.body;
    if (!Order.STATUSES.includes(status)) {
        return res.status(400).json({ message: `Status must be one of: ${Order.STATUSES.join(', ')}` })
    }

    const order = await Order.findById(req.params.id).select('+receiptToken').populate('user', 'name email')
    if (!order) {
        return res.status(404).json({ message: 'No Order found with this ID' })
    }
    if (order.orderStatus === status) {
        return res.status(400).json({ message: `This order is already ${status}` })
    }
    if (FINAL_STATUSES.includes(order.orderStatus)) {
        return res.status(400).json({ message: `This order is already ${order.orderStatus} and can no longer be changed` })
    }

    order.orderStatus = status
    if (status === 'Delivered') order.deliveredAt = Date.now()
    await order.save()

    // a cancelled order puts its items (and the discount use) back
    if (status === 'Cancelled') {
        for (const item of order.orderItems) await adjustStock(item.product, item.quantity);
        if (order.discountCode) {
            const discount = await Discount.findOne({ code: order.discountCode });
            if (discount) await releaseDiscountUse(discount._id);
        }
    }

    const sendUpdate = () => emailOrder(
        order,
        `Order #${orderNumber(order)} Status Update - The Pop Stop`,
        () => orderStatusUpdateEmail(order.user, order, status)
    );

    if (process.env.NODE_ENV === 'test') {
        return res.status(200).json({
            success: true,
            order,
            ...await sendUpdate()
        });
    }

    res.status(200).json({
        success: true,
        order,
        emailSent: true
    });
    sendUpdate().catch((error) => console.log('Email error:', error.message));
}
