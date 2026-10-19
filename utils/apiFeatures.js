const escapeRegex = (text = '') => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class APIFeatures {

    constructor(query, queryStr) {
        this.query = query;
        this.queryStr = queryStr;
        // plain mongo filter, kept so the same filter can be used with countDocuments()
        this.filterQuery = {};
    }

    apply(condition) {
        this.filterQuery = { ...this.filterQuery, ...condition };
        this.query = this.query.find(condition);
    }

    // http://localhost:4001/api/v1/products?keyword=labubu
    // matches product name, brand or series (or any word of them)
    search() {
        if (this.queryStr.keyword) {
            const regex = { $regex: escapeRegex(this.queryStr.keyword.trim()), $options: 'i' };
            this.apply({
                $or: [{ name: regex }, { brand: regex }, { series: regex }, { description: regex }]
            });
        }
        return this;
    }

        // http://localhost:4001/api/v1/products?price[gte]=100&price[lte]=1000&series=Crybaby&brand=Pop%20Mart&ratings[gte]=4&numOfReviews[gte]=1
        filter() {
            const q = this.queryStr;

            const priceGte = Number(q['price[gte]']);
            const priceLte = Number(q['price[lte]']);
            const price = {};
            if (q['price[gte]'] !== undefined && q['price[gte]'] !== '' && !Number.isNaN(priceGte)) price.$gte = priceGte;
            if (q['price[lte]'] !== undefined && q['price[lte]'] !== '' && !Number.isNaN(priceLte)) price.$lte = priceLte;
            if (Object.keys(price).length) this.apply({ price });

            // category = series (can be several, comma separated)
            if (q.series) this.apply({ series: { $in: String(q.series).split(',').map(s => s.trim()).filter(Boolean) } });
            if (q.brand) this.apply({ brand: { $in: String(q.brand).split(',').map(s => s.trim()).filter(Boolean) } });

            const ratingsGte = Number(q['ratings[gte]']);
            if (q['ratings[gte]'] !== undefined && q['ratings[gte]'] !== '' && !Number.isNaN(ratingsGte) && ratingsGte > 0) {
                this.apply({ ratings: { $gte: ratingsGte } });
            }

            // review filter: products with at least N customer reviews
            const reviewsGte = Number(q['numOfReviews[gte]']);
            if (q['numOfReviews[gte]'] !== undefined && q['numOfReviews[gte]'] !== '' && !Number.isNaN(reviewsGte) && reviewsGte > 0) {
                this.apply({ numOfReviews: { $gte: reviewsGte } });
            }

            if (q.status) this.apply({ status: q.status });
            return this;
        }

    sort() {
        const sorts = {
            newest: { createdAt: -1 },
            price_asc: { price: 1 },
            price_desc: { price: -1 },
            rating_desc: { ratings: -1, numOfReviews: -1 },
            name_asc: { name: 1 }
        };
        // _id as a tie breaker keeps pages stable while infinite-scrolling
        this.query = this.query.sort({ ...(sorts[this.queryStr.sort] || sorts.newest), _id: 1 });
        return this;
    }

    pagination(resPerPage) {
        const currentPage = Math.max(Number(this.queryStr.page) || 1, 1);
        const skip = resPerPage * (currentPage - 1);

        this.query = this.query.limit(resPerPage).skip(skip);
        return this;
    }
}

APIFeatures.escapeRegex = escapeRegex;

module.exports = APIFeatures
