const StringUtils = require('./stringUtils');

class ValidationUtils {
  static validateClient(client) {
    if (!client?.nom) return false;
    return {
      nom: client.nom,
      zone: client.zone || null,
      implicite: !!client.implicite
    };
  }

  static validateProducts(products, existingProducts) {
    if (!Array.isArray(products) || !products.length) return [];
    
    return products.filter(product => {
      if (!product?.nom || !product?.quantite) return false;
      
      const normalizedName = StringUtils.normalizeProductName(product.nom);
      const exists = existingProducts.some(p => 
        StringUtils.normalizeProductName(p.Nom_Produit) === normalizedName
      );
      
      return exists && product.quantite > 0;
    });
  }

  static validateQuantities(newProducts, oldProducts) {
    if (!Array.isArray(newProducts) || !Array.isArray(oldProducts)) return [];

    return newProducts.map(newProduct => {
      const oldProduct = oldProducts.find(p => 
        StringUtils.normalizeProductName(p.nom_produit) === 
        StringUtils.normalizeProductName(newProduct.nom)
      );

      return {
        nom: newProduct.nom,
        quantite: newProduct.quantite,
        ancienne_quantite: oldProduct?.quantite || 0,
        difference: newProduct.quantite - (oldProduct?.quantite || 0)
      };
    });
  }

  static validateLivraisonData(data) {
    const requiredFields = ['clientName', 'produits'];
    const errors = [];

    requiredFields.forEach(field => {
      if (!data[field]) errors.push(`${field} manquant`);
    });

    if (Array.isArray(data.produits)) {
      data.produits.forEach((p, i) => {
        if (!p.nom || !p.quantite) {
          errors.push(`Produit ${i + 1}: nom et quantité requis`);
        }
      });
    }

    return errors;
  }
}

module.exports = ValidationUtils;