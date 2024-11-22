const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

// Authentification avec le compte de service
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,  // Fichier JSON du compte de service
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],  // Scope pour accéder aux Google Sheets
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;  // ID de la feuille Google Sheets

// Centraliser tous les services spécifiques (importation des services)
const clientsService = require('./clientsService');
const livraisonsService = require('./livraisonsService');
const commandesService = require('./commandesService');
const detailsLivraisonsService = require('./detailsLivraisonsService');
const detailsCommandesService = require('./detailsCommandesService');
const produitsService = require('./produitsService');

// Exporter les services pour être utilisés dans les routes
module.exports = {
  clientsService,
  livraisonsService,
  commandesService,
  detailsLivraisonsService,
  detailsCommandesService,
  produitsService,
  sheets,  // Export du client Google Sheets pour d'autres opérations éventuelles
  spreadsheetId  // Export de l'ID de la feuille pour les services
};

// Ajout de console.error pour afficher les erreurs
console.error = (err) => {
  console.log(`Erreur : ${err.message}`);
  if (err.stack) {
    console.log(err.stack);
  }
};

