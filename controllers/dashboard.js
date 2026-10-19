const Order = require('../models/order');
const Product = require('../models/product');
const User = require('../models/user');

const getTimezone = () => process.env.TIMEZONE || 'Asia/Manila';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Cancelled orders are not sales
const SALES_MATCH = { orderStatus: { $ne: 'Cancelled' } };

// 'YYYY-MM-DD' strings -> list of every day between them (inclusive)
const eachDay = (start, end) => {
    const days = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    while (cursor <= last) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

const isDateString = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());

// GET /api/v1/admin/stats - numbers for the dashboard cards
exports.getDashboardStats = async (req, res) => {
    const [totalProducts, lowStock, outOfStock, totalUsers, totalOrders, pendingOrders, completedOrders, revenue] = await Promise.all([
        Product.countDocuments({ deletedAt: null }),
        Product.countDocuments({ deletedAt: null, status: 'Low Stock' }),
        Product.countDocuments({ deletedAt: null, status: 'Out of Stock' }),
        User.countDocuments({ deletedAt: null }),
        Order.countDocuments(),
        Order.countDocuments({ orderStatus: 'Pending' }),
        Order.countDocuments({ orderStatus: 'Delivered' }),
        Order.aggregate([{ $match: SALES_MATCH }, { $group: { _id: null, total: { $sum: '$totalPrice' } } }])
    ]);

    return res.status(200).json({
        success: true,
        stats: {
            totalProducts,
            lowStock,
            outOfStock,
            totalUsers,
            totalOrders,
            pendingOrders,
            completedOrders,
            totalRevenue: revenue.length ? revenue[0].total : 0
        }
    });
}

// Monthly sales for ONE year, always returning all 12 months (zero filled) so the line chart shows every month
// GET /api/v1/admin/sales-per-month?year=2026
exports.salesPerMonth = async (req, res, next) => {
    const currentYear = new Date().getFullYear();
    const year = Number(req.query.year) || currentYear;

    const rows = await Order.aggregate([
        { $match: SALES_MATCH },
        {
            $group: {
                _id: {
                    year: { $year: { date: '$createdAt', timezone: getTimezone() } },
                    month: { $month: { date: '$createdAt', timezone: getTimezone() } }
                },
                total: { $sum: '$totalPrice' },
                orders: { $sum: 1 }
            },
        },
    ])

    const salesPerMonth = MONTHS.map((month, index) => {
        const found = rows.find(r => r._id.year === year && r._id.month === index + 1);
        return { month, total: found ? Math.round(found.total * 100) / 100 : 0, orders: found ? found.orders : 0 };
    });

    const years = [...new Set([currentYear, ...rows.map(r => r._id.year)])].sort((a, b) => b - a);

    res.status(200).json({
        success: true,
        year,
        years,
        salesPerMonth
    })
}

// Sales between two dates (inclusive), one point per day   =>  GET /api/v1/admin/sales?start=2026-10-01&end=2026-10-31
exports.salesByDateRange = async (req, res, next) => {
    let { start, end } = req.query;

    if (!end) end = new Date().toISOString().slice(0, 10);
    if (!start) {
        const d = new Date(`${end}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 29);
        start = d.toISOString().slice(0, 10);
    }
    if (!isDateString(start) || !isDateString(end)) {
        return res.status(400).json({ message: 'start and end must be dates in YYYY-MM-DD format' });
    }
    if (start > end) {
        return res.status(400).json({ message: 'Start date cannot be after end date' });
    }
    const days = eachDay(start, end);
    if (days.length > 366) {
        return res.status(400).json({ message: 'Date range cannot be longer than 366 days' });
    }

    // loose bounds in the query, exact day filtering below (timezone safe)
    const from = new Date(`${start}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 1);
    const to = new Date(`${end}T00:00:00Z`); to.setUTCDate(to.getUTCDate() + 2);

    const rows = await Order.aggregate([
        { $match: { ...SALES_MATCH, createdAt: { $gte: from, $lt: to } } },
        {
            $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: getTimezone() } },
                total: { $sum: '$totalPrice' },
                orders: { $sum: 1 }
            }
        }
    ])
    const byDay = new Map(rows.map(r => [r._id, r]));

    const sales = days.map(day => {
        const found = byDay.get(day);
        return { date: day, total: found ? Math.round(found.total * 100) / 100 : 0, orders: found ? found.orders : 0 };
    });

    res.status(200).json({
        success: true,
        start,
        end,
        totalSales: sales.reduce((sum, s) => sum + s.total, 0),
        totalOrders: sales.reduce((sum, s) => sum + s.orders, 0),
        sales
    })
}

// Sales per customer (top 10)   =>  GET /api/v1/admin/customer-sales
exports.customerSales = async (req, res, next) => {
    const customerSales = await Order.aggregate([
        { $match: SALES_MATCH },
        { $group: { _id: '$user', total: { $sum: '$totalPrice' }, orders: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'userDetails' } },
        { $unwind: '$userDetails' },
        { $project: { _id: 0, name: '$userDetails.name', total: 1, orders: 1 } },
        { $sort: { total: -1 } },
        { $limit: 10 }
    ])

    res.status(200).json({
        success: true,
        customerSales
    })
}

// Revenue per brand (pie chart)   =>  GET /api/v1/admin/brand-sales
exports.brandSales = async (req, res, next) => {
    const brandSales = await Order.aggregate([
        { $match: SALES_MATCH },
        { $unwind: '$orderItems' },
        { $lookup: { from: 'products', localField: 'orderItems.product', foreignField: '_id', as: 'productDetails' } },
        { $unwind: '$productDetails' },
        {
            $group: {
                _id: '$productDetails.brand',
                total: { $sum: { $multiply: ['$orderItems.price', '$orderItems.quantity'] } },
                units: { $sum: '$orderItems.quantity' }
            }
        },
        { $project: { _id: 0, brand: '$_id', total: 1, units: 1 } },
        { $sort: { total: -1 } }
    ])

    res.status(200).json({
        success: true,
        brandSales
    })
}
