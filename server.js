// server.js

// ===== 1. IMPORTS ET CONFIGURATION =====
require('dotenv').config(); // Charge les variables d'environnement
const express = require('express');
const cors = require('cors');
// Import des services pour l'accès aux données Google Sheets
const { produitsService, livraisonsService } = require('./Services/googleSheetsService');
// Import du gestionnaire de cache pour optimiser les performances
const CacheManager = require('./Services/claude/core/cacheManager/cacheIndex');

// Création de l'application Express
const app = express();
const PORT = process.env.PORT || 3000;

// ===== 2. IMPORT DES ROUTERS =====
// Chaque router gère un type spécifique de données dans Google Sheets
const clientsRouter = require('./routes/clients');
const produitsRouter = require('./routes/produits');
const livraisonsRouter = require('./routes/livraisons');
const commandesRouter = require('./routes/commandes');
const detailsCommandesRouter = require('./routes/detailscommandes');
const detailsLivraisonsRouter = require('./routes/detailslivraisons');
const chatRouter = require('./routes/chat');

// ===== 3. MIDDLEWARE GÉNÉRAUX =====
// Configuration CORS pour la sécurité des requêtes cross-origin
app.use(cors({
    origin: ['http://localhost:3001', 'http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json()); // Parse les requêtes JSON

// ===== 4. INITIALISATION DU CACHE =====
async function initializeCache() {
    try {
        console.log('🔄 (server) Initialisation du cache...');
        console.log('🔍 (server) Avant CacheManager.init()');
        const cacheManager = await CacheManager.init();
        console.log('✅ (server) Après CacheManager.init()');
        
        if (!cacheManager) {
            throw new Error('Échec d\'initialisation du CacheManager');
        }

        const cacheStore = cacheManager.getCacheStore();
        if (!cacheStore) {
            throw new Error('CacheStore non disponible');
        }

        const cacheState = cacheManager.getCacheStatus();
        if (!cacheState) {
            throw new Error('Impossible de récupérer l\'état du cache');
        }

        console.log('📊 État du cache après initialisation:', {
            clients: cacheState.clientsLoaded ? Object.keys(cacheStore.getData('clients')?.byId || {}).length : 0,
            products: cacheState.productsLoaded ? Object.keys(cacheStore.getData('products')?.byId || {}).length : 0,
            deliveries: cacheState.deliveriesLoaded ? Object.keys(cacheStore.getData('deliveries')?.byId || {}).length : 0
        });

        return cacheManager;
    } catch (error) {
        console.error('❌ Erreur initialisation cache:', {
            message: error.message || 'Erreur inconnue',
            stack: error.stack,
            name: error.name
        });
        throw error; // Propager l'erreur pour la gestion en amont
    }
}

// ===== 5. CONFIGURATION DES ROUTES =====
async function startServer() {
    try {
        // Initialisation du cache AVANT d'enregistrer les routes
        await initializeCache();

        // Configuration des routes après l'initialisation du cache
        app.use('/api/clients', clientsRouter);
        app.use('/api/produits', produitsRouter);
        app.use('/api/livraisons', livraisonsRouter);
        app.use('/api/commandes', commandesRouter);
        app.use('/api/detailscommandes', detailsCommandesRouter);
        app.use('/api/detailslivraisons', detailsLivraisonsRouter);
        app.use('/api/chat', chatRouter);

        // Démarrage du serveur après toutes les configurations
        app.listen(PORT, () => {
            console.log(`🚀 Serveur démarré sur le port ${PORT}`);
            console.log('\n📋 Routes disponibles :');
            console.log('- /api/clients          : Gestion des clients');
            console.log('- /api/produits         : Gestion des produits');
            console.log('- /api/livraisons       : Gestion des livraisons');
            console.log('- /api/commandes        : Gestion des commandes');
            console.log('- /api/detailscommandes : Détails des commandes');
            console.log('- /api/detailslivraisons: Détails des livraisons');
            console.log('- /api/chat             : Interface de chat\n');
        });

    } catch (error) {
        console.error('❌ Erreur critique lors du démarrage du serveur:', error);
        process.exit(1); // Arrêt du processus en cas d'erreur
    }
}

// ===== 6. LANCEMENT DU SERVEUR =====
startServer();

module.exports = app;