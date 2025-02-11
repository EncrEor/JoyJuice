// cacheManager/cacheIndex.js

const NodeCache = require('node-cache');
const cacheStore = require('./cacheStore');
const eventManager = require('./eventManager');
const CacheUtils = require('./cacheUtils');
const DateUtils = require('./dateUtils');
const { CACHE_CONFIG, CACHE_EVENTS } = require('./cacheConfig');

const clientsService = require('../../../clientsService');
const produitsService = require('../../../produitsService');
const livraisonsService = require('../../../livraisonsService');

class CacheManager {
    static instance = null;
    static cacheState = {  // Ajout de l'initialisation
        lastRefresh: new Map(),
        errors: new Map()
    };

    constructor() {
        if (CacheManager.instance) {
            return CacheManager.instance;
        }

        // Obtenir l'instance de cacheStore
        this.cacheStore = require('./cacheStore');
        console.log('🔄 [cacheIndex] CacheManager: Instance de cacheStore obtenue');

        CacheManager.instance = this;
    }

    // Méthode pour accéder au cacheStore
    getCacheStore() {
        if (!this.cacheStore) {
            console.error('❌ [cacheIndex] CacheStore non initialisé dans CacheManager');
            return null;
        }
        return this.cacheStore;
    }

    // Méthode static pour accéder au cacheStore
    static getCacheStoreInstance() {
        if (!CacheManager.instance) {
            new CacheManager();
        }
        return CacheManager.instance.getCacheStore();
    }

    /**
     * Initialisation du cache
     */
    static async init() {
        if (!CacheManager.instance) {
            const instance = new CacheManager();
            await instance.initialize();
            return instance;
        }
        return CacheManager.instance;
    }

    async initialize() {
        try {
            console.log('🚀 [cacheIndex] Initialisation du CacheManager...');
    
            // Validation de la configuration
            console.log('🔄 [cacheIndex] Début validateConfig()');
            try {
                await this.validateConfig();
                console.log('✅ [cacheIndex] Fin validateConfig()');
            } catch (configError) {
                console.error('❌ [cacheIndex] Erreur dans validateConfig():', configError.message, configError.stack);
                throw configError; // Propager l'erreur
            }
    
            // Validation des services
            console.log('🔄 [cacheIndex] Début validateServices()');
            try {
                await this.validateServices();
                console.log('✅ [cacheIndex] Fin validateServices()');
            } catch (serviceError) {
                console.error('❌ [cacheIndex] Erreur dans validateServices():', serviceError.message, serviceError.stack);
                throw serviceError; // Propager l'erreur
            }
    
            // Initialisation des données
            console.log('🔄 [cacheIndex] Début initializeCache()');
            try {
                await this.initializeCache();
                console.log('✅ [cacheIndex] Fin initializeCache()');
            } catch (cacheError) {
                console.error('❌ [cacheIndex] Erreur dans initializeCache():', cacheError.message, cacheError.stack);
                throw cacheError; // Propager l'erreur
            }
    
            // Configuration des rafraîchissements automatiques
            console.log('🔄 [cacheIndex] Début setupAutoRefresh()');
            try {
                this.setupAutoRefresh();
                console.log('✅ [cacheIndex] Fin setupAutoRefresh()');
            } catch (autoRefreshError) {
                console.error('❌ [cacheIndex] Erreur dans setupAutoRefresh():', autoRefreshError.message, autoRefreshError.stack);
                throw autoRefreshError; // Propager l'erreur
            }
    
            console.log('✅ [cacheIndex] CacheManager initialisé avec succès');
        } catch (error) {
            console.error('❌ [cacheIndex] Erreur critique dans initialize():', {
                message: error.message,
                stack: error.stack,
                name: error.name
            });
            throw error; // Propager l'erreur pour gestion ultérieure
        }
    }

    validateConfig() {
        console.log('🔍 [cacheIndex] Validation de la configuration...');
        if (!CACHE_CONFIG.TYPES) {
            throw new Error('Configuration invalide: TYPES manquant');
        }
        console.log('✅ [cacheIndex] Configuration validée');
    }

    /**
     * Initialise le cache avec les données clients, produits et livraisons
     * - Vérifie et valide chaque type de données
     * - Optimise les données avant mise en cache
     * - Gère les erreurs spécifiquement pour chaque type
     * @returns {Promise<void>}
     */
    async initializeCache() {
        try {
            // Vérifier si le cache est déjà en cours d'initialisation
            if (this.isInitializing) {
                console.log('⏳ [cacheIndex] Initialisation déjà en cours, attente...');
                return;
            }
            this.isInitializing = true;

            console.log('🔄 [cacheIndex] Initialisation du cache...');

            // 1. CLIENTS
            try {
                console.log('🔍 [cacheIndex] Récupération des clients...');
                const clients = await clientsService.getClientsData();

                // Validation des données clients
                if (!clients?.length) {
                    throw new Error('Données clients invalides ou vides');
                }

                // Optimisation et mise en cache
                const optimizedClients = CacheUtils.optimizeClientsForSearch(clients);
                cacheStore.setData('clients', optimizedClients);
                console.log(`✅ [cacheIndex] Clients mis en cache: ${clients.length}`);
            } catch (clientError) {
                console.error('❌ Erreur initialisation clients:', clientError);
                throw new Error(`Échec initialisation clients: ${clientError.message}`);
            }

            // 2. PRODUITS
            try {
                console.log('🔍 [cacheIndex] Récupération des produits...');
                const products = await produitsService.getProduitsData();

                // Validation des données produits
                if (!products?.length) {
                    throw new Error('Données produits invalides ou vides');
                }

                // Optimisation et mise en cache
                const optimizedProducts = CacheUtils.optimizeProductsForSearch(products);
                cacheStore.setData('products', optimizedProducts);
                console.log(`✅ [cacheIndex] Produits mis en cache: ${products.length}`);
            } catch (productError) {
                console.error('❌ Erreur initialisation produits:', productError);
                throw new Error(`Échec initialisation produits: ${productError.message}`);
            }

            // 4. VÉRIFICATION FINALE
            try {
                await this.verifyCacheState();
                const cacheState = {
                    clients: cacheStore.getData('clients')?.byId ? Object.keys(cacheStore.getData('clients').byId).length : 0,
                    products: cacheStore.getData('products')?.byId ? Object.keys(cacheStore.getData('products').byId).length : 0,
                    deliveries: cacheStore.getData('deliveries')?.byId ? Object.keys(cacheStore.getData('deliveries').byId).length : 0
                };
                console.log('📊 [cacheIndex] État final du cache:', cacheState);
                console.log('✅ [cacheIndex] Cache initialisé avec succès');
            } catch (verifyError) {
                console.error('❌ [cacheIndex] Erreur vérification état du cache:', verifyError);
                throw verifyError;
            }

        } catch (error) {
            console.error('❌ [cacheIndex] Erreur critique initialisation cache:', {
                message: error.message,
                stack: error.stack,
                type: error.name
            });
            throw error;
        } finally {
            this.isInitializing = false;
        }
    }

    verifyCacheState() {
        const cacheState = {
            clients: cacheStore.getData('clients'),
            products: cacheStore.getData('products'),
        };

        console.log('📊 État du cache:', {
            clients: cacheState.clients?.byId ? Object.keys(cacheState.clients.byId).length : 0,
            products: cacheState.products?.byId ? Object.keys(cacheState.products.byId).length : 0
        });
    }

    setupAutoRefresh() {
        // Ne rien faire car plus besoin de rafraîchissement automatique
        console.log('✅ [cacheIndex] Cache configuré pour rafraîchissement sur événements uniquement');
    }


    async validateServices() {
        console.log('🔍 [cacheIndex] Validation des services...');

        const services = {
            clients: clientsService,
            produits: produitsService,
            livraisons: livraisonsService
        };

        for (const [name, service] of Object.entries(services)) {
            if (!service) {
                throw new Error(`Service ${name} non initialisé`);
            }
        }

        console.log('✅ Services validés');
    }

async verifyCacheIntegrity(type) {
    try {
        console.log(`🔍 [cacheIndex] Début vérification intégrité pour ${type}`);
        const cache = cacheStore.getData(type);
        console.log(`📊 [cacheIndex] Données en cache pour ${type}:`, {
            hasData: !!cache,
            structure: cache ? Object.keys(cache) : [],
            size: cache?.byId ? Object.keys(cache.byId).length : 0
        });

        const issues = CacheUtils.verifyCacheIntegrity(cache, type);
        
        if (issues.length > 0) {
            console.error(`❌ [cacheIndex] Problèmes d'intégrité détectés pour ${type}:`, issues);
            return false;
        }

        console.log(`✅ [cacheIndex] Intégrité vérifiée pour ${type}`);
        return true;
    } catch (error) {
        console.error(`❌ [cacheIndex] Erreur vérification intégrité ${type}:`, error);
        return false;
    }
}

    // Point d'accès unique à l'instance
    static getInstance() {
        if (!CacheManager.instance) {
            CacheManager.instance = new CacheManager();
        }
        return CacheManager.instance;
    }

    // Obtenir l'état du cache
    getCacheStatus() {
        return {
            clientsLoaded: this.cacheStore.getData('clients') !== undefined,
            productsLoaded: this.cacheStore.getData('products') !== undefined,
            deliveriesLoaded: this.cacheStore.getData('deliveries') !== undefined,
            lastRefresh: Object.fromEntries(CacheManager.cacheState.lastRefresh),
            errors: Object.fromEntries(CacheManager.cacheState.errors)
        };
    }
}

// Export du CacheManager
module.exports = CacheManager;