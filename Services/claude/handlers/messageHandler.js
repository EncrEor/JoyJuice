const StringUtils = require('../utils/stringUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientHandler = require('./clientHandler');
const deliveryHandler = require('./deliveryHandler');
const contextManager = require('../core/contextManager');
const intentAnalyzer = require('../core/intentAnalyzer');

class MessageHandler {
  async processMessage(userId, message) {
    try {
      console.log(`📥 Message de ${userId}:`, message);
      
      const context = await contextManager.getConversationContext(userId);
      const analysis = await intentAnalyzer.analyzeContextualMessage(userId, message);
      console.log('🔍 Analyse:', analysis);

      if (!analysis.analyse) {
        throw ErrorUtils.createError('Erreur analyse message', 'ANALYSIS_ERROR');
      }

      const result = await this.executeAction(analysis);
      console.log('✨ Résultat:', result);

      if (result.needsContext) {
        await this.updateContext(userId, analysis, result);
      }

      return this.formatResponse(result);

    } catch (error) {
      return ErrorUtils.handleApiError(error);
    }
  }

  async executeAction(analysis) {
    const { intention, client, produits } = analysis.analyse;

    switch (intention) {
      case 'CLIENT_SELECTION':
        return await clientHandler.validateAndEnrichClient(client);

      case 'LIVRAISON':
        return await deliveryHandler.createDelivery(analysis.userId, {
          clientName: client.nom,
          zone: client.zone,
          produits: produits
        });

      case 'MODIFICATION_QUANTITE':
        if (!analysis.livraisonId) {
          throw ErrorUtils.createError('ID livraison manquant', 'MISSING_DATA');
        }
        return await deliveryHandler.updateQuantities(analysis.livraisonId, produits);

      case 'CONVERSATION':
        return {
          status: 'SUCCESS',
          type: 'CONVERSATION',
          requiresResponse: true
        };

      default:
        throw ErrorUtils.createError('Action non supportée', 'INVALID_ACTION');
    }
  }

  async updateContext(userId, analysis, result) {
    if (result.status === 'SUCCESS') {
      const contextUpdate = {};

      if (result.client) {
        contextUpdate.lastClient = result.client;
      }

      if (result.livraison) {
        contextUpdate.lastDelivery = result.livraison;
      }

      if (Object.keys(contextUpdate).length) {
        await contextManager.updateConversationContext(userId, contextUpdate);
      }
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