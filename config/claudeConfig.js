const { Anthropic } = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
dotenv.config();

class ClaudeConfig {
  static instance = null;

  constructor() {
    if (ClaudeConfig.instance) {
      return ClaudeConfig.instance;
    }

    this.models = {
      default: 'claude-3-haiku-20240307',
      conversation: 'claude-3-haiku-20240307',
      analysis: 'claude-3-haiku-20240307'
    };

    this.systemPrompts = {
      conversation: `Tu es l'assistant JoyJuice qui aide Nizar à gérer ses livraisons de jus de fruits.`,
      analysis: `Tu analyses les données de livraison pour JoyJuice.`,
      completion: `Tu es l'assistant JoyJuice qui aide à compléter les informations de livraison.`,
      default: `Tu es l'assistant JoyJuice qui aide à gérer les livraisons.`
    };

    this.config = {
      maxTokens: {
        conversation: 1024,
        analysis: 2048,
        default: 1024
      }
    };

    ClaudeConfig.instance = this;

    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('Clé API ANTHROPIC_API_KEY manquante');
      }
      
      this.client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      console.log('✅ ClaudeConfig initialisé avec succès');
    } catch (error) {
      console.error('❌ Erreur initialisation ClaudeConfig:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      throw error;
    }

    return ClaudeConfig.instance;
  }

  async testConnection() {
    try {
      console.log('🔍 Test de connexion à l\'API Anthropic...');
      const response = await this.client.messages.create({
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Test' }],
        model: this.models.default
      });
      console.log('✅ Connexion à l\'API Anthropic réussie');
      return true;
    } catch (error) {
      console.error('❌ Erreur connexion Anthropic:', error.message);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }

  getModel(type = 'default') {
    return this.models[type] || this.models.default;
  }

  getSystemPrompt(type = 'conversation') {
    const prompt = this.systemPrompts[type] || this.systemPrompts.default;
    console.log(`🔍 Récupération prompt système type: ${type}`);
    return prompt;
  }

  getMaxTokens(type) {
    return this.config.maxTokens[type] || this.config.maxTokens.default;
  }
}

module.exports = new ClaudeConfig();