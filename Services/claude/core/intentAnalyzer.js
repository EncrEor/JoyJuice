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
        // 1. Validation des entrées
        if (!userId) {
            console.error('❌ userId manquant pour l\'analyse');
            throw new Error('userId est requis');
        }
        if (!message || typeof message !== 'string') {
            console.error('❌ Message invalide:', message);
            throw new Error('Message invalide');
        }

        console.log(`\n🔍 Analyse contextuelle du message pour l'utilisateur ${userId}:`, message);

        // 2. Récupération contexte et produits
        const context = await contextManager.getConversationContext(userId);
        console.log('📑 Contexte récupéré:', context);

        // 3. Extraction et préparation des produits disponibles
        const availableProducts = context.products?.byId 
            ? Object.values(context.products.byId).map(p => ({
                nom: p.Nom_Produit,
                id: p.ID_Produit,
                prix: p.Prix_Unitaire
            }))
            : [];
        
        console.log('📦 Produits disponibles:', availableProducts);

        // 4. Construction du message enrichi
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

        // 5. Appel à Claude
        const response = await this.anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: enrichedMessage
            }],
            system: this.systemPrompt
        });

        if (!response?.content?.[0]?.text) {
            console.error('❌ Réponse Claude invalide:', response);
            throw new Error('Réponse Claude invalide');
        }

        // 6. Parsing et validation du résultat
        let analysisResult;
        try {
            analysisResult = JSON.parse(response.content[0].text);
            console.log('🎯 Analyse brute:', analysisResult);
        } catch (parseError) {
            console.error('❌ Erreur parsing réponse Claude:', parseError);
            throw new Error('Format de réponse invalide');
        }

        // 7. Enrichissement avec contexte
        analysisResult.userId = userId;
        analysisResult.currentContext = context;
        analysisResult.availableProducts = availableProducts;

        // 8. Validation et enrichissement final
        await this.validateAndEnrichAnalysis(analysisResult);
        
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

        // 1. Vérification basique de l'intention
        if (!details?.client?.nom) {
            console.log('❌ Pas de client spécifié dans l\'intention');
            analysis.clarification_necessaire = true;
            analysis.message = 'Veuillez spécifier un client.';
            return;
        }

        // 2. Recherche dans la base
        console.log('🔍 Recherche client:', {
            nom: details.client.nom,
            zone: details.client.zone || 'non spécifiée'
        });

        const clientResult = await clientLookupService.findClientByNameAndZone(
            details.client.nom,
            details.client.zone
        );

        console.log('🔍 Résultat recherche client:', clientResult);

        // 3. Traitement selon le résultat
        switch (clientResult.status) {
            case 'success': {
                // Client unique trouvé
                console.log('✅ Client trouvé:', clientResult.client);
                details.client = {
                    id: clientResult.client.ID_Client,
                    nom: clientResult.client.Nom_Client,
                    zone: clientResult.client.Zone
                };
                break;
            }

            case 'multiple': {
                // Plusieurs possibilités
                console.log('ℹ️ Plusieurs clients possibles:', clientResult.zones);
                analysis.clarification_necessaire = true;
                analysis.message = clientResult.message;
                analysis.details = {
                    matches: clientResult.matches,
                    zones: clientResult.zones
                };
                break;
            }

            case 'not_found': {
                // Aucun client trouvé
                console.log('❌ Client non trouvé');
                analysis.clarification_necessaire = true;
                analysis.message = clientResult.message;
                break;
            }

            case 'error': {
                // Erreur technique
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

async checkZoneExists(zone) {
  try {
      // Récupérer la liste de toutes les zones depuis le contexte/cache
      const clients = await clientsService.getClientsData();
      const normalizedZone = normalizeString(zone);
      
      // Vérifier si cette zone existe
      return clients.some(client => 
          normalizeString(client.Zone) === normalizedZone
      );
  } catch (error) {
      console.error('❌ Erreur vérification zone:', error);
      return false;
  }
}

  async validateLivraisonAction(analysis) {
    const details = analysis.intention_details;
    console.log('🔍 Validation action livraison:', details);

    // Validation client
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

    // Validation produits
    if (!details.produits || !Array.isArray(details.produits) || !details.produits.length) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'produits_manquants';
      return;
    }

    // Validation de chaque produit
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
  
 // Inclure la liste des produits disponibles
 if (context.products) {
  const productList = Object.values(context.products.byId || {}).map(product => product.Nom_Produit).join(', ');
  enrichedMessage += `- Liste des produits disponibles: ${productList}\n`;
}

    // Ajouter une notice pour l'analyse attendue
    enrichedMessage += `\nMerci d'analyser ce message pour en extraire :
  - Le client concerné (avec sa zone si possible)
  - Les produits avec leurs quantités
  - Le type d'action demandée\n`;
  
    console.log('📝 Message enrichi pour Claude:', enrichedMessage);
    return enrichedMessage;
  }

  async analyzeMessage(message, context) {
    // Vérifier d'abord si c'est une sélection de zone pour un client en attente
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

    // Continuer avec l'analyse normale si ce n'est pas une sélection de zone
    const analysis = await this.getIntentionFromMessage(message, context);
    return analysis;
  }
}

module.exports = new IntentionAnalyzer();