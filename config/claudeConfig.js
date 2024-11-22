// config/claudeConfig.js

const { Anthropic } = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
dotenv.config();

class ClaudeConfig {
  constructor() {
    if (!ClaudeConfig.instance) {
      this.initialize();
      ClaudeConfig.instance = this;
    }
    return ClaudeConfig.instance;
  }

  initialize() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('La clé API ANTHROPIC_API_KEY n\'est pas définie dans les variables d\'environnement');
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });

    // Configuration des modèles
    this.models = {
      default: 'claude-3-haiku-20240307',
      conversation: 'claude-3-haiku-20240307',
      analysis: 'claude-3-haiku-20240307'
    };

    // Configuration des prompts système par type d'interaction
    this.systemPrompts = {
      conversation: `Tu es l'assistant JoyJuice qui aide Nizar à gérer ses livraisons de jus de fruits.
                    Tu dois répondre en français de manière naturelle et sympathique.`,
      analysis: `Tu es l'assistant JoyJuice qui comprend et analyse les demandes de Nizar.
                    Pour chaque message, tu dois :
                    1. Comprendre l'intention et les détails de la demande
                    2. Préparer une réponse naturelle en français
                    3. Pour le champ "zone" dans l'analyse :
                       - Mettre null si aucune zone n'est explicitement mentionnée
                       - Ne jamais copier le nom du client dans le champ zone
                       - Utiliser uniquement une zone quand elle est explicitement donnée (ex: "zone Aouina")
                    
                    Format OBLIGATOIRE de réponse :
                    {
                        "reponse_naturelle": "Ta réponse en français, naturelle et sympathique",
                        "analyse": {
                            "intention": "INFO_CLIENT" | "LIVRAISON" | "SOLDE" | "STATS_JOURNEE",
                            "client": {
                                "nom": "string",
                                "zone": null | "string si explicitement mentionnée",
                                "implicite": boolean
                            },
                            "produits": [...],
                            "besoin_clarification": boolean,
                            "raison_clarification": "string"
                        }
                    }`,
      completion: `Aide à compléter et valider les informations manquantes en gardant un ton naturel et sympathique.`
    };

    // Configuration des timeouts et limites
    this.config = {
      maxTokens: {
        conversation: 1024,
        analysis: 512,
        completion: 256
      },
      timeouts: {
        request: 30000, // 30 secondes
        socket: 45000   // 45 secondes
      }
    };
  }

  // Obtenir une instance du client Claude
  getClient() {
    return this.client;
  }

  // Obtenir un modèle spécifique
  getModel(type = 'default') {
    return this.models[type] || this.models.default;
  }

  // Obtenir un prompt système
  getSystemPrompt(type) {
    return this.systemPrompts[type] || this.systemPrompts.conversation;
  }

  // Obtenir la configuration des tokens
  getMaxTokens(type) {
    return this.config.maxTokens[type] || this.config.maxTokens.conversation;
  }
}

// Export d'une instance unique
module.exports = new ClaudeConfig();