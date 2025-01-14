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
const deliveryHandler = require('../handlers/deliveryHandler');
const path = require('path');
const claudeConfig = require(path.resolve(__dirname, '../../../config/claudeConfig'));

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
      console.log('✅ ClaudeService initialisé');
    } catch (error) {
      console.error('❌ Erreur constructeur ClaudeService:', error);
      throw error;
    }
  }

  async initialize() {
    try {
      await cacheManager.init();
      console.log('✅ Service Claude initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation Claude:', error);
      throw error;
    }
  }

  async retryRequest(fn, maxRetries = 5, delay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await fn();
        if (!result) {
          throw new Error('Résultat vide reçu de Claude');
        }
        return result;
      } catch (error) {
        console.warn(`⚠️ Tentative ${i + 1} échouée: ${error.message}`);
        if (i === maxRetries - 1) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async processMessage(userId, message) {
    try {
      console.log(`📩 Message reçu de ${userId}:`, message);

      const context = await contextManager.getConversationContext(userId);

      // Enrichir le contexte avec les produits du cache
      const cacheStore = cacheManager.getCacheStoreInstance();
      if (cacheStore) {
        const products = cacheStore.getData('products')?.byId;
        if (products) {
          context.products = products;
        }
      }

      // Analyse initiale
      const analysis = await this.retryRequest(() => intentAnalyzer.analyzeContextualMessage(userId, message, context));

      // Exécution de l'action
      const result = await this.executeAction(analysis, context);

      // Mise à jour du contexte
      await this.updateContext(userId, analysis, result);

      // Génération de la réponse
      const response = await this.generateResponse(analysis, result);

      return this.formatFinalResponse(response, context);

    } catch (error) {
      console.error('❌ Erreur processMessage:', error);
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
      ErrorUtils.validateRequiredParams({ userId, message, context });

      const response = await this.retryRequest(() => intentAnalyzer.analyzeContextualMessage(userId, message, context));

      if (!response || typeof response !== 'object' || !response.status) {
        throw ErrorUtils.createError('Réponse de Claude invalide ou vide', 'INVALID_RESPONSE');
      }

      if (response.status === 'NEED_ZONE') {
        return {
          status: 'NEED_ZONE',
          client: response.client,
          matches: response.matches,
          originalRequest: response
        };
      }

      return response;

    } catch (error) {
      console.error('❌ Erreur analyzeMessage:', error);
      throw error;
    }
  }

  async executeAction(analysis, context) {
    try {
      console.log('⚡ (claudeService) Exécution action:', analysis.type);

      switch (analysis.type) {
        
        case 'DELIVERY': {
          console.log('🔍 (claudeService) Client:', analysis.client);
        
          const deliveryData = {
            clientName: analysis.client.name,
            clientId: analysis.client.id,
            zone: analysis.client.zone,
            DEFAULT: analysis.client.DEFAULT,
            produits: analysis.products.map(p => ({
              id: p.ID_Produit,
              nom: p.Nom_Produit,
              quantite: p.quantite
            }))
          };
        
          console.log('📦 (claudeService) Données livraison:', deliveryData);
          const result = await deliveryHandler.createDelivery(analysis.userId, deliveryData);
        
          return {
            type: 'DELIVERY',
            status: 'SUCCESS',
            client: {
              name: analysis.client.name,
              zone: analysis.client.zone,
              id: analysis.client.id
            },
            livraison: {
              status: result.livraison.status,
              livraison_id: result.livraison.livraison_id,
              total: result.livraison.total,
              details: result.livraison.details,
              client: {
                name: analysis.client.name,
                zone: analysis.client.zone || ''
              }
            }
          };
        }

        case 'CLIENT_SELECTION': {
          ErrorUtils.validateRequiredParams({
            userId: analysis.userId,
            clientDetails: analysis.intention_details?.client
          });

          const clientResult = await clientHandler.handleClientSelection(analysis.intention_details.client, analysis.userId);

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
      console.error('❌ Erreur executeAction:', error);
      return {
        status: 'ERROR',
        code: error.code || 'EXECUTION_ERROR',
        message: error.message || "Erreur lors de l'exécution de l'action",
        details: error.details || null
      };
    }
  }

  async handleClientSelection(analysis) {
    try {
      ErrorUtils.validateRequiredParams({ clientDetails: analysis?.intention_details?.client });

      const result = await clientHandler.handleClientSelection(analysis.intention_details.client, analysis.userId);
      ErrorUtils.validateRequiredParams({ resultStatus: result?.status });

      return result;

    } catch (error) {
      console.error('❌ Erreur handleClientSelection:', error);
      return {
        status: 'ERROR',
        error: { code: 'CLIENT_SELECTION_ERROR', message: error.message }
      };
    }
  }

  async createLivraison(livraisonData) {
    try {
      ErrorUtils.validateRequiredParams({ userId: livraisonData?.userId });

      const result = await deliveryHandler.createDelivery(livraisonData.userId, livraisonData);
      if (!result?.status) {
        throw new Error('Création livraison échouée');
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur createLivraison:', error);
      throw error;
    }
  }

  async handleDemandeInfo(analysis) {
    try {
      const details = analysis.intention_details;

      switch (details.type_info) {
        case 'INFO_CLIENT': {
          ErrorUtils.validateRequiredParams({ clientName: details.client?.nom });

          if (details.champs?.includes('zone')) {
            const clientResult = await clientLookupService.findClientByNameAndZone(details.client.nom);
            if (clientResult.status === 'multiple') {
              return {
                status: 'SUCCESS',
                message: `Client ${details.client.nom} présent dans les zones: ${clientResult.zones.join(', ')}`,
                data: { zones: clientResult.zones, matches: clientResult.matches }
              };
            }
          }

          return await indexManager.getClientInfo(details.client);
        }

        case 'STATISTIQUES':
          return await this.getStatistiques(details);

        default:
          throw ErrorUtils.createError('Type info non supporté', 'UNSUPPORTED_INFO_TYPE');
      }

    } catch (error) {
      console.error('❌ Erreur handleDemandeInfo:', error);
      return {
        status: 'ERROR',
        message: error.message || 'Erreur lors de la récupération des informations'
      };
    }
  }

  async handleInfoRequest(analysis) {
    try {
        const { currentContext } = analysis;
    
        if (!currentContext?.lastClient) {
          throw ErrorUtils.createError('Aucun client actuellement sélectionné dans le contexte.', 'NO_CLIENT_IN_CONTEXT');
        }
    
        const client = currentContext.lastClient;
        if (client.availableZones && client.availableZones.length > 0) {
          return {
            status: 'SUCCESS',
            message: `Zones disponibles pour ${client.name}: ${client.availableZones.join(', ')}`,
          };
        } else {
          throw ErrorUtils.createError('Aucune zone disponible trouvée pour le client dans le contexte.', 'NO_ZONES_AVAILABLE');
        }
      } catch (error) {
        console.error('❌ Erreur handleInfoRequest:', error);
        return {
          status: 'ERROR',
          message: error.message || 'Erreur lors de la récupération des informations sur les zones',
          details: error.details || null
        };
      }
  }

async updateContext(userId, analysis, result) {
  try {
    const contextUpdate = {};

    if (result.status === 'SUCCESS') {
      if (result.client) {
        contextUpdate.lastClient = {
          name: result.client.name,
          zone: result.client.zone,
          id: result.client.id
        };
      }

      if (result.livraison) {
        contextUpdate.lastDelivery = result.livraison;
      }

      if (Object.keys(contextUpdate).length > 0) {
        await contextManager.updateConversationContext(userId, contextUpdate);
      }
    }
  } catch (error) {
    console.error('❌ Erreur updateContext:', error);
  }
}


  async generateResponse(analysis, result) {
    try {
      
      //console.log('🔄 Transmission vers naturalResponder:', {
      //  type: 'DELIVERY',
      //  status: 'SUCCESS', 
      //  client: analysis.client,
      //  livraison: result.livraison
      // });
    
        const naturalResponse = await naturalResponder.generateResponse(analysis, result);
    
        return {
          message: naturalResponse.message,
          context: result.context || {}
        };
    } catch (error) {
        console.error('❌ Erreur generateResponse:', error);
        throw error;
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
    console.error('❌ Erreur:', error);
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
    console.error('❌ Erreur initialisation ClaudeService:', error);
    throw error;
  }
};

module.exports = claudeService;