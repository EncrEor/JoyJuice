// Services/claude/core/contextManager.js
const NodeCache = require('node-cache');
const clientLookupService = require('../../clientLookupService');
const cacheManager = require('./cacheManager/cacheIndex');
const StringUtils = require('../utils/stringUtils');

class ContextManager {
  // Singleton instance
  static instance = null;

  // Cache uniquement pour les conversations actives
  static conversationCache = new NodeCache({
    stdTTL: 30 * 60,
    checkperiod: 60 // Vérification toutes les minutes
  });

  constructor() {
    if (!ContextManager.instance) {
      this.cacheStore = require('./cacheManager/cacheStore');
      console.log('🔄 ContextManager: Instance de cacheStore obtenue');
      ContextManager.instance = this;
    }
    return ContextManager.instance;
  }

  async initialize() {
    try {
      console.log('🚀 Initialisation du ContextManager...');

      if (!this.cacheStore) {
        throw new Error('CacheStore non disponible pour ContextManager');
      }

      if (!ContextManager.conversationCache) {
        ContextManager.conversationCache = new NodeCache({
          stdTTL: 30 * 60,
          checkperiod: 60
        });
        console.log('✅ Cache de conversation initialisé');
      }

      console.log('✅ ContextManager initialisé');
    } catch (error) {
      console.error('❌ Erreur initialisation ContextManager:', error);
      throw error;
    }
  }

  async getConversationContext(userId) {
    try {
      console.log(`🔍 Récupération contexte pour userId: ${userId}`);
      
      if (!userId) {
        throw new Error('userId requis');
      }

      let context = ContextManager.conversationCache.get(userId);
      
      if (!context) {
        console.log(`📝 Création nouveau contexte pour ${userId}`);
        context = {
          userId,
          lastAnalysisResult: null,
          lastClient: null,
          createdAt: new Date().toISOString()
        };
        ContextManager.conversationCache.set(userId, context);
      }

      console.log(`✅ Contexte: ${JSON.stringify(context, null, 2)}`);
      return context;

    } catch (error) {
      console.error('❌ Erreur contexte:', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async updateConversationContext(userId, updates) {
    try {
      console.log('🔄 Mise à jour du contexte utilisateur:', { userId, updates });

      const currentContext = await this.getConversationContext(userId);

      const updatedContext = {
        ...currentContext,
        ...updates,
        lastUpdate: new Date().toISOString()
      };

      if (updates.lastClient) {
        console.log('👤 Mise à jour du dernier client sélectionné:', {
          ancien: currentContext.lastClient?.Nom_Client,
          nouveau: updates.lastClient?.Nom_Client,
          zone: updates.lastClient?.Zone
        });

        updatedContext.clientHistory = [
          ...(currentContext.clientHistory || []),
          {
            id: updates.lastClient.ID_Client,
            nom: updates.lastClient.Nom_Client,
            zone: updates.lastClient.Zone,
            timestamp: new Date().toISOString()
          }
        ].slice(-5);
      }

      if (updates.conversationState) {
        console.log('💬 Mise à jour de l\'état de la conversation:', {
          ancien: currentContext.conversationState,
          nouveau: updates.conversationState
        });

        updatedContext.previousState = currentContext.conversationState;
        updatedContext.conversationState = updates.conversationState;
      }

      ContextManager.conversationCache.set(userId, updatedContext);
      console.log('✅ Contexte utilisateur mis à jour avec succès:', updatedContext);

      return updatedContext;

    } catch (error) {
      console.error('❌ Erreur lors de la mise à jour du contexte:', error);
      throw error;
    }
  }

  async resolveClientWithZone(clientName, zone = null) {
    try {
      if (!clientName) {
        throw new Error('Nom du client requis');
      }

      console.log(`🔍 Résolution client "${clientName}"${zone ? ` (zone: ${zone})` : ''}`);

      const result = await clientLookupService.findClientByNameAndZone(
        clientName,
        zone
      );

      console.log('📋 Résultat recherche:', result);

      switch (result.status) {
        case 'success': {
          console.log('✅ Client unique trouvé:', result.client);

          await this.updateClientCache(result.client);

          return {
            status: 'SUCCESS',
            client: result.client,
            message: `Client "${result.client.Nom_Client}" ${result.client.Zone ? `(${result.client.Zone})` : ''}`
          };
        }

        case 'multiple': {
          console.log('⚠️ Plusieurs clients possibles:', result.matches);

          const zones = result.matches
            .map(m => m.Zone)
            .filter(Boolean);

          return {
            status: 'NEED_ZONE',
            message: `Client "${clientName}" présent dans plusieurs zones. Veuillez préciser : ${zones.join(', ')}`,
            matches: result.matches,
            availableZones: zones,
            originalName: clientName
          };
        }

        case 'not_found': {
          console.log('❌ Client non trouvé');
          return {
            status: 'NOT_FOUND',
            message: `Client "${clientName}" introuvable${zone ? ` dans la zone ${zone}` : ''}`,
            searchedName: clientName,
            searchedZone: zone
          };
        }

        default: {
          console.error('❌ Status non géré:', result.status);
          throw new Error('Résultat de recherche invalide');
        }
      }

    } catch (error) {
      console.error('❌ Erreur résolution client:', error);
      throw new Error(`Erreur lors de la résolution du client: ${error.message}`);
    }
  }

  async updateClientCache(client) {
    if (!client || !client.ID_Client) return;

    const clients = this.cacheStore.getData('clients') || { byId: {} };
    clients.byId[client.ID_Client] = client;
    this.cacheStore.setData('clients', clients);

    console.log(`✅ Cache mis à jour pour le client: ${client.ID_Client}`);
  }

  static getCacheStatus() {
    return cacheManager.getCacheStatus();
  }

  async clearUserContext(userId) {
    try {
      ContextManager.conversationCache.del(userId);
      console.log(`🧹 Contexte nettoyé pour l'utilisateur ${userId}`);
    } catch (error) {
      console.error('❌ Erreur nettoyage contexte:', error);
      throw error;
    }
  }

  hasActiveContext(userId) {
    return ContextManager.conversationCache.has(userId);
  }

  getContextStats() {
    const stats = ContextManager.conversationCache.getStats();
    return {
      activeContexts: stats.keys,
      hits: stats.hits,
      misses: stats.misses,
      lastCheck: new Date().toISOString()
    };
  }
}

module.exports = new ContextManager();
module.exports.ContextManager = ContextManager;
