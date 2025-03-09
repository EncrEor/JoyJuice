// Services/claude/core/intentAnalyzer.js
const claudeClient = require('./claudeClient');
const contextManager = require('../core/contextManager');
const StringUtils = require('../utils/stringUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const cacheManager = require('./cacheManager/cacheIndex');
const { validateResponse } = require('../utils/responseUtils');
const PaymentAnalyzer = require('./payment/paymentAnalyzer');

const DeliveryAnalyzer = require('./delivery/deliveryAnalyzer');

class IntentionAnalyzer {
  constructor() {

    this.systemPrompt = `Tu es l'assistant JoyJuice qui aide Le livreur à créer ses bons de livraisons de jus de fruits quand il livre ses clients.
    Tu dois analyser chaque message en français pour comprendre naturellement les demandes et identifier les actions requises.
    Sois attentif aux noms de clients, produits et zones mentionnés, et aux types d'actions demandées.
    Sois très concis et précis dans tes réponses.

    Format de réponse JSON attendu :
    {
      "type": "CONVERSATION" | "CLIENT_SELECTION" | "DELIVERY" | "DEMANDE_INFO",
      "intention_details": {
        // Pour CONVERSATION
        "sous_type": "SALUTATION" | "QUESTION" | "REMERCIEMENT" | "DISCUSSION",
        "reponse_attendue": boolean,

        // Pour CLIENT_SELECTION
        "client": {
          "nom": string,
          "zone": string | null,
          "type_selection": "EXPLICITE" | "IMPLICITE"
        },

        // Pour "DELIVERY"
        "type_action": "CREATION" | "MODIFICATION" | "ANNULATION",
        "client": {
          "nom": string,
          "zone": string | null
        },
        "produits": [
          {
            "nom": string,
            "quantite": number,
            "unite": string | null
          }
        ],
        "date": string | null,

        // Pour DEMANDE_INFO
        "type_info": "LISTE_CLIENTS" | "INFO_CLIENT" | "STATISTIQUES",
        "client": {
          "nom": string | null,
          "zone": string | null
        },
        "champs": string[]
      },
      "contexte_necessaire": boolean,
      "clarification_necessaire": boolean,
      "raison_clarification": string | null
    }`;
  }

  detectMessageType(message) {
    const lines = message.toLowerCase().trim().split('\n');
    const firstLine = lines[0];

    // 1. Vérifie d'abord les types spécifiques non-livraison
    if (/^(?:ch|vi|tr)$/.test(firstLine)) {
        return 'PAYMENT';
    }

    if (/^(?:info|solde|tel|adresse|status|combien)\b/.test(firstLine)) {
        return 'DEMANDE_INFO';
    }

    if (/^(?:bonjour|merci|au revoir|ok|oui|non)\b/.test(firstLine)) {
        return 'CONVERSATION';
    }

    // 2. Pour une livraison : 
    // Première règle stricte : au moins 2 lignes
    if (lines.length < 2) {
        return 'UNKNOWN';
    }

    // Vérifie si une des lignes suivantes contient un format de commande valide
    const hasOrderLine = lines.slice(1).some(line => {
        return (
            // Série de chiffres séparés par des espaces
            /^\s*\d+(\s+\d+)*\s*$/.test(line) ||
            // Quantité + produit (ex: "3 mg", "2 f")
            /^\s*\d+\s*[cmfrkasy]/i.test(line) ||
            // Format avec mg, cl à la fin sans espace
            /\d+(?:mg|cl|ml|f|c|m|r|k|as|ss|y|gw)\b/i.test(line) ||
            // Attribut "surgélé"
            /^(surgel[ée]s?|surgl)/i.test(line) ||
            // Format quantité + contenance (ex: "5 f 25")
            /^\s*\d+\s+[cmfrkasy]\s+25$/i.test(line)
        );
    });

    if (hasOrderLine) {
        return 'DELIVERY';
    }

    return 'UNKNOWN';
}

async analyzeContextualMessage(userId, message) {
  try {
      console.log('📥 [intentAnalyzer] Analyse message:', { userId, message: message.slice(0, 100) });

      // 1. Validation initiale
      if (!userId || !message?.trim()) {
          throw ErrorUtils.createError('Paramètres invalides', 'INVALID_PARAMS');
      }

      // 2. Détection immédiate du type
      const messageType = this.detectMessageType(message);
      console.log('🎯 [intentAnalyzer] Type détecté:', messageType);

      // 3. Arrêt immédiat si UNKNOWN
      if (messageType === 'UNKNOWN') {
          console.log('⏭️ [intentAnalyzer] Message ignoré (type UNKNOWN)');
          return {
              type: 'UNKNOWN'
          };
      }

      // 4. Chargement du contexte de base
      const context = await contextManager.getConversationContext(userId);

      // 5. Enrichissement du contexte selon les besoins
      if (['DELIVERY', 'PAYMENT'].includes(messageType)) {
          // Chargement des clients et abréviations nécessaires pour DELIVERY et PAYMENT
          try {
              const cacheStore = await cacheManager.getCacheStoreInstance();
              if (cacheStore) {
                  // Chargement des produits uniquement pour DELIVERY
                  if (messageType === 'DELIVERY') {
                      const products = cacheStore.getData('products');
                      if (products?.byId) {
                          await contextManager.updateConversationContext(userId, {
                              products: products
                          });
                          console.log(`✅ ${Object.keys(products.byId).length} produits mis en contexte`);
                      }
                  }
              }
          } catch (cacheError) {
              console.error('❌ Erreur cache:', cacheError);
          }
      }

      // 6. Traitement spécifique selon le type
      switch (messageType) {
          case 'PAYMENT': {
              console.log('💰 [intentAnalyzer] Traitement message de paiement');
              const paymentAnalyzer = new PaymentAnalyzer(context);
              await paymentAnalyzer.initialize();
              const result = await paymentAnalyzer.analyzeMessage(message);
              return validateResponse(result);
          }

          case 'DEMANDE_INFO':
              return await messageHandler.processMessage(userId, message);

          case 'CONVERSATION':
              return {
                  type: 'CONVERSATION',
                  intention_details: await naturalResponder.generateResponse({ message, context })
              };

          case 'DELIVERY': {
              const deliveryAnalyzer = new DeliveryAnalyzer(context);
              await deliveryAnalyzer.initialize();
              try {
                  const result = await deliveryAnalyzer.analyzeMessage(message);
                  return validateResponse(result);
              } catch (error) {
                  console.error('❌ [intentAnalyzer] Erreur dans DeliveryAnalyzer:', error);
                  
                  // Amélioration : détection des erreurs spécifiques
                  if (error.code === 'CLIENT_NOT_FOUND') {
                      return {
                          type: 'ERROR',
                          error: { 
                              code: 'CLIENT_NOT_FOUND',
                              message: `Client "${error.clientName}" non trouvé`,
                              clientName: error.clientName
                          }
                      };
                  }
                  
                  return {
                      type: 'ERROR',
                      error: { 
                          code: error.code || 'DELIVERY_ANALYSIS_ERROR',
                          message: error.message || 'Erreur lors de l\'analyse de la livraison'
                      }
                  };
              }
          }
      }

  } catch (error) {
      console.error('❌ [intentAnalyzer] Erreur analyse:', error);
      return {
          type: 'ERROR',
          error: { code: error.code || 'ANALYSIS_ERROR', message: error.message }
      };
  }
}

  async retryClaudeCall(enrichedMessage) {
    try {
      console.log('🔄 [intentAnalyzer] Appel Claude via client');
      return await claudeClient.call(enrichedMessage, 'analysis', {
        systemPrompt: this.systemPrompt
      });
    } catch (error) {
      console.error('❌ [intentAnalyzer] Erreur appel Claude:', error);
      throw error;
    }
  }

  async validateAndEnrichAnalysis(analysis) {
    try {
      console.log('🔍 [intentAnalyzer] Validation analyse:', analysis.type);

      // Si motif de livraison détecté, déléguer à DeliveryAnalyzer
      if (this.isDeliveryIntent(analysis)) {
        console.log('📦 [intentAnalyzer] Délégation à DeliveryAnalyzer');
        const deliveryAnalyzer = new DeliveryAnalyzer({
          clients: analysis.currentContext?.clients,
          products: analysis.currentContext?.products,
          lastClient: analysis.currentContext?.lastClient,
          lastDelivery: analysis.currentContext?.lastDelivery
        });

        await deliveryAnalyzer.initialize();
        return {
          type: 'DELIVERY',
          ...await deliveryAnalyzer.analyzeMessage(analysis.message)
        };
      }

      switch (analysis.type) {
        case 'CLIENT_SELECTION':
          await this.validateClientSelection(analysis);
          break;

        case 'DEMANDE_INFO':
          await this.validateInfoRequest(analysis);
          break;

        case 'CONVERSATION':
          this.validateConversation(analysis);
          break;

        default:
          console.log('⚠️ Type d\'analyse non reconnu:', analysis.type);
      }

      console.log('✅ [intentAnalyzer] Validation terminée');
      return analysis;

    } catch (error) {
      console.error('❌ [intentAnalyzer] Erreur validation analyse:', error);
      throw error;
    }
  }

  isDeliveryIntent(analysis) {
    const isDelivery = analysis.type === 'DELIVERY' ||
      /[0-9]+\s+(?:citron|mangue|fraise|mg)/i.test(analysis.message);

    console.log('🔍 Test pattern livraison:', {
      message: analysis.message,
      isDelivery,
      type: analysis.type
    });

    return isDelivery;
  }

  async validateClientSelection(analysis) {
    try {
      const details = analysis.intention_details;
      console.log('🔍 [intentAnalyzer] Analyse sélection client:', details);

      if (!details?.client?.nom) {
        console.log('❌ Pas de client spécifié dans l\'intention');
        analysis.clarification_necessaire = true;
        analysis.message = 'Veuillez spécifier un client.';
        return;
      }

      const clientResult = await clientLookupService.findClientByNameAndZone(
        details.client.nom,
        details.client.zone
      );

      console.log('🔍 [intentAnalyzer] Résultat recherche client:', clientResult);

      switch (clientResult.status) {
        case 'success': {
          details.client = {
            id: clientResult.client.ID_Client,
            nom: clientResult.client.Nom_Client,
            zone: clientResult.client.Zone
          };
          break;
        }

        case 'multiple': {
          analysis.clarification_necessaire = true;
          analysis.message = clientResult.message;
          analysis.details = {
            matches: clientResult.matches,
            zones: clientResult.zones
          };
          break;
        }

        case 'not_found': {
          analysis.clarification_necessaire = true;
          analysis.message = clientResult.message;
          break;
        }

        case 'error': {
          console.error('❌ [intentAnalyzer] Erreur technique:', clientResult.message);
          analysis.clarification_necessaire = true;
          analysis.message = 'Une erreur est survenue lors de la recherche.';
          break;
        }
      }

    } catch (error) {
      console.error('❌ [intentAnalyzer] Erreur validation client:', error);
      analysis.clarification_necessaire = true;
      analysis.message = 'Erreur lors de la validation.';
    }
  }

  validateInfoRequest(analysis) {
    const details = analysis.intention_details;
    console.log('🔍 [intentAnalyzer] Validation demande info:', details);

    if (!details.type_info) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'type_info_manquant';
      return;
    }

    if (details.type_info === 'INFO_CLIENT' && !details.client?.nom) {
      if (analysis.currentContext?.lastClient) {
        details.client = {
          nom: analysis.currentContext.lastClient.Nom_Client,
          zone: analysis.currentContext.lastClient.zone,
          implicite: true
        };
      } else {
        analysis.clarification_necessaire = true;
        analysis.raison_clarification = 'client_manquant';
      }
    }
  }

  validateConversation(analysis) {
    const details = analysis.intention_details;
    console.log('🔍 [intentAnalyzer] Validation conversation:', details);

    if (!details.sous_type) {
      details.sous_type = 'DISCUSSION';
    }

    details.reponse_attendue = details.sous_type !== 'REMERCIEMENT';
  }

  buildContextualMessage(message, context) {
    let enrichedMessage = `Message à analyser:\n${message}\n\nContexte actuel:\n`;

    if (context.lastClient) {
      enrichedMessage += `- Dernier client mentionné: ${context.lastClient.Nom_Client} (${context.lastClient.zone || 'pas de zone'})\n`;
    }

    if (context.lastDelivery) {
      enrichedMessage += `- Dernière livraison: ${context.lastDelivery.ID_Livraison}\n`;
      enrichedMessage += `- Produits de la dernière livraison:\n`;
      context.lastDelivery.details?.forEach(detail => {
        enrichedMessage += `  * ${detail.quantite} ${detail.nom_produit}\n`;
      });
    }

    if (context.recentProducts?.size > 0) {
      enrichedMessage += `- Produits récemment mentionnés: ${Array.from(context.recentProducts).join(', ')}\n`;
    }

    if (context.products) {
      const productList = Object.values(context.products.byId || {})
        .map(product => product.Nom_Produit)
        .join(', ');
      enrichedMessage += `- Liste des produits disponibles: ${productList}\n`;
    }

    enrichedMessage += `\nMerci d'analyser ce message pour en extraire :
    - La première ligne contient le nom du client
    - Les lignes suivantes contiennent les quantités de produits
    - Des suffixes peuvent être présents (5L, 25CL, S) et doivent être traités comme modificateurs\n`;

    console.log('📝 [intentAnalyzer] Message enrichi pour Claude:', enrichedMessage);
    return enrichedMessage;
  }

  async analyzeMessage(message, context) {
    if (context?.lastClient?.availableZones) {
      const normalizedInput = message.toLowerCase().trim();
      const matchingZone = context.lastClient.availableZones.find(
        zone => zone.toLowerCase() === normalizedInput
      );

      if (matchingZone) {
        return {
          type: 'CLIENT_SELECTION',
          intention_details: {
            client: {
              nom: context.lastClient.name,
              zone: matchingZone,
              type_selection: 'EXPLICITE'
            }
          },
          contexte_necessaire: true,
          clarification_necessaire: false
        };
      }
    }

    const analysis = await this.getIntentionFromMessage(message, context);
    return analysis;
  }
}

module.exports = new IntentionAnalyzer();