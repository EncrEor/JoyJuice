//Services/claude/handlers/messageHandler.js

const { ResponseTypes, formatFinalResponse } = require('../utils/responseUtils');
const ErrorUtils = require('../utils/errorUtils');
const contextManager = require('../core/contextManager');
const claudeService = require('../core/claudeService');

class MessageHandler {
  async processMessage(userId, message) {
    try {
      console.log(`📥 [messageHandler] Message reçu de l'utilisateur ${userId}:`, message);
  
      // 1) Récupération du contexte
      const context = await contextManager.getConversationContext(userId);
      console.log('🔍 [messageHandler] Contexte récupéré:', context);
      
      if (!context) {
        throw new Error('[messageHandler] Contexte non disponible');
      }

      // 2) Délégation à claudeService pour l'analyse et l'exécution
      const result = await claudeService.processMessage(userId, message);
      console.log('📝 [messageHandler] Résultat claudeService:', result);

      // 3) Vérification de la réponse
      if (!result) {
        throw new Error('[messageHandler] Réponse vide de claudeService');
      }

      // 4) Formatage final via responseUtils
      console.log('📤 [messageHandler] Formatage réponse finale...');
      return await formatFinalResponse(result, context);

    } catch (error) {
      console.error('❌ [messageHandler] Erreur processMessage:', error);
      return formatFinalResponse({
        type: ResponseTypes.ERROR,
        error: {
          code: error.code || 'PROCESS_ERROR',
          message: error.message || 'Erreur lors du traitement du message',
          details: error.stack
        }
      });
    }
  }

  isConversationalMessage(message) {
    const conversationalPatterns = [
      /^(bonjour|salut|bonsoir|au revoir)/i,
      /^merci/i,
      /comment ça va/i
    ];
    return conversationalPatterns.some(pattern => pattern.test(message));
  }
}

module.exports = new MessageHandler();