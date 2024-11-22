//Services/claude/utils.js
// Créer une nouvelle bibliothèque utilitaire appelée `utils.js`

// utils.js - Bibliothèque Utilitaire
class Utils {
    // Méthode de normalisation des noms
    static normalizeName(name) {
      if (!name) return '';
      return name.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")  // Supprime les accents
        .split(' ')                        // Sépare les mots
        .map(word => word.replace(/[^a-z0-9]/g, '')) // Nettoie chaque mot
        .filter(word => word.length > 0)   // Enlève les mots vides
        .join(' ');                        // Rejoint avec des espaces
    }
  
    // Méthode de validation des produits
    static validateProducts(products, cachedProducts) {
      if (!products || products.length === 0) return true;
      return products.every(product => {
        const found = cachedProducts.find(p => 
          this.normalizeName(p.Nom_Produit) === this.normalizeName(product.nom)
        );
        return found && product.quantite > 0;
      });
    }
  
    // Méthode de validation des quantités modifiées
    static validateQuantityModification(produits, lastDelivery) {
      if (!lastDelivery || !produits.length) return false;
      
      const modifications = [];
      
      for (const produit of produits) {
        const existingProduct = lastDelivery.details.find(
          d => this.normalizeName(d.nom_produit) === this.normalizeName(produit.nom)
        );
  
        if (existingProduct) {
          modifications.push({
            product: produit.nom,
            oldQuantity: existingProduct.quantite,
            newQuantity: produit.quantite,
            difference: produit.quantite - existingProduct.quantite
          });
        }
      }
  
      return modifications.length > 0 ? modifications : false;
    }
  
    // Méthode de résolution des références temporelles
    static resolveTimeReference(reference) {
      const now = new Date();
      
      switch(reference.toLowerCase()) {
        case 'hier':
          return new Date(now.setDate(now.getDate() - 1));
        case 'la semaine dernière':
          return new Date(now.setDate(now.getDate() - 7));
        case 'ce matin':
          return new Date(now.setHours(8, 0, 0, 0));
        default:
          return now;
      }
    }
  }
  
  module.exports = Utils;