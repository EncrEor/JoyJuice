// Services/productLookupService.js

const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

// Authentification Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Constantes des colonnes pour plus de clarté
const COLUMNS = {
  ID_PRODUIT: 0,
  NOM_PRODUIT: 1,
  PRIX_UNITAIRE: 2,
  CONTENANCE: 3,
  QUANTITE_STOCK: 4,
  CONTENANCE: 5,
  Quantite_Stock: 6,
  Prix_HT: 7,
  Fodec: 8,
  TVA: 9
};

// Fonction pour normaliser les chaînes de texte
const normalizeString = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Retire les accents
};

class ProductLookupService {
  async findProductByName(productName) {
    try {
      console.log(`🔍 Recherche produit: ${productName}`);

      // Normaliser le nom du produit recherché
      const normalizedProductName = normalizeString(productName);

      // Filtrer les produits en fonction du nom normalisé
      const product = products.find(p => normalizeString(p[COLUMNS.NOM_PRODUIT]) === normalizedProductName);

      // Vérifier si le produit a été trouvé
      if (!product) {
        console.log(`⚠️ Produit avec le nom "${productName}" introuvable.`);
        return null;
      }

      // Retourner les détails du produit sous forme d'objet
      return {
        ID_Produit: product[COLUMNS.ID_PRODUIT],
        Nom_Produit: product[COLUMNS.NOM_PRODUIT],
        Prix_Unitaire: parseFloat(product[COLUMNS.PRIX_UNITAIRE]),
        Contenance: product[COLUMNS.CONTENANCE],
        Quantite_Stock: product[COLUMNS.QUANTITE_STOCK]
      };
    } catch (error) {
      console.error('❌ Erreur lors de la recherche de produit par nom:', error);
      throw new Error('Erreur serveur Google Sheets');
    }
  }

  async findProductById(productId) {
    try {
      console.log(`🔍 Recherche produit avec ID: ${productId}`);

      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Produits!A1:E1000',
      });

      if (!result.data.values || result.data.values.length <= 1) {
        console.log('⚠️ Aucun produit trouvé dans Google Sheets.');
        return null;
      }

      // Ignorer la ligne d'en-tête et chercher par ID exact
      const product = result.data.values.slice(1).find(p => p[COLUMNS.ID_PRODUIT] === productId);

      if (!product) {
        console.log(`⚠️ Produit avec l'ID "${productId}" introuvable.`);
        return null;
      }

      // Retourner les détails du produit
      return {
        ID_Produit: product[COLUMNS.ID_PRODUIT],
        Nom_Produit: product[COLUMNS.NOM_PRODUIT],
        Prix_Unitaire: parseFloat(product[COLUMNS.PRIX_UNITAIRE]),
        Contenance: product[COLUMNS.CONTENANCE],
        Quantite_Stock: product[COLUMNS.QUANTITE_Stock]
      };
    } catch (error) {
      console.error('❌ Erreur lors de la recherche de produit par ID:', error);
      throw new Error('Erreur serveur Google Sheets');
    }
  }
}

module.exports = new ProductLookupService();

