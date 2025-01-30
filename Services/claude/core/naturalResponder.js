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
      console.log('🔄 [contextManager] ContextManager: Instance de cacheStore obtenue');
      ContextManager.instance = this;
    }
    return ContextManager.instance;
  }

  async initialize() {
    try {
      console.log('🚀 [contextManager] Initialisation du ContextManager...');

      if (!this.cacheStore) {
        throw new Error('[contextManager] CacheStore non disponible pour ContextManager');
      }

      if (!ContextManager.conversationCache) {
        ContextManager.conversationCache = new NodeCache({
          stdTTL: 30 * 60,
          checkperiod: 60
        });
        console.log('✅ [contextManager] Cache de conversation initialisé');
      }

      console.log('✅ [contextManager] ContextManager initialisé');
    } catch (error) {
      console.error('❌ [contextManager] Erreur initialisation ContextManager:', error);
      throw error;
    }
  }

  async getConversationContext(userId) {
    try {
      //console.log(`🔍 [contextManager] Récupération contexte pour userId: ${userId}`);
      
      if (!userId) {
        throw new Error('userId requis');
      }

      let context = ContextManager.conversationCache.get(userId);
      
      if (!context) {
        console.log(`📝 [contextManager] Création nouveau contexte pour ${userId}`);
        context = {
          userId,
          lastAnalysisResult: null,
          lastClient: null,
          createdAt: new Date().toISOString()
        };
        ContextManager.conversationCache.set(userId, context);
      }

      console.log(`✅ [contextManager] Contexte: ${JSON.stringify(context, null, 2)}`);
      return context;

    } catch (error) {
      console.error('❌ [contextManager] Erreur contexte:', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async updateConversationContext(userId, updates) {
    try {
      // Validation explicite de userId
      if (!userId) {
        throw new Error('[contextManager] userId est requis pour mettre à jour le contexte.');
      }
  
      console.log('🔄 [contextManager] Mise à jour contexte:', { userId, updates });
  
      // Ajout de validation stricte pour les données entrantes
      if (updates.lastClient && (!updates.lastClient.name || !updates.lastClient.id)) {
        throw new Error('[contextManager] Données client invalides pour la mise à jour du contexte');
      }
      if (updates.lastDelivery && (!updates.lastDelivery.livraison_id || !updates.lastDelivery.total)) {
        throw new Error('[contextManager] Données livraison invalides pour la mise à jour du contexte');
      }
  
      const currentContext = await this.getConversationContext(userId);
  
      if (updates.lastClient) {
        const clientInfo = {
          name: updates.lastClient.name || updates.lastClient.Nom_Client,
          zone: updates.lastClient.zone || updates.lastClient.Zone,
          id: updates.lastClient.id || updates.lastClient.ID_Client,
          availableZones: updates.lastClient.availableZones || []
        };
  
        console.log('👤 [contextManager] MAJ client:', {
          ancien: currentContext.lastClient?.name,
          nouveau: clientInfo.name,
          zone: clientInfo.zone
        });
  
        updates.lastClient = clientInfo;
        updates.clientHistory = [
          ...(currentContext.clientHistory || []),
          {
            id: clientInfo.id,
            nom: clientInfo.name,
            zone: clientInfo.zone,
            timestamp: new Date().toISOString()
          }
        ].slice(-5);
      }
  
      if (updates.lastDelivery) {
        console.log('📦 [contextManager] MAJ livraison entrée:', updates.lastDelivery);
  
        updates.lastDelivery = {
          status: updates.lastDelivery.status || 'SUCCESS',
          livraison_id: updates.lastDelivery.livraison_id,
          total: updates.lastDelivery.total,
          details: updates.lastDelivery.details,
          client: {
            name: updates.lastDelivery.client?.name,
            zone: updates.lastDelivery.client?.zone
          }
        };
  
        console.log('📦 [contextManager] MAJ livraison formatée:', updates.lastDelivery);
      }
  
      const updatedContext = {
        ...currentContext,
        ...updates,
        lastUpdate: new Date().toISOString()
      };
  
      ContextManager.conversationCache.set(userId, updatedContext);
      console.log('✅ [contextManager] Contexte mis à jour:', updatedContext);
  
      return updatedContext;
    } catch (error) {
      console.error('❌ [contextManager] Erreur mise à jour contexte:', {
        userId,
        updates,
        error: error.message
      });
      throw error;
    }
  }

  async resolveClientWithZone(clientName, zone = null) {
    try {
      if (!clientName) {
        throw new Error('[contextManager] Nom du client requis');
      }

      console.log(`🔍 [contextManager] Résolution client "${clientName}"${zone ? ` (zone: ${zone})` : ''}`);

      const result = await clientLookupService.findClientByNameAndZone(
        clientName,
        zone
      );

      console.log('📋 [contextManager] Résultat recherche:', result);

      switch (result.status) {
        case 'success': {
          console.log('✅ [contextManager] Client unique trouvé:', result.client);

          await this.updateClientCache(result.client);

          return {
            status: 'SUCCESS',
            client: result.client,
            message: `Client "${result.client.Nom_Client}" ${result.client.Zone ? `(${result.client.Zone})` : ''}`
          };
        }

        case 'multiple': {
          console.log('⚠️ [contextManager] Plusieurs clients possibles:', result.matches);

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
          console.log('❌ [contextManager] Client non trouvé');
          return {
            status: 'NOT_FOUND',
            message: `Client "${clientName}" introuvable${zone ? ` dans la zone ${zone}` : ''}`,
            searchedName: clientName,
            searchedZone: zone
          };
        }

        default: {
          console.error('❌ [contextManager] Status non géré:', result.status);
          throw new Error('Résultat de recherche invalide');
        }
      }

    } catch (error) {
      console.error('❌ [contextManager] Erreur résolution client:', error);
      throw new Error(`Erreur lors de la résolution du client: ${error.message}`);
    }
  }

  async updateClientCache(client) {
    if (!client || !client.ID_Client) {
      throw new Error('[contextManager] Données client manquantes ou invalides.');
    }
  
    const clients = this.cacheStore.getData('clients') || { byId: {} };
    clients.byId[client.ID_Client] = client;
    this.cacheStore.setData('clients', clients);
  
    console.log(`✅ [contextManager] Cache mis à jour pour le client: ${client.ID_Client}`);
  }
  

  static getCacheStatus() {
    return cacheManager.getCacheStatus();
  }

  async validateUserId(userId) {
    if (!userId) {
      console.error('[contextManager] userId requis mais non fourni.');
      throw new Error('userId est requis pour cette opération.');
    }
  }
  
  
  async clearUserContext(userId) {
    try {
      validateUserId(userId); // Ajout de la validation
      ContextManager.conversationCache.del(userId);
      console.log(`🧹 [contextManager] Contexte nettoyé pour l'utilisateur ${userId}`);
    } catch (error) {
      console.error('❌ [contextManager] Erreur nettoyage contexte:', error);
      throw error;
    }
  }
  

  hasActiveContext(userId) {
    validateUserId(userId); // Ajout de la validation
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