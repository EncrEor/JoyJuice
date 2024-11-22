/**
 * Gestionnaire de contexte pour les conversations et résolutions clients
 * Délègue la gestion du cache au CacheManager
 */
const NodeCache = require('node-cache');
const clientLookupService = require('../../clientLookupService');
const cacheManager = require('./cacheManager/cacheIndex');
const StringUtils = require('../utils/stringUtils');

class ContextManager {
    // Singleton instance
    static instance = null;
    
    // Cache uniquement pour les conversations actives
    // TTL de 30 minutes pour éviter de garder des conversations inactives
    static conversationCache = new NodeCache({ 
        stdTTL: 30 * 60,
        checkperiod: 60 // Vérification toutes les minutes
    });

    /**
     * Constructeur avec pattern Singleton
     * Garantit une seule instance du ContextManager
     */
    constructor() {
        if (!ContextManager.instance) {
            // Utiliser directement cacheStore
            this.cacheStore = require('./cacheManager/cacheStore');
            console.log('🔄 ContextManager: Instance de cacheStore obtenue');
            ContextManager.instance = this;
        }
        return ContextManager.instance;
    }

    /**
     * Initialise le gestionnaire de contexte
     * S'assure que le cache principal est initialisé via CacheManager
     */
    async initialize() {
        try {
            console.log('🚀 Initialisation du ContextManager...');
            
            // Vérifier si le cacheStore est disponible
            if (!this.cacheStore) {
                throw new Error('CacheStore non disponible pour ContextManager');
            }
            
            // Conservation uniquement du cache de conversation
            // qui est spécifique au contexte utilisateur
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

    /**
     * Récupère le contexte de conversation pour un utilisateur
     * Crée un nouveau contexte si aucun n'existe
     * @param {string} userId - Identifiant unique de l'utilisateur
     * @returns {Object} Contexte de conversation
     */
    async getConversationContext(userId) {
        try {
            let context = ContextManager.conversationCache.get(userId);
            
            if (!context) {
                // Création d'un nouveau contexte avec valeurs par défaut
                context = {
                    lastClient: null,          // Dernier client sélectionné
                    lastDelivery: null,        // Dernière livraison traitée
                    recentProducts: new Set(), // Produits récemment mentionnés
                    conversationStart: new Date().toISOString(),
                    lastUpdate: new Date().toISOString()
                };
                ContextManager.conversationCache.set(userId, context);
                console.log(`📝 Nouveau contexte créé pour l'utilisateur ${userId}`);
            }

            return context;
        } catch (error) {
            console.error('❌ Erreur récupération contexte:', error);
            throw error;
        }
    }

    /**
     * Met à jour le contexte de conversation d'un utilisateur
     * @param {string} userId - Identifiant unique de l'utilisateur
     * @param {Object} updates - Modifications à apporter au contexte
     * @returns {Object} Contexte mis à jour
     */
    async updateConversationContext(userId, updates) {
        try {
            const currentContext = await this.getConversationContext(userId);
            const updatedContext = { 
                ...currentContext, 
                ...updates,
                lastUpdate: new Date().toISOString()
            };
            
            console.log('🔄 Mise à jour contexte:', {
                userId,
                updates: Object.keys(updates)
            });

            ContextManager.conversationCache.set(userId, updatedContext);
            return updatedContext;
        } catch (error) {
            console.error('❌ Erreur mise à jour contexte:', error);
            throw error;
        }
    }

    /**
     * Résout un client avec sa zone
     * Gère les cas de clients multiples dans différentes zones
     * @param {string} clientName - Nom du client à rechercher
     * @param {string} zone - Zone optionnelle pour préciser la recherche
     * @returns {Object} Résultat de la recherche avec statut
     */
    async resolveClientWithZone(clientName, zone = null) {
        try {
            console.log(`🔍 Résolution du client: ${clientName}${zone ? ` (zone: ${zone})` : ''}`);
            
            // Recherche du client via le service dédié
            const result = await clientLookupService.findClientByNameAndZone(clientName, zone);
            
            // Cas 1: Client unique trouvé
            if (result.status === 'single_match') {
                console.log('✅ Client unique trouvé:', result.client.Nom_Client);
                return result.client;
            }

            // Cas 2: Plusieurs clients possibles, besoin de préciser la zone
            if (result.status === 'multiple_matches') {
                console.log('⚠️ Plusieurs clients trouvés, nécessite précision zone');
                return {
                    status: 'NEED_ZONE',
                    message: result.message,
                    matches: result.matches,
                    availableZones: result.matches.map(m => m.zone || m.Zone).filter(Boolean)
                };
            }

            // Cas 3: Aucun client trouvé
            console.log('❌ Client non trouvé');
            return {
                status: 'NOT_FOUND',
                message: `Client "${clientName}" introuvable.`,
                searchedName: clientName,
                searchedZone: zone
            };

        } catch (error) {
            console.error('❌ Erreur résolution client:', error);
            throw error;
        }
    }

    /**
     * Récupère des statistiques sur l'état du cache via CacheManager
     * Méthode de diagnostic
     * @returns {Object} État actuel du cache
     */
    static getCacheStatus() {
        return cacheManager.getCacheStatus();
    }

    /**
     * Nettoie le contexte d'un utilisateur
     * Utile quand une conversation est terminée
     * @param {string} userId - Identifiant de l'utilisateur
     */
    async clearUserContext(userId) {
        try {
            ContextManager.conversationCache.del(userId);
            console.log(`🧹 Contexte nettoyé pour l'utilisateur ${userId}`);
        } catch (error) {
            console.error('❌ Erreur nettoyage contexte:', error);
            throw error;
        }
    }

    /**
     * Vérifie si un utilisateur a un contexte actif
     * @param {string} userId - Identifiant de l'utilisateur
     * @returns {boolean} True si un contexte existe
     */
    hasActiveContext(userId) {
        return ContextManager.conversationCache.has(userId);
    }

    /**
     * Récupère des statistiques sur les contextes de conversation
     * Utile pour le monitoring
     * @returns {Object} Statistiques des contextes
     */
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

// Export de l'instance singleton et de la classe
module.exports = new ContextManager();
module.exports.ContextManager = ContextManager;