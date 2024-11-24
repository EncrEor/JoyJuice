const { Anthropic } = require('@anthropic-ai/sdk');
const contextManager = require('./contextManager');
const intentAnalyzer = require('./intentAnalyzer');
const naturalResponder = require('./naturalResponder');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const contextResolver = require('./contextResolver');
const clientHandler = require('../handlers/clientHandler');
const deliveryHandler = require('../handlers/deliveryHandler');
const cacheManager = require('./cacheManager/cacheIndex');


const path = require('path');
const claudeConfig = require(path.resolve(__dirname, '../../../config/claudeConfig'));

// Vérification de l'importation
console.log('🔍 Vérification deliveryHandler importé:', deliveryHandler);

class ClaudeService {
  constructor() {
    this.config = claudeConfig;
    this.client = this.config.getClient();
    this.systemPrompts = {
      default: this.config.getSystemPrompt('conversation'),
      analysis: this.config.getSystemPrompt('analysis'),
      completion: this.config.getSystemPrompt('completion'),
    };
  }

  async initialize() {
    try {
      await contextManager.initializeCache();
      console.log('✅ Service Claude initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation Claude:', error);
      throw error;
    }
  }

  async retryRequest(fn, maxRetries = 5, delay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fn();

        // Log de la réponse après chaque tentative
        console.log(`🔄 Tentative ${i + 1}: Réponse obtenue :`, JSON.stringify(response, null, 2));

        if (!response || typeof response !== 'object') {
          console.error(`❌ Réponse invalide ou absente à la tentative ${i + 1}`);
          throw new Error('Réponse invalide ou absente');
        }

        return response; // Si tout est valide, on retourne la réponse.

      } catch (error) {
        console.log(`❌ Tentative ${i + 1}/${maxRetries} échouée`);

        // Gestion de l'erreur spécifique au quota (code 529)
        if (error.status === 529 && i < maxRetries - 1) {
          const waitTime = delay * Math.pow(2, i); // Délai exponentiel
          console.log(`⏳ Attente de ${waitTime}ms avant tentative ${i + 2}`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue; // Passe à la tentative suivante.
        }

        // Si toutes les tentatives échouent, ou si le quota n'est pas la cause, on lance l'erreur.
        if (i === maxRetries - 1) {
          console.error('❌ Toutes les tentatives ont échoué :', error.message || error);
          throw error;
        }
      }
    }
  }

  async processMessage(userId, message) {
    try {
      console.log(`\n📩 Message reçu de ${userId}:`, message);

      // 1. Récupération du contexte
      const context = await contextManager.getConversationContext(userId);
      console.log('📑 Contexte actuel:', context);

      // 2. Récupération des produits depuis le cache
      console.log('🔄 Tentative de récupération de l\'instance du cache...');
      const cacheStore = cacheManager.getCacheStoreInstance();
      if (!cacheStore) {
        throw new Error('⚠️ Instance de cacheStore non disponible.');
      }

      console.log('🔍 Récupération des produits depuis le cache...');
      const products = cacheStore.getData('products');
      if (!products || typeof products !== 'object' || !products.byId) {
        console.warn('⚠️ Produits introuvables ou format invalide dans le cache.');
      } else {
        console.log(`✅ ${Object.keys(products.byId).length} produits récupérés depuis le cache.`);
      }


      if (!products || !products.byId) {
        console.warn('⚠️ Aucun produit trouvé dans le cache.');
      } else {
        console.log(`✅ Produits récupérés (${Object.keys(products.byId).length} éléments).`);
      }

      // Ajout des produits au contexte
      context.products = products?.byId || {};
      console.log('📦 Produits ajoutés au contexte.');

      // 3. Analyse avec retry si besoin
      const analysis = await this.retryRequest(() =>
        intentAnalyzer.analyzeContextualMessage(userId, message, context)
      );

      if (!analysis || typeof analysis !== 'object') {
        console.error('❌ Analyse échouée ou réponse vide:', analysis);
        throw new Error('Analyse échouée ou réponse vide');
      }

      console.log('🎯 Analyse complétée:', analysis);

      // 4. Exécution de l'action appropriée
      const result = await this.executeAction(analysis);
      console.log('✨ Résultat action:', result);

      // 5. Mise à jour du contexte
      await this.updateContext(userId, analysis, result);

      // 6. Génération de la réponse naturelle
      const response = await this.generateResponse(analysis, result);

      // 7. Formatage final
      return this.formatFinalResponse(response, context);

    } catch (error) {
      console.error('❌ Erreur dans processMessage:', error.message || error);
      return this.handleError(error);
    }
  }

  formatClientResponse(clientResult) {
    switch (clientResult.status) {
      case 'needs_clarification':
        return {
          success: true,
          message: clientResult.message,
          data: {
            type: 'zone_selection',
            zones: clientResult.zones
          }
        };

      case 'success':
        return {
          success: true,
          message: clientResult.message,
          data: clientResult
        };

      default:
        return {
          success: false,
          message: clientResult.message
        };
    }
  }

  formatResponse(analysis) {
    return {
      success: true,
      message: analysis.message || 'Action effectuée',
      data: {
        type: analysis.type,
        details: analysis.intention_details
      }
    };
  }


  async analyzeMessage(userId, message, context) {
    try {
      // Validation des entrées
      if (!userId || typeof userId !== 'string') {
        throw ErrorUtils.createError('userId invalide', 'INVALID_USER_ID');
      }
      if (!message || typeof message !== 'string') {
        throw ErrorUtils.createError('message invalide', 'INVALID_MESSAGE');
      }
      if (!context || typeof context !== 'object') {
        throw ErrorUtils.createError('contexte invalide', 'INVALID_CONTEXT');
      }

      console.log('🔍 Analyse message...');

      // Appel de la méthode analyzeContextualMessage avec gestion des tentatives
      const response = await this.retryRequest(() =>
        intentAnalyzer.analyzeContextualMessage(userId, message)
      );

      // Log de la réponse brute reçue de Claude
      console.log('📩 Réponse brute de Claude :', JSON.stringify(response, null, 2));

      // Validation de la structure de la réponse
      if (!response || typeof response !== 'object' || !response.status) {
        console.error('❌ Réponse de Claude invalide ou vide');
        throw ErrorUtils.createError('Réponse de Claude invalide ou vide', 'INVALID_RESPONSE');
      }

      console.log('🎯 Analyse terminée avec succès :', response);

      // Vérification : Besoin de clarification pour les zones
      if (response.status === 'NEED_ZONE') {
        console.log('⚠️ Besoin de clarification de zone détecté:', response);
        return {
          status: 'NEED_ZONE',
          client: response.client,
          matches: response.matches,
          originalRequest: response
        };
      }

      return response;

    } catch (error) {
      console.error('❌ Erreur analyse message:', error.message || error);
      throw error;
    }
  }

  async executeAction(analysis) {
    try {
      console.log('⚡ Exécution action:', analysis.type);

      switch (analysis.type) {
        case 'CLIENT_SELECTION': {
          // S'assurer que le userId est bien passé
          if (!analysis.userId) {
            throw new Error('userId manquant pour la sélection client');
          }

          // S'assurer que les détails du client sont présents
          if (!analysis.intention_details?.client) {
            throw new Error('Détails client manquants');
          }

          const clientResult = await clientHandler.handleClientSelection(
            analysis.intention_details.client,
            analysis.userId
          );

          console.log('👥 Résultat sélection client:', clientResult);

          // Gestion explicite des résultats
          if (clientResult.status === 'needs_clarification') {
            return {
              status: 'NEED_ZONE',
              message: clientResult.message,
              matches: clientResult.matches,
              zones: clientResult.zones
            };
          }

          return clientResult;
        }

        case 'ACTION_LIVRAISON':
          return await this.handleLivraison(analysis);

        case 'DEMANDE_INFO':
          if (analysis.intention_details.type_info === 'LISTE_ZONES') {
            return await this.handleInfoRequest(analysis);
          }
          return await this.handleDemandeInfo(analysis);

        case 'CONVERSATION':
          return {
            status: 'SUCCESS',
            type: 'CONVERSATION',
            data: analysis.intention_details
          };

        default:
          throw ErrorUtils.createError('Type action non supporté', 'UNSUPPORTED_ACTION');
      }
    } catch (error) {
      console.error('❌ Erreur exécution action:', error);
      return {
        status: 'ERROR',
        message: error.message || 'Erreur lors de l\'exécution de l\'action'
      };
    }
  }

  async handleClientSelection(analysis) {
    try {
      const clientHandler = require('../handlers/clientHandler');
      console.log('🔄 Délégation sélection client au handler');

      return await clientHandler.handleClientSelection(
        analysis.intention_details.client,
        analysis.userId
      );

    } catch (error) {
      console.error('❌ Erreur handleClientSelection:', error);
      throw error;
    }
  }

  async createLivraison(livraisonData) {
    try {
      console.log('📦 [ClaudeService] Début création nouvelle livraison:', livraisonData);

      // Appel direct au service DeliveryHandler pour centraliser la logique
      const result = await deliveryHandler.createDelivery(livraisonData.userId, livraisonData);

      console.log('✅ [ClaudeService] Livraison créée avec succès:', result);

      return result;

    } catch (error) {
      console.error('❌ [ClaudeService] Erreur création livraison:', {
        message: error.message,
        details: livraisonData,
        stack: error.stack,
      });

      return {
        status: 'ERROR',
        message: error.message,
        details: error.details || null,
      };
    }
  }

  //a verifier si pas doublon avec createlivraison
  async handleLivraison(analysis) {
    const details = analysis.intention_details;
    console.log('📦 Traitement livraison:', details);

    // Validation client requis
    if (!details.client?.nom) {
      throw ErrorUtils.createError('Client non spécifié', 'MISSING_CLIENT');
    }

    // Validation produits requis
    if (!details.produits?.length) {
      throw ErrorUtils.createError('Produits non spécifiés', 'MISSING_PRODUCTS');
    }

    // Préparation données livraison
    const livraisonData = {
      clientName: details.client.nom,
      zone: details.client.zone,
      produits: details.produits,
      date: details.date || new Date().toISOString().split('T')[0]
    };

    return await this.createLivraison(livraisonData);
  }

  async handleDemandeInfo(analysis) {
    try {
      const details = analysis.intention_details;
      console.log('ℹ️ Demande info:', details);

      switch (details.type_info) {
        case 'INFO_CLIENT': {
          // Si on demande des zones, utiliser lookupService directement
          if (details.champs?.includes('zone')) {
            console.log('🔍 Recherche des zones pour:', details.client.nom);

            const clientResult = await clientLookupService.findClientByNameAndZone(
              details.client.nom
            );

            // Si on trouve les zones
            if (clientResult.zones?.length > 0) {
              return {
                status: 'SUCCESS',
                message: `Le client ${details.client.nom} est présent dans les zones: ${clientResult.zones.join(', ')}`,
                data: {
                  zones: clientResult.zones,
                  matches: clientResult.matches
                }
              };
            }

            return {
              status: 'NOT_FOUND',
              message: `Aucune zone trouvée pour le client ${details.client.nom}`
            };
          }

          // Pour les autres infos client
          if (!details.client?.nom) {
            throw ErrorUtils.createError('Client non spécifié', 'MISSING_CLIENT');
          }

          return await clientHandler.getClientInfo(details.client);
        }

        case 'STATISTIQUES':
          return await this.getStatistiques(details);

        default:
          throw ErrorUtils.createError('Type info non supporté', 'UNSUPPORTED_INFO_TYPE');
      }

    } catch (error) {
      console.error('❌ Erreur dans handleDemandeInfo:', error);
      return {
        status: 'ERROR',
        message: error.message || 'Erreur lors de la récupération des informations'
      };
    }
  }

  async handleInfoRequest(analysis) {
    try {
      console.log('ℹ️ Traitement demande info:', analysis);

      const { currentContext } = analysis;

      if (!currentContext?.lastClient) {
        throw ErrorUtils.createError(
          'Aucun client actuellement sélectionné dans le contexte.',
          'NO_CLIENT_IN_CONTEXT'
        );
      }

      const client = currentContext.lastClient;
      if (client.availableZones && client.availableZones.length > 0) {
        return {
          status: 'SUCCESS',
          message: `Zones disponibles pour ${client.name}: ${client.availableZones.join(', ')}`,
        };
      } else {
        throw ErrorUtils.createError(
          'Aucune zone disponible trouvée pour le client dans le contexte.',
          'NO_ZONES_AVAILABLE'
        );
      }
    } catch (error) {
      console.error('❌ Erreur dans handleInfoRequest:', error);
      throw error;
    }
  }

  async updateContext(userId, analysis, result) {
    try {
      const contextUpdate = {};

      if (result.status === 'SUCCESS' || result.status === 'NEED_ZONE') {
        if (result.client) {
          contextUpdate.lastClient = {
            name: result.client.Nom_Client,
            zone: result.client.Zone || null,
            availableZones: result.availableZones || []
          };
        }

        if (result.livraison) {
          contextUpdate.lastDelivery = result.livraison;
        }

        if (analysis.intention_details?.produits) {
          contextUpdate.recentProducts = new Set(
            analysis.intention_details.produits.map(p => p.nom)
          );
        }

        if (Object.keys(contextUpdate).length > 0) {
          await contextManager.updateConversationContext(userId, contextUpdate);
          console.log('✅ Contexte mis à jour avec succès:', contextUpdate);
        }
      }
    } catch (error) {
      console.error('❌ Erreur mise à jour du contexte:', error);
    }
  }

  async generateResponse(analysis, result) {
    try {
      console.log('🎯 Génération réponse pour:', { analysis, result });

      // Cas spécial pour création de livraison
      if (analysis.type === 'ACTION_LIVRAISON' &&
        result.status === 'SUCCESS' &&
        result.livraison?.status === 'success') {

        // Récupérer les données de livraison
        const { livraison_id, total, details } = result.livraison;
        const client = analysis.intention_details.client;

        // Construire le message formaté
        const message = `Bon de livraison ${livraison_id} enregistré pour ${client.nom} (${client.zone || '?'}) : ${details.map(d => `${d.Quantite} ${d.nom}`).join(', ')
          } pour un total de ${total} DNT`;

        return {
          message,
          suggestions: ['Voir le détail', 'Nouvelle livraison']
        };
      }


      // Déléguer la génération de réponse naturelle
      const naturalResponse = await naturalResponder.generateResponse(analysis, result);

      // Enrichir avec le contexte selon le type
      if (result.status === 'NEED_ZONE') {
        return {
          message: naturalResponse.message,
          context: {
            needsZone: true,
            matches: result.matches || [],
            zones: result.zones || []
          }
        };
      }

      return {
        message: naturalResponse.message,
        context: result.context || {}
      };


    } catch (error) {
      console.error('❌ Erreur dans generateResponse:', error);
      return {
        message: "Je suis désolé, j'ai rencontré une erreur.",
        context: {}
      };
    }
  }

  formatFinalResponse(response, context) {
    return {
      success: !response.error,
      message: response.message,
      data: {
        type: response.type || 'RESPONSE',
        content: response.data,
        context: response.context
      },
      timestamp: new Date().toISOString()
    };
  }

  handleError(error) {
    console.error('❌ Gestion erreur:', error);
    const errorResponse = ErrorUtils.createError(
      error.message || 'Erreur interne',
      error.code || 'INTERNAL_ERROR'
    );

    return {
      success: false,
      message: errorResponse.message,
      error: errorResponse,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new ClaudeService();