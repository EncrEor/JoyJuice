const StringUtils = require('../utils/stringUtils');
const ValidationUtils = require('../utils/validationUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientHandler = require('./clientHandler');
const livraisonsService = require('../../livraisonsService');
const productLookupService = require('../../productLookupService');
const DateUtils = require('../core/cacheManager/dateUtils');

class DeliveryHandler {

  async createDelivery(userId, deliveryData) {
    try {
        console.log('📦 [DeliveryHandler] Début création livraison:', deliveryData);

        // Étape 1 : Validation des données
        console.log('🔍 [DeliveryHandler] Validation des données...');
        const errors = ValidationUtils.validateLivraisonData(deliveryData);
        if (errors.length) {
            console.error('❌ [DeliveryHandler] Erreurs de validation:', errors);
            throw ErrorUtils.createError('Données livraison invalides', 'INVALID_DATA', errors);
        }
        console.log('✅ [DeliveryHandler] Validation réussie.');

        // Étape 2 : Enrichissement des données client
        console.log('🔍 [DeliveryHandler] Validation et enrichissement du client...');
        const clientResult = await clientHandler.validateAndEnrichClient({
            nom: deliveryData.clientName,
            zone: deliveryData.zone,
        });

        if (clientResult.status === 'NEED_ZONE') {
            console.warn('⚠️ [DeliveryHandler] Client ambigu, zone nécessaire:', clientResult);
            return clientResult;
        }

        if (clientResult.status !== 'SUCCESS') {
            console.error('❌ [DeliveryHandler] Client invalide:', clientResult);
            throw ErrorUtils.createError('Client invalide', 'INVALID_CLIENT');
        }
        console.log('✅ [DeliveryHandler] Client validé et enrichi:', clientResult.client);

        // Étape 3 : Calcul du solde actuel
        console.log('💰 [DeliveryHandler] Calcul du solde actuel...');
        const soldeActuel = await this.calculateClientBalance(clientResult.client.ID_Client);

        // Étape 4 : Validation et enrichissement des produits
        console.log('🔍 [DeliveryHandler] Validation et enrichissement des produits...');
        const normalizedProducts = await this.validateAndEnrichProducts(deliveryData.produits);
        console.log('✅ [DeliveryHandler] Produits validés et enrichis:', normalizedProducts);

        // Étape 5 : Calcul du total de la livraison
        console.log('💰 [DeliveryHandler] Calcul du total de la livraison...');
        const totalLivraison = this.calculateTotal(normalizedProducts);
        console.log('✅ [DeliveryHandler] Total de la livraison:', totalLivraison);

        // Étape 6 : Préparation des données de livraison
        console.log('📋 [DeliveryHandler] Préparation des données pour enregistrement...');
        const livraisonData = {
          clientName: clientResult.client.Nom_Client,
          clientId: clientResult.client.ID_Client, // Ajout de l'ID client
          zone: clientResult.client.Zone, // Utiliser la bonne propriété 'Zone'
          produits: normalizedProducts,
          date: DateUtils.formatDateForDelivery(deliveryData.date)
        };

        // Étape 7 : Enregistrement de la livraison
        console.log('💾 [DeliveryHandler] Enregistrement de la livraison dans le service...');
        const result = await livraisonsService.addLivraison(livraisonData);
        console.log('✅ [DeliveryHandler] Livraison enregistrée avec succès:', result);

        // Étape 8 : Mise à jour du contexte utilisateur
        console.log('🔄 [DeliveryHandler] Mise à jour du contexte utilisateur...');
        await clientHandler.updateClientContext(userId, clientResult.client);

        return {
            status: 'SUCCESS',
            livraison: result,
        };
    } catch (error) {
        console.error('❌ [DeliveryHandler] Erreur dans createDelivery:', {
            message: error.message,
            details: deliveryData,
            stack: error.stack,
        });
        return ErrorUtils.handleLivraisonError(error);
    }
}

async validateAndEnrichProducts(products) {
  if (!Array.isArray(products)) {
    throw ErrorUtils.createError('Liste produits invalide', 'INVALID_PRODUCTS');
  }

  const enrichedProducts = await Promise.all(products.map(async (p) => {
    try {
      // Construction du nom complet du produit
      let nomComplet = `${p.nom.charAt(0).toUpperCase()}${p.nom.slice(1)}`;
      if (p.unite) {
        nomComplet += ` ${p.unite}`; // Ajoute l'unité si présente
      }
      
      console.log(`🔍 Recherche du produit: "${nomComplet}"`);
      let productInfo = await productLookupService.findProductByName(nomComplet);  // Changé en let

      // Si produit non trouvé, essayer avec variantes
      if (!productInfo) {
        // Essayer avec différentes variantes du nom
        const variantes = [
          `${nomComplet}L`, // ex: Citron 1L
          p.nom.charAt(0).toUpperCase() + p.nom.slice(1), // ex: Citron
          nomComplet.toLowerCase(), // ex: citron 1l
        ];

        for (const variante of variantes) {
          console.log(`🔄 Essai avec variante: "${variante}"`);
          const produitVariante = await productLookupService.findProductByName(variante);
          if (produitVariante) {
            console.log(`✅ Produit trouvé avec la variante: "${variante}"`);
            productInfo = produitVariante;
            break;
          }
        }

        if (!productInfo) {
          throw ErrorUtils.createError(
            `Produit "${p.nom}" non trouvé, essayé avec: ${nomComplet}`, 
            'PRODUCT_NOT_FOUND'
          );
        }
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
      console.log('💰 [DeliveryHandler] Récupération des livraisons non payées pour calculer le solde...');
      const livraisonsNonPayees = await livraisonsService.getLivraisonsByClientCurrentMonth(clientId);

      const soldeActuel = livraisonsNonPayees.reduce((total, liv) => {
          const montant = parseFloat(liv.Total_livraison);
          return total + (isNaN(montant) ? 0 : montant);
      }, 0);

      console.log('💰 [DeliveryHandler] Solde actuel calculé:', soldeActuel);
      return soldeActuel;
  } catch (error) {
      console.error('❌ [DeliveryHandler] Erreur lors du calcul du solde:', error);
      throw ErrorUtils.createError('Erreur lors du calcul du solde client', 'BALANCE_CALCULATION_ERROR', error);
  }
}

}

module.exports = new DeliveryHandler();