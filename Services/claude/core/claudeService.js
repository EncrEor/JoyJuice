// Services/claude/claudeService.js

const path = require('path');
const claudeConfig = require(path.resolve(__dirname, '../../../config/claudeConfig'));
const { formatFinalResponse } = require('../utils/responseUtils');
const ErrorUtils = require('../utils/errorUtils');
const contextManager = require('./contextManager');
const intentAnalyzer = require('./intentAnalyzer');
const clientLookupService = require('../../clientLookupService');
const clientHandler = require('../handlers/clientHandler');
const cacheManager = require('./cacheManager/cacheIndex');
const indexManager = require('./indexManager');
const DeliveryHandler = require('../handlers/deliveryHandler');


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

      // 1. Récupération du contexte initial
      const initialContext = await contextManager.getConversationContext(userId);
      console.log('🔍 [claudeService] Contexte initial récupéré:', initialContext);

      //if (!Context) {
      //throw new Error('[claudeService] Contexte non disponible');
      //}

      // 2. Analyse avec conservation du contexte
      const analysis = await intentAnalyzer.analyzeContextualMessage(userId, message);

      // Récupération du contexte mis à jour après l'analyse (pour intégrer l'enrichissement produits)
      const updatedContext = await contextManager.getConversationContext(userId);
      console.log('🔍 [claudeService] Contexte mis à jour récupéré:', updatedContext);


      // 3. Exécution de l'action
      const actionResult = await this.executeAction(analysis, updatedContext);

      // 4. Enrichissement du résultat avec infos essentielles
      const enrichedResult = {
        ...actionResult,
        type: analysis.type || actionResult.type,
        analysis: analysis,
        client: actionResult.client || analysis.client,
        context: updatedContext
      };

      // 5. Génération réponse finale via responseUtils
      const finalResponse = await formatFinalResponse(enrichedResult, updatedContext);
      console.log('📤 [claudeService] Réponse finale formatée:', finalResponse);

      // 6. Mise à jour du contexte avec la réponse formatée
      await contextManager.updateContext(userId, finalResponse);
      //console.log('🔍 [claudeService] POST updateContext');

      // 7. Log et retour
      // console.log('🔍 [claudeService] Réponse avant retour:', finalResponse);
      return finalResponse;


    } catch (error) {
      console.error('❌ [claudeService] Erreur processMessage:', error);

      const { formatFinalResponse } = require('./utils/responseUtils');
      return formatFinalResponse({
        type: 'ERROR',
        error: {
          code: error.code || 'PROCESS_ERROR',
          message: error.message
        }
      });
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
          try {
            console.log('⚡ (claudeService) Exécution action:', analysis.type);

            // Validation d'entrée
            if (!analysis.client || !analysis.products) {
              throw new Error('Données d analyse invalides');
            }

            // Préparation données livraison
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


            console.log('🔄 (claudeService) DeliveryData préparées:'); //, deliveryData);


            console.log('📦 (claudeService) Contexte passé à DeliveryHandler:', {
              hasContext: !!context,
              hasProducts: !!context?.products,
              productsCount: context?.products?.byId ? Object.keys(context.products.byId).length : 0
            });

            // Création livraison
            const deliveryHandlerInstance = new DeliveryHandler(context);
            const result = await deliveryHandlerInstance.createDelivery(analysis.userId, deliveryData);

            // Validation résultat
            if (!result.success || !result.livraison || !result.client) {
              throw new Error('Données de livraison invalides');
            }

            try {
              // Construction réponse avec mapping client
              const response = {
                type: 'DELIVERY',
                status: result.status,
                client: {
                  name: result.client.Nom_Client,
                  zone: result.client.Zone,
                  id: result.client.ID_Client
                },
                livraison: result.livraison,
                message: result.message
              };

              console.log('✅ [claudeService] Réponse finale reçue de DeliveryHandler:', response);
              return response;

            } catch (mappingError) {
              console.error('❌ (claudeService) Erreur mapping:', mappingError);
              throw mappingError;
            }

          } catch (error) {
            console.error('❌ (claudeService) Erreur:', {
              message: error.message,
              stack: error.stack
            });
            return {
              type: 'DELIVERY',
              status: 'ERROR',
              error: error.message
            };
          }
        }

        case 'CLIENT_SELECTION': {
          ErrorUtils.validateRequiredParams({
            userId: analysis.userId,
            clientDetails: analysis.intention_details?.client
          });

          const clientResult = await clientHandler.handleClientSelection(analysis.intention_details.client, analysis.userId);
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