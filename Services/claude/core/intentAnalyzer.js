// Services/claude/core/intentAnalyzer.js
const { Anthropic } = require('@anthropic-ai/sdk');
const contextManager = require('../core/contextManager');
const StringUtils = require('../utils/stringUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');

class IntentionAnalyzer {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.systemPrompt = `Tu es l'assistant JoyJuice qui aide Le livreur à créer ses bons de livraisons de jus de fruits quand il livre ses clients.
    Tu dois analyser chaque message en français pour comprendre naturellement les demandes et identifier les actions requises.
    Sois attentif aux noms de clients, produits et zones mentionnés, et aux types d'actions demandées.
    Sois très concis et précis dans tes réponses.

    Pour une demande de création de livraison, tu dois comprendre :
- Le client concerné
- Les produits avec leurs quantités
- Toute information utile (zone, date, etc)
- Les noms de produits peuvent contenir des espaces et des caractères spéciaux

    Format de réponse JSON attendu :
    {
      "type": "CONVERSATION" | "CLIENT_SELECTION" | "ACTION_LIVRAISON" | "DEMANDE_INFO",
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

        // Pour ACTION_LIVRAISON
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

  async analyzeContextualMessage(userId, message) {
    try {
      const context = await contextManager.getConversationContext(userId);
      const lastResult = context.lastAnalysisResult;

      if (lastResult?.result?.status === 'NEED_ZONE' &&
        lastResult.result?.availableZones?.includes(message.trim())) {

        console.log('🔍 Traitement réponse zone:', {
          zone: message.trim(),
          lastResult: lastResult
        });

        try {
          const resolvedClient = await contextManager.resolveClientWithZone(
            lastResult.result.originalName.split(' ')[0],
            message.trim()
          );

          console.log('✅ Client résolu avec zone:', resolvedClient);

          if (resolvedClient.status === 'SUCCESS') {
            await contextManager.updateConversationContext(userId, {
              lastClient: resolvedClient.client
            });

            return {
              type: lastResult.type,
              intention_details: {
                ...lastResult.intention_details,
                client: {
                  id: resolvedClient.client.ID_Client,
                  nom: resolvedClient.client.Nom_Client,
                  zone: resolvedClient.client.Zone
                }
              },
              resolvedClient: resolvedClient.client,
              contexte_necessaire: false,
              clarification_necessaire: false
            };
          }
        } catch (error) {
          console.error('❌ Erreur résolution client avec zone:', error);
          return {
            type: 'ERROR',
            message: 'Erreur lors de la résolution du client',
            error: error.message
          };
        }
      }

      if (!userId) {
        console.error('❌ userId manquant pour l\'analyse');
        throw new Error('userId est requis');
      }
      if (!message || typeof message !== 'string') {
        console.error('❌ Message invalide:', message);
        throw new Error('Message invalide');
      }
      if (!message.trim()) {
        console.error('❌ Message vide après nettoyage:', message);
        throw new Error('Message vide après nettoyage');
      }

      console.log(`\n🔍 Analyse contextuelle du message pour l'utilisateur ${userId}:`, message);

      const availableProducts = context.products?.byId
        ? Object.values(context.products.byId).map(p => ({
          nom: p.Nom_Produit,
          id: p.ID_Produit,
          prix: p.Prix_Unitaire
        }))
        : [];

      console.log('📦 Produits disponibles:', availableProducts);

      const enrichedMessage = `${this.buildContextualMessage(message, context)}

INFORMATIONS IMPORTANTES :
Liste des produits disponibles :
${availableProducts.map(p => `- ${p.nom} (ID: ${p.id})`).join('\n')}

Règles d'analyse importantes :
1. Les noms des produits peuvent contenir des espaces (ex: "Citron 1L" est UN SEUL nom de produit)
2. L'analyse doit matcher EXACTEMENT un des noms de la liste ci-dessus
3. Il n'y a pas de différence entre "citron 1L", "Citron 1L" - utiliser toujours la forme exacte de la liste

Exemple d'analyse attendue pour "J'ai livré 3 citron 1L":
- produit: { nom: "Citron 1L", quantite: 3 }
et NON PAS
- produit: { nom: "citron", unite: "1L", quantite: 3 }`;

      console.log('📝 Message enrichi:', enrichedMessage);

      let analysisResult;
      try {
        if (!enrichedMessage || typeof enrichedMessage !== 'string') {
          throw new Error('Message enrichi invalide');
        }

        console.log('🤖 Envoi requête à Claude:', {
          model: 'claude-3-haiku-20240307',
          messageLength: enrichedMessage.length,
          messagePreview: enrichedMessage.slice(0, 100) + '...',
          context: {
            hasClient: !!context.lastClient,
            productsCount: Object.keys(context.products || {}).length
          }
        });

        let response = await Promise.race([
          this.anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: enrichedMessage
            }],
            system: this.systemPrompt
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout appel Claude')), 30000)
          )
        ]);

        if (!response?.content?.[0]?.text) {
          console.error('❌ Réponse invalide de Claude:', response);
          throw new Error('Réponse Claude invalide : contenu manquant');
        }

        let responseText = response.content[0].text;
        console.log('📝 Contenu réponse brute:', responseText);

        try {
          analysisResult = JSON.parse(responseText);
          const requiredFields = ['type', 'intention_details'];
          const missingFields = requiredFields.filter(field => !analysisResult[field]);
          if (missingFields.length > 0) {
            throw new Error(`Champs requis manquants: ${missingFields.join(', ')}`);
          }

          console.log('✅ Analyse complète:', {
            type: analysisResult.type,
            details: analysisResult.intention_details,
            needsContext: analysisResult.contexte_necessaire,
            needsClarification: analysisResult.clarification_necessaire
          });

        } catch (parseError) {
          throw new Error(`Erreur parsing JSON: ${parseError.message}\nRéponse: ${responseText}`);
        }

      } catch (error) {
        console.error('❌ Erreur détaillée dans analyzeMessage:', {
          error: {
            name: error.name,
            message: error.message,
            stack: error.stack
          },
          context: {
            requestTimestamp: new Date().toISOString(),
            userId: userId,
            messageLength: message.length,
            hasEnrichedMessage: !!enrichedMessage
          }
        });

        return {
          type: 'ERROR',
          error: {
            message: error.message || 'Une erreur est survenue',
            code: error.name === 'TimeoutError' ? 'TIMEOUT' : 'ANALYSIS_ERROR',
            details: error.details || null
          },
          message: 'Une erreur est survenue lors de l\'analyse du message'
        };
      }

      if (analysisResult) {
        analysisResult.userId = userId;
        analysisResult.currentContext = context;
        analysisResult.availableProducts = availableProducts;

        await this.validateAndEnrichAnalysis(analysisResult);

        await contextManager.updateConversationContext(userId, {
          lastAnalysisResult: analysisResult
        });
      }

      return analysisResult;

    } catch (error) {
      console.error('❌ Erreur dans analyzeContextualMessage:', {
        error: error,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async validateAndEnrichAnalysis(analysis) {
    try {
      console.log('🔍 Validation analyse:', analysis.type);

      switch (analysis.type) {
        case 'CLIENT_SELECTION':
          await this.validateClientSelection(analysis);
          break;

        case 'ACTION_LIVRAISON':
          await this.validateLivraisonAction(analysis);
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

      console.log('✅ Validation terminée');
      return analysis;

    } catch (error) {
      console.error('❌ Erreur validation analyse:', error);
      throw error;
    }
  }

  async validateClientSelection(analysis) {
    try {
      const details = analysis.intention_details;
      console.log('🔍 Analyse sélection client:', details);

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

      console.log('🔍 Résultat recherche client:', clientResult);

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
          console.error('❌ Erreur technique:', clientResult.message);
          analysis.clarification_necessaire = true;
          analysis.message = 'Une erreur est survenue lors de la recherche.';
          break;
        }
      }

    } catch (error) {
      console.error('❌ Erreur validation client:', error);
      analysis.clarification_necessaire = true;
      analysis.message = 'Erreur lors de la validation.';
    }
  }

  async validateLivraisonAction(analysis) {
    const details = analysis.intention_details;
    console.log('🔍 Validation action livraison:', details);

    if (!details.client) {
      if (analysis.currentContext?.lastClient) {
        details.client = {
          nom: analysis.currentContext.lastClient.Nom_Client,
          zone: analysis.currentContext.lastClient.zone,
          implicite: true
        };
      } else {
        analysis.clarification_necessaire = true;
        analysis.raison_clarification = 'client_manquant';
        return;
      }
    }

    if (!details.produits || !Array.isArray(details.produits) || !details.produits.length) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'produits_manquants';
      return;
    }

    for (const produit of details.produits) {
      if (!produit.nom || !produit.quantite || produit.quantite <= 0) {
        analysis.clarification_necessaire = true;
        analysis.raison_clarification = 'details_produit_manquants';
        return;
      }
    }
  }

  validateInfoRequest(analysis) {
    const details = analysis.intention_details;
    console.log('🔍 Validation demande info:', details);

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
    console.log('🔍 Validation conversation:', details);

    if (!details.sous_type) {
      details.sous_type = 'DISCUSSION';
    }

    details.reponse_attendue = details.sous_type !== 'REMERCIEMENT';
  }

  buildContextualMessage(message, context) {
    let enrichedMessage = `Message de Nizar: ${message}\n\nContexte actuel:\n`;

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
      const productList = Object.values(context.products.byId || {}).map(product => product.Nom_Produit).join(', ');
      enrichedMessage += `- Liste des produits disponibles: ${productList}\n`;
    }

    enrichedMessage += `\nMerci d'analyser ce message pour en extraire :
  - Le client concerné (avec sa zone si possible)
  - Les produits avec leurs quantités
  - Le type d'action demandée\n`;

    console.log('📝 Message enrichi pour Claude:', enrichedMessage);
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
