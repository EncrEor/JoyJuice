const requestLogger = (req, res, next) => {
    console.log('📥 Requête entrante:', {
        method: req.method,
        path: req.path,
        body: req.body,
        timestamp: new Date().toISOString()
    });
    next();
};

module.exports = requestLogger; 