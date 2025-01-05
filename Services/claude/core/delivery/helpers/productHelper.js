// Services/claude/delivery/helpers/productHelper.js
const juiceFamilies = require('../JuiceFamilies');

class ProductHelper {
  // Map des formats standards
  static FORMATS = {
    DEFAULT: '1L',
    FORMATS: {
      '1L': { suffix: '1L', frozen_suffix: '1LS' },
      '25CL': { suffix: '25CL', frozen_suffix: '25CLS' },
      '5L': { suffix: '5L', frozen_suffix: '5LS' },
      '3L': { suffix: '3L', frozen_suffix: '3LS' }
    }
  };

  // Séquences produits par défaut
  static DEFAULT_SEQUENCES = {
    '1': ['C1L', 'M1L', 'F1L', 'R1L', 'CL1L'],
    '25': ['C25CL', 'M25CL', 'F25CL', 'R25CL', 'CL25CL'],
    '5': ['F5L', 'C5L']
  };

  /**
   * Convertit une abréviation en code famille
   */
  static getFamilyCode(abbreviation) {
    const normalized = abbreviation.toLowerCase().trim();
    return juiceFamilies[normalized]?.familyCode || null;
  }

  /**
   * Génère l'ID produit complet
   */
  static generateProductId(familyCode, format = '1L', isFrozen = false) {
    const formatInfo = this.FORMATS.FORMATS[format];
    if (!formatInfo) {
      throw new Error(`Format invalide: ${format}`);
    }
    return `${familyCode}${isFrozen ? formatInfo.frozen_suffix : formatInfo.suffix}`;
  }

  /**
   * Récupère la séquence de produits par défaut
   */
  static getDefaultSequence(defaultType, isFrozen = false) {
    const sequence = this.DEFAULT_SEQUENCES[defaultType];
    if (!sequence) {
      throw new Error(`Type de séquence invalide: ${defaultType}`);
    }
    if (isFrozen) {
      return sequence.map(id => id + 'S');
    }
    return sequence;
  }

  /**
   * Analyse un format spécifié
   */
  static parseFormat(formatStr) {
    if (!formatStr) return null;
    
    const normalized = formatStr.toLowerCase().trim();
    // Gérer les différentes écritures possibles
    const formats = {
      '1l': '1L',
      '25cl': '25CL', 
      '25': '25CL',
      '5l': '5L',
      '3l': '3L'
    };
    return formats[normalized] || null;
  }

  /**
   * Valide que l'ID produit existe dans la base
   */
  static validateProductId(productId, productsCache) {
    return productsCache.hasOwnProperty(productId);
  }
}

module.exports = ProductHelper;