//Services/claude/handlers/messageHandler.js

const StringUtils = require('../utils/stringUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientHandler = require('./clientHandler');
const deliveryHandler = require('./deliveryHandler');
const contextManager = require('../core/contextManager');
const intentAnalyzer = require('../core/intentAnalyzer');
const claudeService = require('../core/claudeService');

class MessageHandler {
  

  async processMessage(userId, message) {
    try {
      console.log(`📥 Message reçu de l'utilisateur ${userId}:`, message);
  
      // 1) Récupération du contexte
      const context = await contextManager.getConversationContext(userId);
      console.log('🔍 [DEBUG] Contexte récupéré après mise à jour:', context);
      if (!context) {
        console.error('❌ [Erreur critique] getConversationContext() a retourné undefined !');
      }


      // 2) Analyse de l’intention
      const analysis = await intentAnalyzer.analyzeContextualMessage(userId, message, context);
  
      // On s'assure de stocker le userId dans l'analyse (si besoin plus tard)
      analysis.userId = userId;
  
      console.log('🔍 [MessageHandler] Analyse obtenue:', analysis);
  
      // Vérification basique (peut être adaptée)
      if (!analysis.type) {
        throw new Error('[MessageHandler] Aucune intention détectée dans l’analyse.');
      }
  
      // 3) Exécuter l’action en fonction de l’intention
      const actionResult = await claudeService.executeAction(analysis, context);
  
      // 4) Combiner le résultat avec l’analyse/contexte
      const enrichedResult = {
        ...actionResult,
        // On force le type si absent
        type: analysis.type || actionResult.type,
        analysis,               // Pour conserver l’analyse initiale
        client: actionResult.client || analysis.client,
        context
      };
  
      // 5) Mettre à jour le contexte (si nécessaire)
      await contextManager.updateContext(userId, result);
  
      // 6) Générer la réponse finalisée via naturalResponder
      const response = await naturalResponder.generateResponse(analysis, enrichedResult);
  
      // 7) Formater et retourner la réponse finale
      if (!response) {
        console.error('❌ [messageHandler] Erreur critique: response est undefined avant formatFinalResponse');
      }
      return this.formatFinalResponse(response, context);
  
    } catch (error) {
      console.error('❌ [MessageHandler] Erreur processMessage:', error);
  
      // Exemple de format d'erreur à renvoyer
      return {
        success: false,
        message: error.message || 'Erreur interne',
        code: error.code || 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }


  formatResponse(result) {
    const baseResponse = {
      success: result.status === 'SUCCESS',
      timestamp: new Date().toISOString()
    };

    if (result.status === 'NEED_ZONE') {
      return {
        ...baseResponse,
        message: result.message,
        data: {
          type: 'zone_selection',
          matches: result.matches
        }
      };
    }

    if (result.status === 'SUCCESS') {
      return {
        ...baseResponse,
        data: {
          type: result.type,
          result: result.data
        }
      };
    }

    return {
      ...baseResponse,
      success: false,
      error: result.message || 'Erreur inconnue'
    };
  }

  formatFinalResponse(response, context) {
    
    if (!response?.message) {
      console.warn('⚠️ Réponse sans message:', response);
    }
    
    if (!response) {
      console.error('❌ [messageHandler] Erreur critique: response est undefined dans formatFinalResponse');
      return {
        success: false,
        message: 'Erreur inconnue',
        data: null,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: !response.error,
      message: response?.message || 'Une erreur est survenue', // Ajout d'un message par défaut ici
      data: {
        type: response.type || 'RESPONSE',
        content: response.data,
        context: context
      },
      timestamp: new Date().toISOString()
    };
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