class ProductNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProductNotFoundError';
        this.code = 'PRODUCT_NOT_FOUND';
    }
}

module.exports = ProductNotFoundError;