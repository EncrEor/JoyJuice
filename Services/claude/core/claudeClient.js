const { Anthropic } = require('@anthropic-ai/sdk');
const claudeConfig = require('../../../config/claudeConfig');

class ClaudeClient {
  static instance = null;

  constructor() {
    if (ClaudeClient.instance) {
      return ClaudeClient.instance;
    }

    try {
      this.config = claudeConfig;
      this.client = this.config.getClient();
      this.systemPrompts = {
        default: this.config.getSystemPrompt('conversation'),
        analysis: this.config.getSystemPrompt('analysis'),
        completion: this.config.getSystemPrompt('completion')
      };

      console.log('✅ [claudeClient] Initialisé');
      ClaudeClient.instance = this;
    } catch (error) {
      console.error('❌ [claudeClient] Erreur initialisation:', error);
      throw error;
    }
  }

  async call(content, type = 'default', options = {}) {
    try {
      const model = this.config.getModel(type);
      const systemPrompt = options.systemPrompt || this.systemPrompts[type] || this.systemPrompts.default;
      const maxTokens = this.config.getMaxTokens(type);

      console.log(`🤖 [claudeClient] Appel (${type}):`, {
        contentLength: content.length,
        model,
        maxTokens
      });

      console.log('📤 [claudeClient] Message envoyé :', content);
      console.log('📜 [claudeClient] Prompt système utilisé :', systemPrompt);

      const response = await this.retryRequest(async () => {
        return await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature: options.temperature || 0,
          messages: [{
            role: 'user',
            content
          }],
          system: systemPrompt
        });
      });

      console.log('📝 [claudeClient] Réponse brute de Claude :', response);

      if (!response?.content?.[0]?.text) {
        console.error('❌ [claudeClient] Réponse invalide :', response);
        throw new Error('[claudeClient] Réponse invalide');
      }

      console.log('🔍 [claudeClient] Tentative parsing JSON :', response.content[0].text);

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response.content[0].text);
      } catch (parseError) {
        console.error('❌ [claudeClient] Erreur parsing JSON :', parseError);
        console.error('❌ [claudeClient] Réponse brute ayant causé l\'erreur :', response.content[0].text);
        throw new Error('[claudeClient] Échec parsing JSON');
      }

      console.log('✅ [claudeClient] JSON parsé avec succès :', parsedResponse);

      return parsedResponse;

    } catch (error) {
      console.error('❌ [claudeClient] Erreur appel:', {
        type,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async retryRequest(fn, maxRetries = 5, delay = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const result = await fn();
        if (!result) {
          throw new Error('Résultat vide reçu');
        }
        return result;
      } catch (error) {
        console.warn(`⚠️ [claudeClient] Tentative ${i + 1}/${maxRetries} échouée: ${error.message}`);
        if (i === maxRetries - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Backoff exponentiel
      }
    }
  }

  static getInstance() {
    if (!ClaudeClient.instance) {
      ClaudeClient.instance = new ClaudeClient();
    }
    return ClaudeClient.instance;
  }
}

module.exports = ClaudeClient.getInstance();