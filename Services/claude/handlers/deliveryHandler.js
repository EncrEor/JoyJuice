//Services/claude/handlers/deliveryHandler.js


const StringUtils = require('../utils/stringUtils');
const ValidationUtils = require('../utils/validationUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientHandler = require('./clientHandler');
const livraisonsService = require('../../livraisonsService');
const productLookupService = require('../../productLookupService');
const DateUtils = require('../core/cacheManager/dateUtils');
const { validateResponse } = require('../utils/responseUtils');
const odooSalesService = require('../../odooSalesService');

class DeliveryHandler {
  constructor(context) {
    if (!context) {
      throw new Error('Contexte requis pour DeliveryHandler');
    }
    console.log('🔍 [DeliveryHandler] Contexte reçu:', {
      hasContext: !!context,
      hasProducts: !!context.products,
      productsCount: context.products?.byId ? Object.keys(context.products.byId).length : 0
    });
    this.context = context;
  }

// Dans deliveryHandler.js
async createDelivery(userId, deliveryData) {
  try {
    console.log('📦 [DeliveryHandler] Début création livraison:', deliveryData);
    
    // Enrichissement produits
    //const cacheStore = require('../core/cacheManager/cacheStore');
    //const productsCache = cacheStore.getData('products');
    const productsCache = this.context?.products;
    if (!productsCache) {
      throw new Error('Cache produits non disponible dans le contexte');
    }


    if (!productsCache?.byId) {
      throw new Error('Cache produits non disponible');
    }

    const enrichedProducts = deliveryData.produits.map(produit => {
      const productInfo = productsCache.byId[produit.id];
      if (!productInfo) {
        throw new Error(`Produit ${produit.id} non trouvé dans le cache`);
      }
      return {
        id: produit.id,
        nom: productInfo.Nom_Produit || `Produit inconnu (${produit.id})`,
        quantite: produit.quantite,
        prix_unitaire: productInfo.Prix_Unitaire,
        total: produit.quantite * productInfo.Prix_Unitaire,
        odooId: productInfo.P_IDODOO 
      };
    });

    const livraisonData = {
      clientName: deliveryData.clientName,
      clientId: deliveryData.clientId,
      zone: deliveryData.zone,
      DEFAULT: deliveryData.DEFAULT,
      produits: enrichedProducts,
      date: DateUtils.formatDateForDelivery()
    };

    console.log('💾 [DeliveryHandler] Données enrichies pour création:', livraisonData);

    // Création via livraisonsService
    const result = await livraisonsService.addLivraison(livraisonData);
    // Récupération du solde client
    const soldeClient = await this.calculateClientBalance(deliveryData.clientId);
    
    console.log('✅ [DeliveryHandler] Résultat après ajout:', result);

    return {
      ...result,
      livraison: {
        ...result.livraison,
        client: {
          name: result.client?.name || deliveryData.clientName,
          id: result.client?.id || deliveryData.clientId,
          zone: result.client?.zone || deliveryData.zone,
          solde: soldeClient // Ajout du solde ici
        }
      }
    };

  } catch (error) {
    console.error('❌ [DeliveryHandler] Erreur:', error.message);
    return {
      status: 'ERROR',
      error: error.message
    };
  }
}

  async validateAndEnrichProducts(products) {
    if (!Array.isArray(products)) {
      throw ErrorUtils.createError('Liste produits invalide', 'INVALID_PRODUCTS');
    }

    const enrichedProducts = await Promise.all(products.map(async (p) => {
      try {
        // Utiliser directement l'ID produit reçu
        console.log(`🔍 Recherche du produit avec ID: "${p.nom}"`);
        const productInfo = await productLookupService.findProductById(p.nom);

        if (!productInfo) {
          throw ErrorUtils.createError(
            `Produit avec l'ID "${p.nom}" non trouvé`,
            'PRODUCT_NOT_FOUND'
          );
        }

        if (!productInfo.Prix_Unitaire) {
          console.error('❌ Prix unitaire manquant pour le produit:', productInfo);
          throw ErrorUtils.createError(
            `Prix unitaire manquant pour le produit "${productInfo.Nom_Produit}"`,
            'PRICE_NOT_FOUND'
          );
        }

        return {
          id: productInfo.ID_Produit,
          nom: productInfo.Nom_Produit,
          quantite: p.quantite,
          prix_unitaire: productInfo.Prix_Unitaire,
          total: p.quantite * productInfo.Prix_Unitaire
        };

      } catch (error) {
        console.error(`❌ Erreur lors de la validation du produit:`, {
          produit: p,
          erreur: error.message
        });
        throw error;
      }
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

  /**
 * Calcule le solde actuel d'un client basé sur ses livraisons non payées.
 * @param {string} clientId - L'identifiant du client.
 * @returns {number} Le solde actuel du client.
 */
  async calculateClientBalance(clientId) {
    try {
      console.log('💰 [DeliveryHandler] Calcul du solde client:', clientId);
  
      // Import du service Odoo
      const odooSalesService = require('../../odooSalesService');
      
      // Récupération solde client depuis Odoo
      const soldeOdoo = await odooSalesService.getCustomerBalance(clientId);
  
      console.log('💰 [DeliveryHandler] Solde Odoo récupéré:', soldeOdoo);
      return soldeOdoo;
      
    } catch (error) {
      console.error('❌ [DeliveryHandler] Erreur lors du calcul du solde:', error);
      throw ErrorUtils.createError('Erreur lors du calcul du solde client', 'BALANCE_CALCULATION_ERROR', error);
    }
  }

}

// Et au lieu d'exporter une instance :
//module.exports = new DeliveryHandler();
// On exporte la classe :
module.exports = DeliveryHandler;