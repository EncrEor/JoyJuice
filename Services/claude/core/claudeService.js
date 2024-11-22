const { Anthropic } = require('@anthropic-ai/sdk');
const contextManager = require('./contextManager');
const intentAnalyzer = require('./intentAnalyzer');
const naturalResponder = require('./naturalResponder');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const contextResolver = require('./contextResolver');


const path = require('path');
const claudeConfig = require(path.resolve(__dirname, '../../../config/claudeConfig'));

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
        return await fn();
      } catch (error) {
        console.log(`❌ Tentative ${i + 1}/${maxRetries} échouée`);

        if (error.status === 529 && i < maxRetries - 1) {
          const waitTime = delay * Math.pow(2, i);
          console.log(`⏳ Attente de ${waitTime}ms avant tentative ${i + 2}`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
        throw error;
      }
    }
  }

  async processMessage(userId, message) {
    try {
        // Validation des entrées
        if (!userId || typeof userId !== 'string') {
            throw ErrorUtils.createError('userId invalide', 'INVALID_USER_ID');
        }
        if (!message || typeof message !== 'string') {
            throw ErrorUtils.createError('message invalide', 'INVALID_MESSAGE');
        }

        console.log(`\n📩 Message reçu de ${userId}:`, message);

        // 1. Récupérer le contexte de conversation
        const context = await contextManager.getConversationContext(userId);
        console.log('📑 Contexte actuel:', context);

        // 2. Analyser le message avec contexte
        let analysis = await this.analyzeMessage(userId, message, context);
        console.log('🔍 Analyse brute:', analysis);

        // 3. Résolution automatique des informations manquantes
        const autoResolution = await contextResolver.resolveMissingInformation(userId, analysis);
        if (autoResolution) {
            console.log('✨ Résolution automatique appliquée:', autoResolution);
            return autoResolution; // Retourne directement la réponse résolue
        }

        // 4. Exécuter l'action appropriée
        const result = await this.executeAction(analysis);
        console.log('✨ Résultat action:', result);

        // 5. Mettre à jour le contexte
        await this.updateContext(userId, analysis, result);
        console.log('📝 Contexte mis à jour');

        // 6. Générer la réponse naturelle
        console.log('🔄 Étape: Génération de la réponse...');
        const response = await this.generateResponse(analysis, result);
        console.log('💬 Réponse finale:', response);

        return this.formatFinalResponse(response, context);

    } catch (error) {
        console.error('❌ Erreur traitement message:', error);
        return this.handleError(error);
    }
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
      const analysis = await this.retryRequest(() =>
          intentAnalyzer.analyzeContextualMessage(userId, message)
      );

      console.log('🎯 Analyse terminée avec succès:', analysis);

      // Vérification : Besoin de clarification pour les zones
      if (analysis.status === 'NEED_ZONE') {
          console.log('⚠️ Besoin de clarification de zone détecté:', analysis);
          return {
              status: 'NEED_ZONE',
              client: analysis.client,
              matches: analysis.matches,
              originalRequest: analysis
          };
      }

      return analysis;

  } catch (error) {
      console.error('❌ Erreur analyse message:', error);
      throw error;
  }
}

  

  async executeAction(analysis) {
    try {
      console.log('⚡ Exécution action:', analysis.type);

      switch (analysis.type) {

        
        case 'CLIENT_SELECTION': {
          const result = await this.handleClientSelection(analysis);
      
          // Gérer les actions après la confirmation de zone
          if (result.status === 'SUCCESS') {
              console.log('✅ Client confirmé avec succès:', result.client);
      
              // Proposer la prochaine étape après sélection du client
              return {
                  status: 'NEXT_STEP',
                  message: `Client "${result.client.Nom_Client}" confirmé dans la zone "${result.client.Zone}". Voulez-vous rechercher des informations ou enregistrer une livraison ?`,
                  options: ['Rechercher infos', 'Saisir livraison'],
                  client: result.client
              };
          }
      
          return result;
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
      throw error;
    }
  }

  async handleClientSelection(analysis) {
    const clientInfo = analysis.intention_details.client;
    console.log('👥 Sélection client:', clientInfo);

    // Si on a déjà une zone spécifiée, on peut directement chercher le client
    if (clientInfo.zone) {
      const selectedClient = await clientLookupService.findClientByNameAndZone(
        clientInfo.nom,
        clientInfo.zone
      );

      if (selectedClient && selectedClient.client) {
        await contextManager.updateConversationContext(analysis.userId, {
          lastClient: {
            name: selectedClient.client.Nom_Client,
            zone: selectedClient.client.Zone,
            id: selectedClient.client.ID_Client
          }
        });

        return {
          status: 'SUCCESS',
          client: selectedClient.client
        };
      }
    }

    // Le reste du code existant pour la gestion des cas multiples
    // Référence aux lignes existantes
  }


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
    const details = analysis.intention_details;
    console.log('ℹ️ Demande info:', details);

    switch (details.type_info) {
      case 'INFO_CLIENT':
        if (!details.client?.nom) {
          throw ErrorUtils.createError('Client non spécifié', 'MISSING_CLIENT');
        }
        return await this.getClientInfo(details.client);

      case 'STATISTIQUES':
        return await this.getStatistiques(details);

      default:
        throw ErrorUtils.createError('Type info non supporté', 'UNSUPPORTED_INFO_TYPE');
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

        // Gestion CLIENT_SELECTION
        if (analysis.type === 'CLIENT_SELECTION') {
            return {
                message: result.message,
                context: {
                    currentClient: result.client,
                    options: result.options || [],
                    needsZone: result.status === 'NEED_ZONE',
                    matches: result.matches || []
                }
            };
        }

        // Traitement spécial pour les salutations
        if (analysis.type === 'CONVERSATION' && 
            analysis.intention_details?.sous_type === 'SALUTATION') {
            return {
                message: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
                context: { 
                    needsZone: false,
                    matches: [],
                    suggestions: [
                        "Voir les livraisons en cours",
                        "Créer une nouvelle livraison",
                        "Voir la liste des clients"
                    ]
                }
            };
        }

        // Autres cas
        if (!result?.message) {
            throw new Error('Réponse invalide générée');
        }

        return {
            message: result.message,
            context: {
                ...result.context,
                needsZone: false,
                matches: []
            }
        };

    } catch (error) {
        console.error('❌ Erreur dans generateResponse:', error);
        return {
            message: "Désolé, j'ai rencontré une erreur. Comment puis-je vous aider ?",
            context: { needsZone: false, matches: [] }
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