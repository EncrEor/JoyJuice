const { Anthropic } = require('@anthropic-ai/sdk');
const contextManager = require('./contextManager');
const StringUtils = require('../utils/stringUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');

class NaturalResponder {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.systemPrompt = `Tu es l'assistant JoyJuice, concis et efficace.
    Réponds brièvement, sans formules de politesse superflues.
    
    Règles de réponse :
    1. Pas de "Bonjour", "Au revoir" sauf si explicitement demandé
    2. Pas de "Je peux vous aider", "N'hésitez pas"
    3. Commencer directement par l'information ou l'action
    4. Inclure la zone avec le nom du client quand disponible
    5. Pour les zones multiples: "Client X présent dans zones: Y, Z"
    6. Pour les erreurs: message clair et direct
    
    Format de réponse JSON attendu :
    {
      "message": "La réponse naturelle directe",
      "context": {
        "needsZone": boolean,
        "matches": [] // Si plusieurs clients trouvés
      }
    }`;
  }

  async generateResponse(analysis, result) {
    try {
        console.log('🎯 Génération réponse pour:', { analysis, result });

        if (result.status === 'NEED_ZONE') {
            const zones = result.availableZones?.join(', ');
            return {
                message: `Le client "${result.matches[0]?.Nom_Client}" est présent dans plusieurs zones : ${zones}. Veuillez préciser laquelle.`,
                context: {
                    needsZone: true,
                    matches: result.matches || []
                }
            };
        }

        if (result.status === 'NEXT_STEP') {
            return {
                message: result.message,
                context: {
                    options: result.options || [],
                    client: result.client
                }
            };
        }

        const promptContent = this.buildPromptFromResults(analysis, result);
        console.log('📝 Contenu prompt:', promptContent);

        const completion = await this.anthropic.messages.create({
            model: 'claude-3-haiku-20240307',
            max_tokens: 1024,
            messages: [{ role: 'user', content: promptContent }],
            system: this.systemPrompt
        });

        console.log('📝 Réponse brute de Claude:', completion?.content?.[0]?.text || 'Pas de réponse');

        if (!completion?.content?.[0]?.text) {
            throw new Error("Réponse de Claude manquante ou incorrecte.");
        }

        const response = JSON.parse(completion.content[0].text);

        return {
            message: StringUtils.formatResponse(response.message, result),
            context: response.context
        };

    } catch (error) {
        console.error('❌ Erreur génération réponse:', error);
        return {
            message: "Une erreur est survenue lors de la génération de la réponse.",
            error: error.message
        };
    }
}

  buildPromptFromResults(analysis, result) {
    let prompt = "Action requise :\n";

    // Informations sur l'intention
    prompt += `Type: ${analysis.type}\n`;
    
    // Informations sur le client
    if (analysis.client?.nom) {
      prompt += `Client: ${analysis.client.nom}`;
      if (analysis.client.zone) prompt += ` (${analysis.client.zone})`;
      prompt += '\n';
    }

    // Résultat de l'action
    prompt += `\nRésultat: ${result.status}\n`;
    if (result.data) {
      prompt += JSON.stringify(result.data, null, 2);
    }

    console.log('🔍 Prompt construit:', prompt);
    return prompt;
  }

  async handleClientSelection(result) {
    console.log('👥 Traitement sélection client:', result);

    if (result.status === 'NEED_ZONE') {
      const zones = result.availableZones.join(', '); // Ajout des zones disponibles dans le message
      return {
        message: `Client ${result.client.nom} présent dans zones: ${result.matches.map(m => m.zone).join(', ')}`,
        context: {
          needsZone: true,
          matches: result.matches
        }
      };
    }

    if (result.status === 'SUCCESS') {
      return {
        message: `Client ${result.client.Nom_Client} ${result.client.zone || ''} sélectionné`,
        context: {
          currentClient: result.client
        }
      };
    }

    return {
      message: result.message || "Client non trouvé",
      error: true
    };
  }

  async handleLivraisonCreated(result) {
    console.log('📦 Traitement création livraison:', result);

    if (result.status !== 'SUCCESS') {
      return {
        message: result.message || "Erreur création livraison",
        error: true
      };
    }

    const details = result.livraison.produits
      .map(p => `${p.quantite} ${p.nom}`)
      .join(', ');

    return {
      message: `Livraison ${result.livraison.id} créée: ${details}. Total: ${result.livraison.total}`,
      context: {
        currentLivraison: result.livraison
      }
    };
  }

  async handleQuantityUpdate(result) {
    console.log('🔄 Traitement modification quantités:', result);

    if (result.status !== 'SUCCESS') {
      return {
        message: result.message || "Erreur modification quantités",
        error: true
      };
    }

    const changes = result.changes
      .map(c => `${c.nom}: ${c.ancienne_quantite} → ${c.quantite}`)
      .join(', ');

    return {
      message: `Quantités mises à jour: ${changes}`,
      context: {
        changes: result.changes
      }
    };
  }

  formatErrorResponse(error) {
    console.log('❌ Formatage erreur:', error);
    return {
      message: error.message || "Une erreur est survenue",
      error: true,
      details: error.details
    };
  }
}

module.exports = new NaturalResponder();