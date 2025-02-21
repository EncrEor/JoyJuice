// Services/claude/core/cacheManager/cacheStore.js
const NodeCache = require('node-cache');
const { CACHE_CONFIG } = require('./cacheConfig');

/**
 * Gestionnaire centralisé du stockage en cache
 * Point d'entrée unique pour toutes les opérations de cache
 */
class CacheStore {
    static instance = null;
    
    constructor() {
        if (CacheStore.instance) {
            return CacheStore.instance;
        }

        console.log('🔧 Initialisation de CacheStore...');

        // Cache principal pour les données métier
        this.dataCache = new NodeCache({
            stdTTL: 0,
            checkperiod: 0,
            useClones: false
        });
        
        // Cache pour les conversations (30min)
        this.conversationCache = new NodeCache({ 
            stdTTL: 30 * 60,
            checkperiod: 120 
        }); 
        
        // Cache pour l'historique (24h)
        this.historyCache = new NodeCache({ 
            stdTTL: 24 * 60 * 60,
            checkperiod: 3600 
        });
        
        // Cache pour le contexte avancé (12h)
        this.advancedContextCache = new NodeCache({ 
            stdTTL: 12 * 60 * 60,
            checkperiod: 1800 
        });

        // État du cache
        this.cacheState = {
            lastRefresh: new Map(),
            refreshInProgress: new Map(),
            errors: new Map()
        };

        // Initialiser les événements
        this.setupEventHandlers();

        console.log('✅ CacheStore initialisé');
        CacheStore.instance = this;
    }

    /**
     * Configuration des gestionnaires d'événements
     */
    setupEventHandlers() {
        // Gestionnaire d'erreurs
        this.dataCache.on('error', (err, key) => {
            console.error(`❌ Erreur cache pour la clé ${key}:`, err);
            this.cacheState.errors.set(key, {
                error: err.message,
                timestamp: new Date().toISOString()
            });
        });

        // Gestionnaire d'expiration
        this.dataCache.on('expired', (key, value) => {
            console.log(`⏰ Expiration de la clé ${key}`);
            this.cacheState.lastRefresh.delete(key);
        });
    }

/**
 * Récupère des données du cache avec gestion des erreurs et logging détaillé
 * @param {string} key - Clé à récupérer
 * @returns {any} Données du cache ou null si erreur
 */
getData(key) {
    try {
        console.log(`📖 (CacheStore) Lecture de ${key} dans le cache`);
        const data = this.dataCache.get(key);
        
        if (data === undefined) {
            console.log(`ℹ️ Aucune donnée trouvée pour ${key}`);
            return null;
        }

        // Log du type et de la taille des données trouvées
        if (data?.byId) {
            console.log(`✅ (cacheStore) Données trouvées pour ${key}: ${Object.keys(data.byId).length} éléments`);
        } else {
            console.log(`✅ (cacheStore) Données trouvées pour ${key}:`, typeof data);
        }
        
        return data;
    } catch (error) {
        console.error(`❌ Erreur lecture ${key}:`, {
            message: error.message,
            stack: error.stack
        });
        return null;
    }
}

/**
 * Enregistre des données dans le cache avec validation et logging
 * @param {string} key - Clé d'enregistrement
 * @param {any} value - Données à enregistrer
 * @param {number} ttl - Durée de vie optionnelle
 * @returns {boolean} Succès de l'opération
 */
setData(key, value, ttl = undefined) {
    console.log(`📝 (cacheStore) Mise en cache pour ${key} :`, value);
    try {
        if (value === undefined || value === null) {
            console.warn(`⚠️ Tentative d'écriture de données nulles/undefined pour ${key}`);
            return false;
        }

        console.log(`📝 (cacheStore) Écriture de ${key} dans le cache`);
        
        // Vérification de la structure des données
        if (typeof value === 'object' && !Array.isArray(value)) {
            if (!value.byId && !value.byName) {
                console.warn(`⚠️ Structure de données incorrecte pour ${key}`);
            }
        }

        const success = this.dataCache.set(key, value, ttl);
        
        if (success) {
            this.cacheState.lastRefresh.set(key, new Date().toISOString());
            // Log de confirmation avec taille des données
            if (value?.byId) {
                console.log(`✅ ${key} mis en cache: ${Object.keys(value.byId).length} éléments`);
            } else {
                console.log(`✅ ${key} mis en cache:`, typeof value);
            }
            return true;
        }

        console.warn(`⚠️ Échec de l'écriture dans le cache pour ${key}`);
        return false;
    } catch (error) {
        console.error(`❌ Erreur écriture ${key}:`, {
            message: error.message,
            stack: error.stack
        });
        return false;
    }
}


    /**
     * Méthodes d'accès aux conversations
     */
    getConversation(userId) {
        return this.conversationCache.get(userId);
    }

    setConversation(userId, data) {
        return this.conversationCache.set(userId, data);
    }

    /**
     * Méthodes d'accès à l'historique
     */
    getHistory(key) {
        return this.historyCache.get(key);
    }

    setHistory(key, value) {
        return this.historyCache.set(key, value);
    }

    /**
     * Méthodes d'accès au contexte avancé
     */
    getAdvancedContext(key) {
        return this.advancedContextCache.get(key);
    }

    setAdvancedContext(key, value) {
        return this.advancedContextCache.set(key, value);
    }

    /**
     * Méthodes utilitaires
     */
    flush(type = 'all') {
        console.log(`🧹 Nettoyage du cache: ${type}`);
        switch(type) {
            case 'data':
                this.dataCache.flushAll();
                break;
            case 'conversation':
                this.conversationCache.flushAll();
                break;
            case 'history':
                this.historyCache.flushAll();
                break;
            case 'advanced':
                this.advancedContextCache.flushAll();
                break;
            case 'all':
                this.dataCache.flushAll();
                this.conversationCache.flushAll();
                this.historyCache.flushAll();
                this.advancedContextCache.flushAll();
                break;
        }
    }

    /**
     * Méthodes de diagnostic
     */
    getStats() {
        return {
            data: this.dataCache.getStats(),
            conversation: this.conversationCache.getStats(),
            history: this.historyCache.getStats(),
            advanced: this.advancedContextCache.getStats(),
            state: {
                lastRefresh: Object.fromEntries(this.cacheState.lastRefresh),
                errors: Object.fromEntries(this.cacheState.errors)
            }
        };
    }

    /**
     * Point d'accès unique à l'instance
     */
    static getInstance() {
        if (!CacheStore.instance) {
            CacheStore.instance = new CacheStore();
        }
        return CacheStore.instance;
    }
}

// Export de l'instance unique
const cacheStore = new CacheStore();
module.exports = cacheStore;