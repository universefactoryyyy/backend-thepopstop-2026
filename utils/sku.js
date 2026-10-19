const Product = require('../models/product');

// Codes already used by the seeded catalog: BRAND-CATEGORY-001
const BRAND_CODES = {
    'pop mart': 'PM',
    funko: 'FK',
};
const SERIES_CODES = {
    skullpanda: 'SKP',
    crybaby: 'CRY',
    'the monster': 'MON',
    'pino jelly': 'PIN',
    marvel: 'MAR',
    'dc comics': 'DC',
    anime: 'ANI',
    games: 'GAM',
};

const STOP_WORDS = new Set(['the', 'a', 'an', 'of']);

const partCode = (value, table) => {
    const key = String(value || '').trim().toLowerCase();
    if (table[key]) return table[key];
    const words = key.split(/\s+/).filter(word => word && !STOP_WORDS.has(word));
    if (!words.length) return 'XXX';
    if (words.length > 1) {
        const initials = words.map(word => word.replace(/[^a-z0-9]/g, '')[0]).filter(Boolean).join('').toUpperCase();
        if (initials.length >= 2) return initials.slice(0, 3);
    }
    const letters = words.join('').replace(/[^a-z0-9]/g, '').toUpperCase();
    return (letters + 'XXX').slice(0, 3);
};

const skuPrefix = (brand, series) => `${partCode(brand, BRAND_CODES)}-${partCode(series, SERIES_CODES)}-`;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Next SKU for this brand and category, including soft-deleted products so a code is never reused.
const nextSku = async (brand, series, excludeId) => {
    const prefix = skuPrefix(brand, series);
    const query = { sku: new RegExp(`^${escapeRegex(prefix)}\\d+$`, 'i') };
    if (excludeId) query._id = { $ne: excludeId };
    const existing = await Product.find(query).select('sku');
    const max = existing.reduce((highest, doc) => {
        const number = Number(String(doc.sku).slice(prefix.length));
        return Number.isFinite(number) && number > highest ? number : highest;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, '0')}`;
};

module.exports = { skuPrefix, nextSku };
