const Discount = require('../models/discount');

const calculateDiscountAmount = (discount, subtotal) => {
    const total = Number(subtotal);
    const amount = discount.discountType === 'percent'
        ? (total * discount.discountValue) / 100
        : discount.discountValue;
    return Math.round(Math.min(total, amount) * 100) / 100;
}

const activeFilter = () => ({
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
});

// Shared by the "apply code" endpoint and by checkout.
// Returns { discount, discountAmount } or { error, status }
const checkDiscountCode = async (code, subtotal) => {
    if (!code) return { error: 'Discount code is required', status: 400 };

    const discount = await Discount.findOne({ code: String(code).trim().toUpperCase(), ...activeFilter() });
    if (!discount) return { error: 'Invalid or expired discount code', status: 404 };

    if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) {
        return { error: 'This discount code has reached its usage limit', status: 400 };
    }
    if (subtotal < discount.minOrderAmount) {
        return { error: `Minimum order of PHP ${discount.minOrderAmount.toFixed(2)} required for this code`, status: 400 };
    }
    return { discount, discountAmount: calculateDiscountAmount(discount, subtotal) };
}

// Atomically uses up one redemption (so max uses can never be exceeded). Returns the updated discount or null.
const reserveDiscountUse = (discountId) => Discount.findOneAndUpdate(
    {
        _id: discountId,
        $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }]
    },
    { $inc: { usedCount: 1 } },
    { returnDocument: 'after' }
);

const releaseDiscountUse = (discountId) => Discount.updateOne(
    { _id: discountId, usedCount: { $gt: 0 } },
    { $inc: { usedCount: -1 } }
);

exports.calculateDiscountAmount = calculateDiscountAmount;
exports.checkDiscountCode = checkDiscountCode;
exports.reserveDiscountUse = reserveDiscountUse;
exports.releaseDiscountUse = releaseDiscountUse;

// POST /api/v1/discount/validate   { code, subtotal }
exports.validateDiscount = async (req, res) => {
    const subtotal = Number(req.body.subtotal) || 0;
    const result = await checkDiscountCode(req.body.code, subtotal);
    if (result.error) return res.status(result.status).json({ message: result.error });

    const { discount, discountAmount } = result;
    return res.status(200).json({
        success: true,
        code: discount.code,
        description: discount.description,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        discountAmount,
        subtotal,
        totalPrice: subtotal - discountAmount
    });
}

// GET /api/v1/discounts/applicable?subtotal=1500  - the codes the customer can pick at checkout
exports.getApplicableDiscounts = async (req, res) => {
    const subtotal = Number(req.query.subtotal) || 0;
    const discounts = await Discount.find(activeFilter()).sort({ minOrderAmount: 1 });

    const rows = discounts
        .filter(d => subtotal >= d.minOrderAmount)
        .filter(d => d.maxUses === null || d.usedCount < d.maxUses)
        .map(d => {
            const discountAmount = calculateDiscountAmount(d, subtotal);
            const minAmt = d.minOrderAmount.toFixed(2);
            const peso = '\u20B1';
            const label = d.discountType === 'percent'
                ? `${d.code} - ${d.discountValue}% off (min ${peso}${minAmt})`
                : `${d.code} - ${peso}${d.discountValue.toFixed(2)} off (min ${peso}${minAmt})`;
            return {
                code: d.code,
                description: d.description,
                discountType: d.discountType,
                discountValue: d.discountValue,
                minOrderAmount: d.minOrderAmount,
                discountAmount,
                label
            };
        });

    return res.status(200).json({ success: true, discounts: rows });
}

// ------------------------- admin -------------------------

exports.getAllDiscounts = async (req, res) => {
    const discounts = await Discount.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, discounts });
}

const pickDiscountFields = (body) => {
    const fields = {};
    ['code', 'description', 'discountType', 'discountValue', 'minOrderAmount', 'maxUses', 'isActive', 'expiresAt'].forEach(key => {
        if (body[key] !== undefined) fields[key] = body[key];
    });
    if (fields.maxUses === '' || fields.maxUses === 0) fields.maxUses = null;
    if (fields.expiresAt === '') fields.expiresAt = null;
    return fields;
}

exports.createDiscount = async (req, res) => {
    const discount = await Discount.create(pickDiscountFields(req.body));
    return res.status(201).json({ success: true, discount });
}

exports.updateDiscount = async (req, res) => {
    const discount = await Discount.findById(req.params.id);
    if (!discount) return res.status(404).json({ message: 'Discount not found' });

    discount.set(pickDiscountFields(req.body));
    await discount.save();
    return res.status(200).json({ success: true, discount });
}

exports.deleteDiscount = async (req, res) => {
    const discount = await Discount.findByIdAndDelete(req.params.id);
    if (!discount) return res.status(404).json({ message: 'Discount not found' });
    return res.status(200).json({ success: true });
}
