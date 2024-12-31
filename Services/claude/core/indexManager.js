// Services/claude/indexManager.js
const NodeCache = require('node-cache');
const clientsService = require('../../../Services/clientsService');
const produitsService = require('../../../Services/produitsService');
const livraisonsService = require('../../../Services/livraisonsService');
const clientLookupService = require('../../clientLookupService');
const cacheManager = require('./cacheManager/cacheIndex');
const eventManager = require('./cacheManager/eventManager');
const StringUtils = require('../utils/stringUtils');

class IndexManager {
    static instance = null;
    static isTestMode = false;
    static testData = null;
    static indexes = {
        byZoneAndProduct: new Map(),
        byDeliveryTime: new Map(),
        byFrequency: new Map(),
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
            console.log('📊 Initialisation des index...');
            // Attendre l'initialisation du CacheManager
            await cacheManager.init();
            await this.refreshIndexes();
            console.log('✅ Index initialisés avec succès');
        } catch (error) {
            console.error('❌ Erreur initialisation des index:', error);
            throw error;
        }
    }

    async refreshIndexes(retryCount = 0, maxRetries = 3) {
        try {
            console.log(`🔄 Tentative de rafraîchissement des index (essai ${retryCount + 1}/${maxRetries + 1})`);
            
            // Récupérer l'instance du CacheManager et accéder au store
            const cache = cacheManager.getInstance();
            console.log('📦 CacheManager récupéré:', !!cache);
            
            const cacheStore = cache.cacheStore;
            if (!cacheStore) {
                console.warn('⚠️ CacheStore non disponible');
                if (retryCount < maxRetries) {
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 5000);
                    console.log(`⏳ Nouvelle tentative dans ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return this.refreshIndexes(retryCount + 1, maxRetries);
                }
                throw new Error('CacheStore non disponible après plusieurs tentatives');
            }
    
            // Récupération des données avec logs
            console.log('📥 Récupération des données du cache...');
            const clients = cacheStore.getData('clients');
            const deliveries = cacheStore.getData('deliveries');
    
            // Vérification des données
            if (!clients || !deliveries) {
                console.warn('⚠️ Données nécessaires non disponibles dans le cache:', {
                    clientsPresent: !!clients,
                    deliveriesPresent: !!deliveries
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
            
            console.log('📊 Construction index zone/produit...');
            this.buildZoneProductIndex(clients.byId ? Object.values(clients.byId) : []);
            
            console.log('📊 Construction index créneaux horaires...');
            this.buildTimeSlotIndex(clients.byId ? Object.values(clients.byId) : []);
            
            console.log('📊 Construction index fréquence...');
            this.buildFrequencyIndex(deliveries.byId ? Object.values(deliveries.byId) : []);
            
            console.log('📊 Construction index routes...');
            this.buildRouteIndex(clients.byId ? Object.values(clients.byId) : []);
    
            console.log('✅ Index mis à jour avec succès');
        } catch (error) {
            console.error('❌ Erreur rafraîchissement des index:', error);
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

    buildFrequencyIndex(deliveries) {
        IndexManager.indexes.byFrequency.clear();
        // Grouper les livraisons par client et calculer la fréquence
        const frequencyMap = new Map();

        deliveries.forEach(delivery => {
            if (!frequencyMap.has(delivery.ID_Client)) {
                frequencyMap.set(delivery.ID_Client, {
                    count: 0,
                    lastDelivery: null
                });
            }

            const clientStats = frequencyMap.get(delivery.ID_Client);
            clientStats.count++;

            if (!clientStats.lastDelivery ||
                new Date(delivery.Date_Livraison) > new Date(clientStats.lastDelivery)) {
                clientStats.lastDelivery = delivery.Date_Livraison;
            }
        });

        // Convertir en index de fréquence
        frequencyMap.forEach((stats, clientId) => {
            const frequency = this.calculateFrequency(stats);
            if (!IndexManager.indexes.byFrequency.has(frequency)) {
                IndexManager.indexes.byFrequency.set(frequency, new Set());
            }
            IndexManager.indexes.byFrequency.get(frequency).add(clientId);
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
            console.log('🔍 Recherche client:', clientData);
    
            // Recherche via clientLookupService
            const result = await clientLookupService.findClientByNameAndZone(
                clientData.nom || clientData,
                clientData.zone
            );
    
            // Retourner le résultat direct car déjà formaté correctement
            return result;
    
        } catch (error) {
            console.error('❌ Erreur recherche client:', error);
            return {
                status: 'error',
                message: error.message
            };
        }
    }

    // Ajouter cette nouvelle méthode pour les statistiques produits
    async calculateProductFrequency(productId, deliveries = []) {
        try {
            const stats = {
                dailyCount: new Map(),
                weeklyTotal: 0,
                averageQuantity: 0,
                totalQuantity: 0
            };

            // Si aucune livraison fournie, utiliser les données du cache
            if (deliveries.length === 0) {
                deliveries = await this.fetchDeliveries() || [];
            }

            let totalDays = 0;

            // Vérifier que les livraisons existent et ont des produits
            deliveries.forEach(delivery => {
                if (delivery && delivery.produits && Array.isArray(delivery.produits)) {
                    const produit = delivery.produits.find(p => p.id === productId);
                    if (produit) {
                        const date = new Date(delivery.Date_Livraison).toISOString().split('T')[0];
                        stats.dailyCount.set(date, (stats.dailyCount.get(date) || 0) + 1);
                        stats.totalQuantity += produit.quantity || 0;
                        totalDays++;
                    }
                }
            });

            // Calculer les moyennes
            stats.weeklyTotal = Math.ceil((stats.dailyCount.size / 7) * 7) || 0;
            stats.averageQuantity = totalDays > 0 ? stats.totalQuantity / totalDays : 0;

            return {
                frequency: this.getProductFrequencyCategory(stats.weeklyTotal),
                stats: stats
            };
        } catch (error) {
            console.error('Erreur calcul fréquence produit:', error);
            return {
                frequency: 'unknown',
                stats: {
                    dailyCount: new Map(),
                    weeklyTotal: 0,
                    averageQuantity: 0,
                    totalQuantity: 0
                }
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

    getClientsByFrequency(frequency) {
        return Array.from(IndexManager.indexes.byFrequency.get(frequency) || []);
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
            console.error('Erreur lors de la récupération des clients:', error);
            return [];
        }
    }

    async fetchDeliveries() {
        try {
            return await livraisonsService.getLivraisonsDataCurrentMonth();
        } catch (error) {
            console.error('Erreur lors de la récupération des livraisons:', error);
            return [];
        }
    }

    // Pour les tests uniquement
    async mockFetchData(mockClients, mockDeliveries) {
        this.fetchClients = async () => mockClients;
        this.fetchDeliveries = async () => mockDeliveries;
    }
}


module.exports = new IndexManager();
module.exports.IndexManager = IndexManager;