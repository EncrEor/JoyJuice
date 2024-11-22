const { CACHE_EVENTS } = require('./cacheConfig');
const NodeCache = require('node-cache');

class CacheEventManager {
    constructor() {
        // Map pour stocker les écouteurs d'événements
        this.events = new Map();
        
        // État des événements
        this.state = {
            lastEvent: null,
            eventCount: new Map(),
            errors: new Map()
        };

        // Initialisation des écouteurs
        this.initializeEvents();
    }

    initializeEvents() {
        console.log("🔧 Initialisation du gestionnaire d'événements du cache");
        CACHE_EVENTS.forEach(eventType => {
            this.events.set(eventType, new Set());
            this.state.eventCount.set(eventType, 0);
        });
        console.log("✅ Gestionnaire d'événements initialisé");
    }

    on(eventType, listener) {
        if (!this.events.has(eventType)) {
            console.warn(`⚠️ Type d'événement non reconnu: ${eventType}`);
            return () => {}; // Retourner une fonction de nettoyage vide
        }

        console.log(`📝 Ajout d'un écouteur pour l'événement: ${eventType}`);
        const listeners = this.events.get(eventType);
        listeners.add(listener);

        // Retourner une fonction pour supprimer l'écouteur
        return () => {
            listeners.delete(listener);
            console.log(`🗑️ Écouteur supprimé pour l'événement: ${eventType}`);
        };
    }

    async emit(eventType, data) {
        try {
            if (!this.events.has(eventType)) {
                throw new Error(`Événement non reconnu: ${eventType}`);
            }

            const listeners = this.events.get(eventType);
            for (const listener of listeners) {
                try {
                    await listener(data);
                } catch (error) {
                    this.handleError(eventType, error);
                }
            }
        } catch (error) {
            this.handleError(eventType, error);
        }
    }

    handleError(type, error) {
        const errorMessage = error?.message || 'Une erreur inconnue est survenue';
        const errorDetails = {
            type,
            message: errorMessage,
            timestamp: new Date().toISOString(),
            stack: error?.stack
        };
        
        console.error(`❌ Erreur (${type}):`, errorDetails);
        this.emit('error', errorDetails);
    }

    handleListenerError(eventType, error) {
        if (!this.state.errors.has(eventType)) {
            this.state.errors.set(eventType, []);
        }
        
        const errors = this.state.errors.get(eventType);
        errors.push({
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack
        });

        // Garder seulement les 10 dernières erreurs
        if (errors.length > 10) {
            errors.shift();
        }
    }

    getEventStats() {
        return {
            lastEvent: this.state.lastEvent,
            counts: Object.fromEntries(this.state.eventCount),
            activeListeners: Object.fromEntries(
                Array.from(this.events.entries())
                    .map(([type, listeners]) => [type, listeners.size])
            ),
            errors: Object.fromEntries(this.state.errors)
        };
    }

    clearEventStats() {
        this.state.lastEvent = null;
        this.state.eventCount.clear();
        this.state.errors.clear();
        CACHE_EVENTS.forEach(eventType => {
            this.state.eventCount.set(eventType, 0);
        });
        console.log("🧹 Statistiques des événements réinitialisées");
    }
}

// Export d'une instance unique
const eventManager = new CacheEventManager();
module.exports = eventManager;