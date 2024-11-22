//config/googleSheetsConfig.js

const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

class GoogleSheetsConfig {
  constructor() {
    if (!GoogleSheetsConfig.instance) {
      this.initialize();
      GoogleSheetsConfig.instance = this;
    }
    return GoogleSheetsConfig.instance;
  }

  initialize() {
    this.auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    this.spreadsheetId = process.env.SPREADSHEET_ID;

    // Définition des plages pour chaque feuille
    this.ranges = {
      clients: 'Clients!A:G',
      produits: 'Produits!A:E',
      livraisons: 'Livraisons!A:E',
      detailsLivraisons: 'DetailsLivraisons!A:F',
      commandes: 'Commandes!A:H',
      detailsCommandes: 'DetailsCommandes!A:F'
    };
  }

  // Méthodes utilitaires partagées
  async getValue(range) {
    try {
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range,
      });
      return response.data.values;
    } catch (error) {
      console.error(`Erreur lors de la récupération des données (${range}):`, error);
      throw new Error(`Erreur d'accès à Google Sheets: ${error.message}`);
    }
  }

  async updateValue(range, values) {
    try {
      return await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        resource: { values: [values] },
      });
    } catch (error) {
      console.error(`Erreur lors de la mise à jour des données (${range}):`, error);
      throw new Error(`Erreur de mise à jour Google Sheets: ${error.message}`);
    }
  }

  async appendValue(range, values) {
    try {
      return await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [values] },
      });
    } catch (error) {
      console.error(`Erreur lors de l'ajout des données (${range}):`, error);
      throw new Error(`Erreur d'ajout Google Sheets: ${error.message}`);
    }
  }

  // Méthodes de validation
  validateNumber(value, options = { min: 0, allowZero: false }) {
    const num = parseFloat(value);
    if (isNaN(num)) return false;
    if (!options.allowZero && num === 0) return false;
    if (num < options.min) return false;
    return true;
  }

  validateDate(dateStr) {
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (!regex.test(dateStr)) return false;
    
    const [, day, month, year] = dateStr.match(regex);
    const date = new Date(year, month - 1, day);
    
    return date.getDate() === parseInt(day, 10) &&
           date.getMonth() === parseInt(month, 10) - 1 &&
           date.getFullYear() === parseInt(year, 10);
  }

  formatDate(date) {
    const d = new Date(date);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  }
}

// Export d'une instance unique
module.exports = new GoogleSheetsConfig();