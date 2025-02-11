// Services/claude/indexManager.js
//const NodeCache = require('node-cache');
const clientsService = require('../../../Services/clientsService');
//const produitsService = require('../../../Services/produitsService');
const clientLookupService = require('../../clientLookupService');
const cacheManager = require('./cacheManager/cacheIndex');
//const eventManager = require('./cacheManager/eventManager');
//const StringUtils = require('../utils/stringUtils');

class IndexManager {
    static instance = null;
    static isTestMode = false;
    static testData = null;
    static indexes = {
        byZoneAndProduct: new Map(),
        byDeliveryTime: new Map(),
        byRoute: new Map()
    };

    constructor() {
        if (!IndexManager.instance) {
            this.initialize();
            IndexManager.instance = this;
        }
        return IndexManager.instance;
    }

    async initialize() {
        try {
            console.log('📊 [indexManager] Initialisation des index...');
            // Attendre l'initialisation du CacheManager
            await cacheManager.init();
            await this.refreshIndexes();
            console.log('✅ [indexManager] Index initialisés avec succès');
        } catch (error) {
            console.error('❌ Erreur initialisation des index:', error);
            throw error;
        }
    }

    async refreshIndexes(retryCount = 0, maxRetries = 3) {
        try {
            console.log(`🔄 [indexManager] Tentative de rafraîchissement des index (essai ${retryCount + 1}/${maxRetries + 1})`);
            
            // Récupérer l'instance du CacheManager et accéder au store
            const cache = cacheManager.getInstance();
            console.log('📦 [indexManager] CacheManager récupéré:', !!cache);
            
            const cacheStore = cache.cacheStore;
            if (!cacheStore) {
                console.warn('⚠️ [indexManager] CacheStore non disponible');
                if (retryCount < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                    console.log(`⏳ Nouvelle tentative dans ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.refreshIndexes(retryCount + 1, maxRetries);
                }
                throw new Error('CacheStore non disponible après plusieurs tentatives');
            }
    
            // Récupération des données avec logs
            console.log('📥 [indexManager] Récupération des données du cache...');
            const clients = cacheStore.getData('clients');
    
            // Vérification des données
            if (!clients) {
                console.warn('⚠️ Données nécessaires non disponibles dans le cache:', {
                    clientsPresent: !!clients
                });
                if (retryCount < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                    console.log(`⏳ Nouvelle tentative dans ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.refreshIndexes(retryCount + 1, maxRetries);
                }
                throw new Error('Données nécessaires non disponibles après plusieurs tentatives');
            }
    
            // Construction des index avec logs
            console.log('🏗️ Construction des index...');
            
            console.log('📊 [indexManager] Construction index zone/produit...');
            this.buildZoneProductIndex(clients.byId ? Object.values(clients.byId) : []);
            
            console.log('📊 [indexManager] Construction index créneaux horaires...');
            this.buildTimeSlotIndex(clients.byId ? Object.values(clients.byId) : []);
            
            console.log('📊 [indexManager] Construction index routes...');
            this.buildRouteIndex(clients.byId ? Object.values(clients.byId) : []);
    
            console.log('✅ [indexManager] Index mis à jour avec succès');
        } catch (error) {
            console.error('❌ [indexManager] Erreur rafraîchissement des index:', error);
            throw error;
        }
    }

    buildZoneProductIndex(clients) {
        IndexManager.indexes.byZoneAndProduct.clear();
        clients.forEach(client => {
            if (client.zone && client.produitsFrequents) {
                client.produitsFrequents.forEach(produit => {
                    const key = `${client.zone}-${produit}`;
                    if (!IndexManager.indexes.byZoneAndProduct.has(key)) {
                        IndexManager.indexes.byZoneAndProduct.set(key, new Set());
                    }
                    IndexManager.indexes.byZoneAndProduct.get(key).add(client.ID_Client);
                });
            }
        });
    }

    buildTimeSlotIndex(clients) {
        IndexManager.indexes.byDeliveryTime.clear();
        clients.forEach(client => {
            if (client.heurePreferee) {
                const timeSlot = this.getTimeSlot(client.heurePreferee);
                if (!IndexManager.indexes.byDeliveryTime.has(timeSlot)) {
                    IndexManager.indexes.byDeliveryTime.set(timeSlot, new Set());
                }
                IndexManager.indexes.byDeliveryTime.get(timeSlot).add(client.ID_Client);
            }
        });
    }

    buildRouteIndex(clients) {
        IndexManager.indexes.byRoute.clear();
        // Grouper les clients par zone pour optimiser les routes
        clients.forEach(client => {
            if (client.zone) {
                if (!IndexManager.indexes.byRoute.has(client.zone)) {
                    IndexManager.indexes.byRoute.set(client.zone, new Set());
                }
                IndexManager.indexes.byRoute.get(client.zone).add({
                    id: client.ID_Client,
                    nom: client.Nom_Client,
                    adresse: client.Adresse,
                    heurePreferee: client.heurePreferee
                });
            }
        });
    }

    // Méthodes utilitaires
    getTimeSlot(time) {
        const hour = parseInt(time.split(':')[0]);
        if (hour < 10) return 'early-morning';
        if (hour < 12) return 'morning';
        if (hour < 14) return 'lunch';
        return 'afternoon';
    }

    calculateFrequency(stats) {
        try {
            // Calculer les livraisons par semaine (sur le mois)
            const livraisonsParSemaine = stats.count / 4;

            // Catégories de fréquence ajustées
            if (livraisonsParSemaine >= 3) {
                return 'very-frequent';     // 12+ livraisons par mois (3+ par semaine)
            }
            if (livraisonsParSemaine >= 2) {
                return 'frequent';          // 8-11 livraisons par mois (2+ par semaine)
            }
            if (livraisonsParSemaine >= 1) {
                return 'regular';           // 4-7 livraisons par mois (1+ par semaine)
            }
            if (stats.count >= 2) {
                return 'occasional';        // 2-3 livraisons par mois
            }
            return 'rare';                 // 1 livraison par mois ou moins
        } catch (error) {
            console.error('Erreur calcul fréquence:', error);
            return 'unknown';
        }
    }

    async getClientInfo(clientData) {
        try {
            console.log('🔍 [indexManager] Recherche client:', clientData);
    
            // Recherche via clientLookupService
            const result = await clientLookupService.findClientByNameAndZone(
                clientData.nom || clientData,
                clientData.zone
            );
    
            // Retourner le résultat direct car déjà formaté correctement
            return result;
    
        } catch (error) {
            console.error('❌ [indexManager] Erreur recherche client:', error);
            return {
                status: 'error',
                message: error.message
            };
        }
    }

    getProductFrequencyCategory(weeklyTotal) {
        if (weeklyTotal >= 15) return 'high-volume';      // 15+ commandes par semaine
        if (weeklyTotal >= 8) return 'medium-volume';     // 8-14 commandes par semaine
        if (weeklyTotal >= 4) return 'regular-volume';    // 4-7 commandes par semaine
        if (weeklyTotal >= 1) return 'low-volume';        // 1-3 commandes par semaine
        return 'sporadic';                                // Moins d'une commande par semaine
    }

    // Méthodes d'accès aux index
    getClientsByZoneAndProduct(zone, product) {
        const key = `${zone}-${product}`;
        return Array.from(IndexManager.indexes.byZoneAndProduct.get(key) || []);
    }

    getClientsByTimeSlot(timeSlot) {
        return Array.from(IndexManager.indexes.byDeliveryTime.get(timeSlot) || []);
    }

    getSuggestedRoute(zone) {
        const clients = IndexManager.indexes.byRoute.get(zone);
        if (!clients) return [];

        // Trier par heure préférée
        return Array.from(clients).sort((a, b) => {
            if (!a.heurePreferee) return 1;
            if (!b.heurePreferee) return -1;
            return a.heurePreferee.localeCompare(b.heurePreferee);
        });
    }

    // Méthodes pour les tests et la maintenance
    getIndexStats() {
        return {
            zoneProductCount: IndexManager.indexes.byZoneAndProduct.size,
            timeSlotCount: IndexManager.indexes.byDeliveryTime.size,
            frequencyCount: IndexManager.indexes.byFrequency.size,
            routeCount: IndexManager.indexes.byRoute.size,
            lastUpdate: IndexManager.indexCache.get('lastUpdate')
        };
    }

    async fetchClients() {
        try {
            return await clientsService.getClientsData();
        } catch (error) {
            console.error('[indexManager] Erreur lors de la récupération des clients:', error);
            return [];
        }
    }

    // Pour les tests uniquement
    async mockFetchData(mockClients) {
        this.fetchClients = async () => mockClients;
    }
}


module.exports = new IndexManager();
module.exports.IndexManager = IndexManager;