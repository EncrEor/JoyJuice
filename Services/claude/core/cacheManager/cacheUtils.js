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

}

module.exports = CacheUtils;