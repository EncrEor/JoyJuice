//cacheManager/cacheUtils.js

const StringUtils = require('../../utils/stringUtils');

/**
 * Utilitaires pour la gestion du cache
 */
class CacheUtils {
    // Fonctions d'optimisation des données pour la recherche
    static optimizeClientsForSearch(clients) {
        const optimized = {
            byId: {},
            byName: {},
            byZone: {}
        };

        if (!Array.isArray(clients)) {
            console.warn('⚠️ Format clients invalide pour l\'optimisation');
            return optimized;
        }

        clients.forEach(client => {
            if (client?.ID_Client) {
                // Regroupement par ID
                optimized.byId[client.ID_Client] = client;

                // Regroupement par nom normalisé
                if (client.Nom_Client) {
                    const normalizedName = StringUtils.normalizeString(client.Nom_Client);
                    if (!optimized.byName[normalizedName]) {
                        optimized.byName[normalizedName] = [];
                    }
                    optimized.byName[normalizedName].push(client);
                }

                // Regroupement par zone
                if (client.zone) {
                    const zoneKey = client.zone.toLowerCase();
                    if (!optimized.byZone[zoneKey]) {
                        optimized.byZone[zoneKey] = [];
                    }
                    optimized.byZone[zoneKey].push(client);
                }
            }
        });

        return optimized;
    }

    static optimizeProductsForSearch(products) {
        const optimized = {
            byId: {},
            byName: {},
            byType: {}
        };

        if (!Array.isArray(products)) {
            console.warn('⚠️ Format produits invalide pour l\'optimisation');
            return optimized;
        }

        products.forEach(product => {
            if (product?.ID_Produit) {
                optimized.byId[product.ID_Produit] = product;

                if (product.Nom_Produit) {
                    const normalizedName = StringUtils.normalizeString(product.Nom_Produit);
                    optimized.byName[normalizedName] = product;

                    const type = product.Nom_Produit.split(' ')[0].toLowerCase();
                    if (!optimized.byType[type]) {
                        optimized.byType[type] = [];
                    }
                    optimized.byType[type].push(product);
                }
            }
        });

        return optimized;
    }

    static optimizeLivraisonsForSearch(livraisons) {
        try {
            console.log('🔄 Optimisation des livraisons pour le cache...');
            
            // Validation de l'entrée
            if (!Array.isArray(livraisons)) {
                console.warn('⚠️ Format livraisons invalide - Initialisation structure vide');
                return { byId: {}, byClient: {}, byStatus: {} };
            }
    
            const optimized = {
                byId: {},
                byClient: {},
                byStatus: {}
            };
    
            // Log initial
            console.log(`📊 Traitement de ${livraisons.length} livraisons`);
    
            livraisons.forEach(livraison => {
                if (!livraison?.ID_Livraison) return;
    
                // Indexation par ID
                optimized.byId[livraison.ID_Livraison] = livraison;
    
                // Indexation par client
                if (livraison.ID_Client) {
                    if (!optimized.byClient[livraison.ID_Client]) {
                        optimized.byClient[livraison.ID_Client] = [];
                    }
                    optimized.byClient[livraison.ID_Client].push(livraison);
                }
    
                // Indexation par statut
                const status = livraison.Statut_L || 'inconnu';
                if (!optimized.byStatus[status]) {
                    optimized.byStatus[status] = [];
                }
                optimized.byStatus[status].push(livraison);
            });
    
            // Log des résultats
            console.log('📊 Structure optimisée créée:', {
                totalIds: Object.keys(optimized.byId).length,
                totalClients: Object.keys(optimized.byClient).length,
                totalStatuts: Object.keys(optimized.byStatus).length
            });
    
            return optimized;
        } catch (error) {
            console.error('❌ Erreur lors de l\'optimisation des livraisons:', error);
            return { byId: {}, byClient: {}, byStatus: {} };
        }
    }

    // Vérification de l'intégrité du cache
    static verifyCacheIntegrity(cache, type) {
        const issues = [];

        if (!cache) {
            issues.push(`Cache ${type} manquant`);
            return issues;
        }

        switch (type) {
            case 'clients':
                issues.push(...this.verifyClientsIntegrity(cache));
                break;
            case 'products':
                issues.push(...this.verifyProductsIntegrity(cache));
                break;
            case 'deliveries':
                issues.push(...this.verifyLivraisonsIntegrity(cache));
                break;
        }

        return issues;
    }

    static verifyClientsIntegrity(cache) {
        const issues = [];
        Object.entries(cache.byId).forEach(([id, client]) => {
            // Vérifier la cohérence des index
            const normalizedName = StringUtils.normalizeString(client.Nom_Client);
            if (!cache.byName[normalizedName]?.some(c => c.ID_Client === id)) {
                issues.push(`Index nom manquant pour le client ${id}`);
            }

            if (client.zone && !cache.byZone[client.zone.toLowerCase()]?.some(c => c.ID_Client === id)) {
                issues.push(`Index zone manquant pour le client ${id}`);
            }
        });
        return issues;
    }

    static verifyProductsIntegrity(cache) {
        const issues = [];
        Object.entries(cache.byId).forEach(([id, product]) => {
            const normalizedName = StringUtils.normalizeString(product.Nom_Produit);
            if (cache.byName[normalizedName]?.ID_Produit !== id) {
                issues.push(`Index nom incorrect pour le produit ${id}`);
            }

            const type = product.Nom_Produit.split(' ')[0].toLowerCase();
            if (!cache.byType[type]?.some(p => p.ID_Produit === id)) {
                issues.push(`Index type manquant pour le produit ${id}`);
            }
        });
        return issues;
    }

    static verifyLivraisonsIntegrity(cache) {
        const issues = [];
        Object.entries(cache.byId).forEach(([id, livraison]) => {
            if (livraison.ID_Client && 
                !cache.byClient[livraison.ID_Client]?.some(l => l.ID_Livraison === id)) {
                issues.push(`Index client manquant pour la livraison ${id}`);
            }

            const status = livraison.Statut_L || 'inconnu';
            if (!cache.byStatus[status]?.some(l => l.ID_Livraison === id)) {
                issues.push(`Index statut manquant pour la livraison ${id}`);
            }
        });
        return issues;
    }
}

module.exports = CacheUtils;