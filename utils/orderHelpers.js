// Short, human friendly order number: the last 8 characters of the Mongo id
const orderNumber = (order) => String(order._id || order.id).slice(-8).toUpperCase();

// Plain-text money for the PDF (the default PDF fonts have no peso sign)
const formatPHP = (amount) =>
    `PHP ${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Peso sign for HTML emails
const formatPeso = (amount) =>
    `&#8369;${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const escapeHtml = (text = '') => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

module.exports = { orderNumber, formatPHP, formatPeso, escapeHtml };
