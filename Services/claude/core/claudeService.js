// Services/claude/claudeService.js
const { Anthropic } = require('@anthropic-ai/sdk');
const contextManager = require('./contextManager');
const intentAnalyzer = require('./intentAnalyzer');
const naturalResponder = require('./naturalResponder');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const contextResolver = require('./contextResolver');
const clientHandler = require('../handlers/clientHandler');
const cacheManager = require('./cacheManager/cacheIndex');
const indexManager = require('./indexManager');
console.log('IndexManager in claudeService:', indexManager);


const path = require('path');
const claudeConfig = require(path.resolve(__dirname, '../../../config/claudeConfig'));

try {
  const deliveryHandler = require('../handlers/deliveryHandler');
  console.log('🔍 Vérification deliveryHandler importé:', deliveryHandler);
} catch (err) {
  ErrorUtils.logError(err, 'Import deliveryHandler');
}

class ClaudeService {
  constructor() {
    try {
      this.config = claudeConfig;
      this.client = this.config.getClient();
      this.systemPrompts = {
        default: this.config.getSystemPrompt('conversation'),
        analysis: this.config.getSystemPrompt('analysis'),
        completion: this.config.getSystemPrompt('completion')
      };
      console.log('✅ ClaudeService initialisé avec succès');
    } catch (error) {
      console.error('❌ Erreur dans le constructeur de ClaudeService:', error?.message || 'Erreur inconnue');
      throw error; // Rethrow to handle upstream
    }
  }

  async initialize() {
    try {
      await cacheManager.init();  // <- Utiliser cacheManager.init() au lieu de contextManager.initializeCache()
      console.log('✅ Service Claude initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation Claude:', {
        message: error?.message || 'Erreur inconnue',
        code: error?.code,
        stack: error?.stack
      });
      throw error;
    }
  }

  async retryRequest(fn, maxRetries = 5, delay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`🔄 Tentative ${i + 1}/${maxRetries} de l'appel à Claude...`);
        const result = await fn();

        console.log('📩 Résultat de la tentative:', {
          success: !!result,
          type: typeof result,
          hasError: result?.error ? true : false
        });

        if (!result) {
          throw new Error('Résultat vide reçu de Claude');
        }

        return result;

      } catch (error) {
        console.error(`❌ Erreur tentative ${i + 1}/${maxRetries}:`, {
          name: error.name,
          message: error.message,
          stack: error.stack
        });

        if (i === maxRetries - 1) {
          throw error;
        }

        console.log(`⏳ Attente de ${delay}ms avant prochaine tentative...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async processMessage(userId, message) {
    try {
      console.log(`\n📩 Message reçu de ${userId}:`, message);

      const context = await contextManager.getConversationContext(userId);
      console.log('📑 Contexte actuel:', context);

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

      context.products = products?.byId || {};
      console.log('📦 Produits ajoutés au contexte.');

      const analysis = await this.retryRequest(async () => {
        return await intentAnalyzer.analyzeContextualMessage(userId, message, context);
      });

      if (!analysis || typeof analysis !== 'object') {
        console.error('❌ Analyse échouée ou réponse vide:', analysis);
        throw new Error('Analyse échouée ou réponse vide');
      }

      console.log('🎯 Analyse complétée:', analysis);

      const result = await this.executeAction(analysis);
      console.log('✨ Résultat action:', result);

      await this.updateContext(userId, analysis, result);

      const response = await this.generateResponse(analysis, result);

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

      const response = await this.retryRequest(() =>
        intentAnalyzer.analyzeContextualMessage(userId, message)
      );

      console.log('📩 Réponse brute de Claude :', JSON.stringify(response, null, 2));

      if (!response || typeof response !== 'object' || !response.status) {
        console.error('❌ Réponse de Claude invalide ou vide');
        throw ErrorUtils.createError('Réponse de Claude invalide ou vide', 'INVALID_RESPONSE');
      }

      console.log('🎯 Analyse terminée avec succès :', response);

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
        
          case 'DELIVERY': {
            console.log('📦 Traitement message livraison');
            
            // Initialisation des analyseurs
            const deliveryAnalyzer = new DeliveryAnalyzer(
              require('../../clientsService'),
              require('../../produitsService')
            );
            await deliveryAnalyzer.initialize();
            
            // Analyse du message
            const deliveryData = await deliveryAnalyzer.analyzeMessage(analysis.message);
            console.log('✅ Données livraison analysées:', deliveryData);
            
            // Traitement de la livraison
            const processor = new DeliveryProcessor(
              require('../../livraisonsService'),
              require('../../produitsService')
            );
            await processor.initialize();
            
            const result = await processor.processDelivery(deliveryData);
            console.log('✅ Livraison traitée:', result);
            
            return {
              status: 'SUCCESS',
              type: 'DELIVERY',
              data: result
            };
          }

        
        
        case 'CLIENT_SELECTION': {
          if (!analysis.userId) {
            throw new Error('userId manquant pour la sélection client');
          }

          if (!analysis.intention_details?.client) {
            throw new Error('Détails client manquants');
          }

          const clientResult = await clientHandler.handleClientSelection(
            analysis.intention_details.client,
            analysis.userId
          );

          console.log('👥 Résultat sélection client:', clientResult);

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

  async handleLivraison(analysis) {
    const details = analysis.intention_details;
    console.log('📦 Traitement livraison:', details);

    if (!details.client?.nom) {
      throw ErrorUtils.createError('Client non spécifié', 'MISSING_CLIENT');
    }

    if (!details.produits?.length) {
      throw ErrorUtils.createError('Produits non spécifiés', 'MISSING_PRODUCTS');
    }

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
          if (!details.client?.nom) {
            throw ErrorUtils.createError('Client non spécifié', 'MISSING_CLIENT');
          }
        
          // Recherche des zones spécifiquement demandées
          if (details.champs?.includes('zone')) {
            const clientResult = await clientLookupService.findClientByNameAndZone(details.client.nom);
            
            if (clientResult.status === 'multiple') {
              return {
                status: 'SUCCESS',
                message: `Client ${details.client.nom} présent dans les zones: ${clientResult.zones.join(', ')}`,
                data: {
                  zones: clientResult.zones,
                  matches: clientResult.matches
                }
              };
            }
          }
        
          // Recherche info complète client 
          const clientResult = await indexManager.getClientInfo(details.client);
          return clientResult;
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

      if (analysis.type === 'ACTION_LIVRAISON' && 
        result.status === 'SUCCESS' &&
        result.livraison?.status === 'success') {

      const { livraison_id, total, details } = result.livraison;
      
      const clientName = analysis.intention_details.client?.nom;
      const clientZone = result.livraison.zone || analysis.intention_details.client?.Zone || '?';
      
      console.log('🔍 Données pour le message:', {
        id: livraison_id,
        client: clientName,
        zone: clientZone,
        details: details,
        total: total
      });

      const produitsStr = details.map(d => 
        `${d.Quantite} ${d.nom || d.ID_Produit}`
      ).join(', ');
      
      const today = new Date();
      const formattedDate = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
      
      const message = `Bon de livraison ${livraison_id} du ${formattedDate} enregistré pour ${clientName} (${clientZone}) : ${produitsStr} pour un total de ${total} DNT`;

      return {
        message,
        suggestions: ['Voir le détail', 'Nouvelle livraison']
      };
    }

      const naturalResponse = await naturalResponder.generateResponse(analysis, result);

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

const claudeService = new ClaudeService();

const initService = async () => {
  try {
    await claudeService.initialize();
    return claudeService;
  } catch (error) {
    console.error('❌ Erreur initialisation ClaudeService:', {
      message: error.message, 
      stack: error.stack
    });
    throw error;
  }
};

module.exports = initService();
