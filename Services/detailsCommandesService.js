const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Fonction pour récupérer les détails des commandes sur le mois en cours
module.exports.getDetailsCommandesDataCurrentMonth = async () => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'DetailsCommandes!A1:F1000',
    });

    const detailsCommandes = result.data.values;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Filtrer les détails des commandes par mois et année actuels
    const filteredDetailsCommandes = detailsCommandes.filter((detailsCommande) => {
      const [day, month, year] = detailsCommande[1].split('/'); // Date_Commande format dd/mm/yyyy
      return parseInt(month, 10) === currentMonth && parseInt(year, 10) === currentYear;
    });

    return filteredDetailsCommandes;
  } catch (error) {
    throw new Error('Erreur lors de la récupération des détails des commandes');
  }
};

// Fonction pour récupérer les détails des commandes d'un client spécifique sur le mois en cours
module.exports.getDetailsCommandesByClientCurrentMonth = async (clientId) => {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'DetailsCommandes!A1:F1000',
    });

    const detailsCommandes = result.data.values;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    // Filtrer les détails des commandes par clientId et mois/année actuels
    const filteredDetailsCommandes = detailsCommandes.filter((detailsCommande) => {
      const [day, month, year] = detailsCommande[1].split('/');
      return detailsCommande[0] === clientId && parseInt(month, 10) === currentMonth && parseInt(year, 10) === currentYear;
    });

    return filteredDetailsCommandes;
  } catch (error) {
    throw new Error('Erreur lors de la récupération des détails des commandes pour ce client');
  }
};

// Ajouter des détails de commande
module.exports.addDetailsCommande = async (detailsCommandeData) => {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: spreadsheetId,
      range: 'DetailsCommandes!A1:F1',
      valueInputOption: 'RAW',
      resource: {
        values: [detailsCommandeData],
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de l\'ajout des détails de commande');
  }
};

// Mettre à jour un détail de commande existant
module.exports.updateDetailsCommande = async (row, detailsCommandeData) => {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `DetailsCommandes!A${row}:F${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [detailsCommandeData],
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de la mise à jour des détails de commande');
  }
};

// Supprimer un détail de commande
module.exports.deleteDetailsCommande = async (row) => {
  try {
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `DetailsCommandes!A${row}:F${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['', '', '', '', '', '']],  // Supprime en vidant la ligne
      },
    });
  } catch (error) {
    throw new Error('Erreur lors de la suppression des détails de commande');
  }
};
