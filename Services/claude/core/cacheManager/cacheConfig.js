// Services/claude/core/cacheManager/cacheConfig.js

/**
 * Configuration du système de cache
 * Définit le comportement du cache pour chaque type de données
 */

const CACHE_CONFIG = {
    // Configuration par type de données
    TYPES: {
        CLIENTS: {
            isStatic: true,           // Données rarement modifiées
            refreshOnChange: true,     // Mise à jour uniquement sur modification
            TTL: null,                 // Pas d'expiration automatique
            invalidationEvents: [      // Événements déclenchant une mise à jour
                'CLIENT_ADDED',
                'CLIENT_UPDATED',
                'CLIENT_DELETED'
            ]
        },
        PRODUCTS: {
            isStatic: true,
            refreshOnChange: true,
            TTL: null,
            invalidationEvents: [
                'PRODUCT_ADDED',
                'PRODUCT_UPDATED',
                'PRODUCT_DELETED'
            ]
        },
        DELIVERIES: {
            isStatic: false,          // Données dynamiques
            refreshInterval: 120 * 60 * 1000,  // Rafraîchissement toutes les 120 minutes
            TTL: 120 * 60,             // TTL de 120 minutes
            invalidationEvents: [
                'DELIVERY_ADDED',
                'DELIVERY_UPDATED',
                'DELIVERY_DELETED'
            ]
        }
    },

    // Configuration des retries en cas d'erreur
    RETRY: {
        MAX_ATTEMPTS: 3,
        DELAY: 2000,
        BACKOFF_FACTOR: 2
    },

    // Mapping des types d'événements
    EVENT_MAPPING: {
        'CLIENT_ADDED': 'CLIENT_ADDED',
        'CLIENT_UPDATED': 'CLIENT_UPDATED',
        'CLIENT_DELETED': 'CLIENT_DELETED',
        'PRODUCT_ADDED': 'PRODUCT_ADDED',
        'PRODUCT_UPDATED': 'PRODUCT_UPDATED',
        'PRODUCT_DELETED': 'PRODUCT_DELETED',
        'LIVRAISON_ADDED': 'DELIVERY_ADDED',
        'LIVRAISON_UPDATED': 'DELIVERY_UPDATED',
        'LIVRAISON_DELETED': 'DELIVERY_DELETED',
        'NEW_DAY': 'DAILY_RESET',
        'CACHE_RESET': 'CACHE_RESET'
    }
};

// Événements système du cache
const CACHE_EVENTS = [
    'beforeRefresh',
    'afterRefresh', 
    'error',
    'stateChange'
];

module.exports = {
    CACHE_CONFIG,
    CACHE_EVENTS
};