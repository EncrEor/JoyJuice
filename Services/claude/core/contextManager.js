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
        console.log('🔄 Mise à jour du contexte utilisateur:', { userId, updates });

        // Étape 1 : Récupération du contexte actuel
        const currentContext = await this.getConversationContext(userId);

        // Étape 2 : Construction du nouveau contexte
        const updatedContext = { 
            ...currentContext,
            ...updates,
            lastUpdate: new Date().toISOString()
        };

        // Logs détaillés pour les changements spécifiques
        if (updates.lastClient) {
            console.log('👤 Mise à jour du dernier client sélectionné:', {
                ancien: currentContext.lastClient?.Nom_Client,
                nouveau: updates.lastClient?.Nom_Client,
                zone: updates.lastClient?.Zone
            });

            // Garder un historique des derniers clients
            updatedContext.clientHistory = [
                ...(currentContext.clientHistory || []),
                {
                    id: updates.lastClient.ID_Client,
                    nom: updates.lastClient.Nom_Client,
                    zone: updates.lastClient.Zone,
                    timestamp: new Date().toISOString()
                }
            ].slice(-5); // Limiter l'historique à 5 entrées
        }

        if (updates.conversationState) {
            console.log('💬 Mise à jour de l\'état de la conversation:', {
                ancien: currentContext.conversationState,
                nouveau: updates.conversationState
            });

            updatedContext.previousState = currentContext.conversationState;
            updatedContext.conversationState = updates.conversationState;
        }

        // Sauvegarde dans le cache
        ContextManager.conversationCache.set(userId, updatedContext);
        console.log('✅ Contexte utilisateur mis à jour avec succès:', updatedContext);

        return updatedContext;

    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour du contexte:', error);
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
            console.log(`🔍 Tentative de résolution du client: ${clientName}, Zone: ${zone || 'Non spécifiée'}`);
    
            // Recherche dans la base des clients
            const result = await clientLookupService.findClientByNameAndZone(clientName, zone);
    
            switch (result.status) {
                case 'single_match':
                    console.log('✅ Client unique trouvé:', result.client);
                    return result.client;
    
                case 'multiple':
                    console.log('⚠️ Ambiguïté : plusieurs clients trouvés.');
                    return {
                        status: 'NEED_ZONE',
                        message: result.message,
                        matches: result.matches,
                        availableZones: result.zones
                    };
    
                case 'not_found':
                    console.log('❌ Aucun client trouvé pour:', clientName);
                    return {
                        status: 'NOT_FOUND',
                        message: `Client "${clientName}" introuvable.`,
                        searchedName: clientName,
                        searchedZone: zone
                    };
    
                default:
                    console.error('❌ Statut inconnu renvoyé par le service de recherche:', result.status);
                    throw new Error('Statut inconnu dans resolveClientWithZone');
            }
        } catch (error) {
            console.error('❌ Erreur lors de la résolution du client:', error);
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