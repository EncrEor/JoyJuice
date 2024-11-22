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

// ===== 4. MIDDLEWARE DE LOGGING =====
// Log toutes les requêtes pour le debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
    next();
});

// ===== 5. CONFIGURATION DES ROUTES =====
app.use('/api/clients', clientsRouter);
app.use('/api/produits', produitsRouter);
app.use('/api/livraisons', livraisonsRouter);
app.use('/api/commandes', commandesRouter);
app.use('/api/detailscommandes', detailsCommandesRouter);
app.use('/api/detailslivraisons', detailsLivraisonsRouter);
app.use('/api/chat', chatRouter);

// ===== 6. INITIALISATION DU CACHE =====
async function initializeCache() {
    try {
        const cacheManager = await CacheManager.init();
        const cacheState = cacheManager.getCacheStatus();
        console.log('📊 État du cache après initialisation:', {
            clients: cacheState.clients?.length || 0,
            products: cacheState.products?.length || 0,
            deliveries: cacheState.deliveries?.length || 0
        });
    } catch (error) {
        console.error('❌ Erreur initialisation cache:', error);
    }
}

// ===== 7. GESTION DES ERREURS GOOGLE SHEETS =====
// Middleware pour gérer les erreurs d'API Google Sheets
app.use((err, req, res, next) => {
    if (err.code === 'ECONNREFUSED') {
        console.error('❌ Erreur de connexion à Google Sheets:', err);
        return res.status(503).json({
            success: false,
            error: 'Service Google Sheets temporairement indisponible'
        });
    }
    
    if (err.code === 'GOOGLE_SHEETS_API_ERROR') {
        console.error('❌ Erreur API Google Sheets:', err);
        return res.status(500).json({
            success: false,
            error: 'Erreur lors de l\'accès aux données',
            details: err.message
        });
    }

    // Autres erreurs
    console.error('❌ Erreur serveur:', err);
    res.status(500).json({
        success: false,
        error: 'Erreur serveur interne'
    });
});

// ===== 8. DÉMARRAGE DU SERVEUR =====
app.listen(PORT, async () => {
    console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    console.log('\n📋 Routes disponibles :');
    console.log('- /api/clients          : Gestion des clients');
    console.log('- /api/produits         : Gestion des produits');
    console.log('- /api/livraisons       : Gestion des livraisons');
    console.log('- /api/commandes        : Gestion des commandes');
    console.log('- /api/detailscommandes : Détails des commandes');
    console.log('- /api/detailslivraisons: Détails des livraisons');
    console.log('- /api/chat             : Interface de chat\n');
    
    // Initialisation du cache au démarrage
    console.log('🔄 Initialisation du cache...');
    await initializeCache();
});

module.exports = app;