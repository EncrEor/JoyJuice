const StringUtils = require('../utils/stringUtils');
const ValidationUtils = require('../utils/validationUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientHandler = require('./clientHandler');
const livraisonsService = require('../../livraisonsService');
const productLookupService = require('../../productLookupService');

class DeliveryHandler {
  async createDelivery(userId, deliveryData) {
    try {
      console.log(`📦 Création livraison:`, deliveryData);

      const errors = ValidationUtils.validateLivraisonData(deliveryData);
      if (errors.length) {
        throw ErrorUtils.createError('Données livraison invalides', 'INVALID_DATA', errors);
      }

      const clientResult = await clientHandler.validateAndEnrichClient({
        nom: deliveryData.clientName,
        zone: deliveryData.zone
      });

      if (clientResult.status === 'NEED_ZONE') {
        return clientResult;
      }

      if (!clientResult.status === 'SUCCESS') {
        throw ErrorUtils.createError('Client invalide', 'INVALID_CLIENT');
      }

      const normalizedProducts = await this.validateAndEnrichProducts(deliveryData.produits);

      const livraisonData = {
        clientName: clientResult.client.Nom_Client,
        zone: clientResult.client.zone,
        produits: normalizedProducts,
        date: deliveryData.date || new Date().toISOString().split('T')[0]
      };

      const result = await livraisonsService.addLivraison(livraisonData);
      await clientHandler.updateClientContext(userId, clientResult.client);

      return {
        status: 'SUCCESS',
        livraison: result
      };

    } catch (error) {
      return ErrorUtils.handleLivraisonError(error);
    }
  }

  async validateAndEnrichProducts(products) {
    if (!Array.isArray(products)) {
      throw ErrorUtils.createError('Liste produits invalide', 'INVALID_PRODUCTS');
    }
  
    const enrichedProducts = await Promise.all(products.map(async (p) => {
      const normalizedName = StringUtils.normalizeProductName(p.nom);
      const productInfo = await productLookupService.findProductByName(normalizedName);
  
      if (!productInfo) {
        console.error(`❌ Produit "${p.nom}" non trouvé.`);
        throw ErrorUtils.createError(`Produit "${p.nom}" non trouvé`, 'PRODUCT_NOT_FOUND');
      }
  
      // **Ajout du log pour vérifier le prix unitaire**
      if (!productInfo.Prix_Unitaire) {
        console.error('❌ Prix unitaire manquant pour le produit:', productInfo);
        throw ErrorUtils.createError(`Prix unitaire manquant pour le produit "${p.nom}"`, 'PRICE_NOT_FOUND');
      }
  
      return {
        id: productInfo.ID_Produit,
        nom: productInfo.Nom_Produit,
        quantite: p.quantite,
        prix_unitaire: productInfo.Prix_Unitaire,
        total: p.quantite * productInfo.Prix_Unitaire
      };
    }));
  
    return enrichedProducts;
  }
  

  async updateQuantities(livraisonId, updatedProducts) {
    try {
      const livraison = await livraisonsService.getLivraisonById(livraisonId);
      if (!livraison) {
        throw ErrorUtils.createError('Livraison non trouvée', 'LIVRAISON_NOT_FOUND');
      }

      const quantityChanges = ValidationUtils.validateQuantities(
        updatedProducts,
        livraison.produits
      );

      await livraisonsService.updateLivraison(livraisonId, {
        ...livraison,
        produits: updatedProducts
      });

      return {
        status: 'SUCCESS',
        changes: quantityChanges
      };

    } catch (error) {
      return ErrorUtils.handleLivraisonError(error);
    }
  }

  async getLivraisonDetails(livraisonId) {
    try {
      console.log(`📦 Détails demandés pour la livraison ID : ${livraisonId}`);
      
      // Vérifier dans le cache
      const cache = CacheManager.getInstance();
      const deliveries = cache.get('deliveries');
      
      if (!deliveries) {
        throw ErrorUtils.createError('Cache des livraisons indisponible', 'CACHE_ERROR');
      }
  
      const livraison = deliveries.find(l => l.ID_Livraison === livraisonId);
      
      if (!livraison) {
        throw ErrorUtils.createError('Livraison non trouvée dans le cache', 'LIVRAISON_NOT_FOUND');
      }
  
      console.log(`✅ Livraison trouvée dans le cache :`, livraison);
  
      return {
        status: 'SUCCESS',
        livraison
      };
  
    } catch (error) {
      return ErrorUtils.handleLivraisonError(error);
    }
  }
  

  calculateTotal(products) {
    return products.reduce((total, p) => total + (p.quantite * p.prix_unitaire), 0);
  }
}

module.exports = new DeliveryHandler();