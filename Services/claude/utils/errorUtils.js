class ErrorUtils {
  static errorStack = [];

  static createError(message, code = null, details = null) {
    return {
      message: message,
      code: code,
      timestamp: new Date().toISOString(),
      details: details
    };
  }

  static handleClientError(error) {
    const errorTypes = {
      CLIENT_NOT_FOUND: 'Client non trouvé',
      MULTIPLE_MATCHES: 'Client présent dans plusieurs zones',
      INVALID_ZONE: 'Zone invalide',
      MISSING_DATA: 'Données client manquantes'
    };

    const message = errorTypes[error.code] || error.message;
    return this.createError(message, error.code, error.details);
  }

  static handleLivraisonError(error) {
    const errorTypes = {
      INVALID_PRODUCTS: 'Produits invalides',
      QUANTITY_ERROR: 'Erreur quantités',
      MISSING_CLIENT: 'Client non spécifié',
      INVALID_DATA: 'Données livraison invalides'
    };

    const message = errorTypes[error.code] || error.message;
    return this.createError(message, error.code, error.details);
  }

  static handleApiError(error) {
    return this.createError(
      'Erreur serveur',
      'API_ERROR',
      error.response?.data || error.message
    );
  }

  static isClientError(error) {
    return error.code?.startsWith('CLIENT_');
  }

  static isLivraisonError(error) {
    return error.code?.startsWith('LIVRAISON_');
  }

  static isApiError(error) {
    return error.code === 'API_ERROR';
  }

  static logError(error, context = '') {
    if (!error) {
      const undefinedError = {
        timestamp: new Date(),
        context,
        type: 'UNDEFINED_ERROR',
        stack: new Error().stack
      };
      this.errorStack.push(undefinedError);
      console.warn('⚠️ Erreur undefined détectée:', context, '\nStack:', undefinedError.stack);
      return;
    }
    
    const errorDetails = {
      timestamp: new Date(),
      context,
      message: error?.message || error,
      type: error?.code || 'UNKNOWN',
      stack: error?.stack
    };
    
    this.errorStack.push(errorDetails);
    console.error(`❌ ${context}:`, errorDetails);
  }

  static getLastError() {
    return this.errorStack[this.errorStack.length - 1];
  }
}

module.exports = ErrorUtils;