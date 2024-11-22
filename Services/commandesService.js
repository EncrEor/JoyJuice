const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Fonction pour récupérer toutes les commandes sur le mois en cours
module.exports.getCommandesDataCurrentMonth = async () => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Commandes!A1:H1000',
    });

    const commandes = result.data.values;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Filtrer les commandes par mois et année actuels
    const filteredCommandes = commandes.filter((commande) => {
      const [day, month, year] = commande[2].split('/'); // Date_Commande format dd/mm/yyyy
      return parseInt(month, 10) === currentMonth && parseInt(year, 10) === currentYear;
    });

    return filteredCommandes;
  } catch (error) {
    throw new Error('Erreur lors de la récupération des commandes');
  }
};

// Fonction pour récupérer toutes les commandes d'un client spécifique sur le mois en cours
module.exports.getCommandesByClientCurrentMonth = async (clientId) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Commandes!A1:H1000',
    });

    const commandes = result.data.values;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Filtrer les commandes par clientId et mois/année actuels
    const filteredCommandes = commandes.filter((commande) => {
      const [day, month, year] = commande[2].split('/');
      return commande[1] === clientId && parseInt(month, 10) === currentMonth && parseInt(year, 10) === currentYear;
    });

    return filteredCommandes;
  } catch (error) {
    throw new Error('Erreur lors de la récupération des commandes pour ce client');
  }
};

// Ajouter une nouvelle commande
module.exports.addCommande = async (commandeData) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: 'Commandes!A1:H1',
      valueInputOption: 'RAW',
      resource: {
        values: [commandeData],
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de l\'ajout de la commande');
  }
};

// Mettre à jour une commande existante
module.exports.updateCommande = async (row, commandeData) => {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `Commandes!A${row}:H${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [commandeData],
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de la mise à jour de la commande');
  }
};

// Supprimer une commande
module.exports.deleteCommande = async (row) => {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `Commandes!A${row}:H${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['', '', '', '', '', '', '', '']],  // Supprime en vidant la ligne
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de la suppression de la commande');
  }
};
