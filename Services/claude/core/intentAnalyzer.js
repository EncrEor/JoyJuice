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

    this.systemPrompt = `Tu es l'assistant JoyJuice qui aide Nizar à gérer ses livraisons de jus de fruits.
    Tu dois analyser chaque message en français pour comprendre naturellement les demandes et identifier les actions requises.
    
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
      console.log(`\n🔍 Analyse contextuelle du message pour l'utilisateur ${userId}:`, message);
  
      // Récupérer le contexte existant
      const context = await contextManager.getConversationContext(userId);
      console.log('📑 Contexte récupéré:', context);
  
      // Construire un message enrichi avec le contexte
      const enrichedMessage = StringUtils.buildContextualMessage(message, context);
      console.log('📝 Message enrichi:', enrichedMessage);
  
      // Appeler Claude pour obtenir une réponse
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: enrichedMessage
        }],
        system: this.systemPrompt
      });
  
      // Vérification : Réponse vide ou mal formée
      if (!response?.content?.[0]?.text) {
        console.error('❌ Réponse Claude vide ou inexistante');
        throw ErrorUtils.createError('Réponse Claude vide', 'EMPTY_RESPONSE');
      }
  
      let analysisResult;
      try {
        // Parsing de la réponse en JSON
        analysisResult = JSON.parse(response.content[0].text);
        console.log('🎯 Analyse brute:', analysisResult);
  
      } catch (parseError) {
        console.error('❌ Erreur parsing réponse Claude:', parseError);
        console.error('Contenu reçu de Claude:', response.content[0]?.text);
        throw ErrorUtils.createError('Format réponse invalide', 'INVALID_JSON');
      }
  
      // Vérification : Structure de la réponse
      if (!analysisResult.type || !analysisResult.intention_details) {
        console.error('❌ Structure réponse invalide:', analysisResult);
        throw ErrorUtils.createError('Structure réponse invalide', 'INVALID_STRUCTURE');
      }
  
      // Enrichissement avec informations utilisateur
      analysisResult.userId = userId;
      analysisResult.currentContext = context;
  
      // Validation et enrichissement selon le type
      await this.validateAndEnrichAnalysis(analysisResult);
  
      return analysisResult;
  
    } catch (error) {
      console.error('❌ Erreur dans analyzeContextualMessage:', error);
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
    const details = analysis.intention_details;
    console.log('🔍 Validation sélection client:', details.client);

    if (!details.client?.nom) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'client_manquant';
      return;
    }

    // Recherche du client
    const clientResult = await clientLookupService.findClientByNameAndZone(
      details.client.nom,
      details.client.zone
    );

    console.log('🔍 Résultat recherche client:', clientResult); 


    if (!clientResult) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'client_introuvable';
      return;
    }

    if (clientResult.multiple) {
      analysis.clarification_necessaire = true;
      analysis.raison_clarification = 'zone_necessaire';
      analysis.zones_disponibles = clientResult.matches.map(m => m.zone);
      return;
    }

    details.client = {
      ...details.client,
      id: clientResult.ID_Client
    };
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