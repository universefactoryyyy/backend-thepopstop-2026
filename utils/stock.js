const Product = () => require('../models/product');

// Same thresholds as the seeded data: stock 0 = Out of Stock, 1-10 = Low Stock, 11+ = In Stock
const LOW_STOCK_THRESHOLD = 10;

const getStockStatus = (stock) => {
    if (stock <= 0) return 'Out of Stock';
    if (stock <= LOW_STOCK_THRESHOLD) return 'Low Stock';
    return 'In Stock';
}

// Atomically changes the stock by `delta` (negative = sell, positive = restock) and refreshes `status`.
// When removing stock it only succeeds if enough is left, so two buyers can never oversell a product.
const adjustStock = async (productId, delta) => {
    const filter = { _id: productId };
    if (delta < 0) filter.stock = { $gte: -delta };

    return Product().findOneAndUpdate(
        filter,
        [
            { $set: { stock: { $add: ['$stock', delta] } } },
            {
                $set: {
                    status: {
                        $switch: {
                            branches: [
                                { case: { $lte: ['$stock', 0] }, then: 'Out of Stock' },
                                { case: { $lte: ['$stock', LOW_STOCK_THRESHOLD] }, then: 'Low Stock' }
                            ],
                            default: 'In Stock'
                        }
                    }
                }
            }
        ],
        { returnDocument: 'after', updatePipeline: true }
    );
}

module.exports = { LOW_STOCK_THRESHOLD, getStockStatus, adjustStock }
