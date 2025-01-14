const { google } = require('googleapis');
const dotenv = require('dotenv');
const ABREV_RANGE = 'abrev.clients!A2:G1000';

let clientAbreviations = new Map();

dotenv.config();

// Auth Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Constantes pour les colonnes
const COLUMNS = {
  ID: 0,
  Nom_Client: 1,
  zone: 2,
  Actif: 3,
  Mode_comptable: 4,
  CYCLE: 5,
  Lat_sold_Date: 6,
  Paid: 7,
  Next_sold_date: 8,
  Billing_period: 9,
  PAY_MODE: 10,
  PAY_DELAY: 11,
  LAST_PAY_DATE: 12,
  Tel: 13,
  Adresse: 14,
};

// Normalisation des chaînes
const normalizeString = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

// Conversion en objet client
const arrayToClientObject = (clientArray) => {
  if (!clientArray || clientArray.length < Object.keys(COLUMNS).length) {
    console.warn('⚠️ Ligne client invalide ou incomplète :', clientArray);
    return null;
  }

  const client = {
    ID_Client: clientArray[COLUMNS.ID],
    Nom_Client: clientArray[COLUMNS.Nom_Client],
    Tel: clientArray[COLUMNS.Tel],
    Adresse: clientArray[COLUMNS.Adresse],
    Zone: clientArray[COLUMNS.zone],
    Delais: clientArray[COLUMNS.Delais],
    Actif: clientArray[COLUMNS.Actif],
    Mode_comptable: clientArray[COLUMNS.Mode_comptable],
    CYCLE: clientArray[COLUMNS.CYCLE],
    Lat_sold_Date: clientArray[COLUMNS.Lat_sold_Date],
    Paid: clientArray[COLUMNS.Paid],
    Next_sold_date: clientArray[COLUMNS.Next_sold_date],
    Billing_period: clientArray[COLUMNS.Billing_period],
    PAY_MODE: clientArray[COLUMNS.PAY_MODE],
    PAY_DELAY: clientArray[COLUMNS.PAY_DELAY],
    LAST_PAY_DATE: clientArray[COLUMNS.LAST_PAY_DATE],
  };

  if (!client.ID_Client || !client.Nom_Client) {
    console.warn('⚠️ Client ignoré à cause de données manquantes :', client);
    return null;
  }

  return client;
};

// Chargement abreviations
async function loadClientAbreviations() {
  try {
    console.log(' Chargement des abréviations clients...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: ABREV_RANGE,
    });

    if (!result.data.values) {
      console.log('⚠️ Aucune abréviation trouvée');
      return;
    }

    clientAbreviations.clear();
    result.data.values.forEach(row => {
      if (!row[0] || !row[1]) return; // Skip lignes invalides

      const clientData = {
        ID_Client: row[0],
        Nom_Client: row[1],
        DEFAULT: row[2] || '1',
      };

      for (let i = 3; i <= 6; i++) {
        if (row[i]) {
          const abrev = normalizeString(row[i]);
          clientAbreviations.set(abrev, clientData);
          //console.log(` Abréviation ajoutée: ${abrev} -> ${clientData.Nom_Client} (DEFAULT=${clientData.DEFAULT})`); 
          //comment pour alléger le log
        }
      }
    });

    console.log(`✅ ${clientAbreviations.size} abréviations chargées`);
  } catch (error) {
    console.error('❌ Erreur chargement abréviations:', error);
  }
}

// Fonction principale de recherche
module.exports.findClientByNameAndZone = async function(name, zone = null) {
  try {
    console.log(` Début recherche - Nom: "${name}"`);

    // 1. Vérifier le cache des abréviations
    if (!clientAbreviations?.size) {
      console.log(' Chargement initial des abréviations...');
      await loadClientAbreviations();
    }

    // 2. Recherche par abréviation
    const searchKeys = [normalizeString(name)];
    console.log(' Clés de recherche:', searchKeys);

    // 3. Si trouvé par abréviation, retourner immédiatement
    for (const searchKey of searchKeys) {
      const match = clientAbreviations.get(searchKey);
      if (match) {
        console.log('✅ (clientLookupService) Client trouvé par abréviation:', match);
        return {
          status: 'success',
          client: {
            ID_Client: match.ID_Client,
            Nom_Client: match.Nom_Client,
            DEFAULT: match.DEFAULT,
            zone: match.zone
          }
        };
      }
    }

    // 4. Sinon retourner non trouvé
    console.log('❌ Client non trouvé:', name);
    return { 
      status: 'not_found', 
      message: `Aucun client "${name}" trouvé` 
    };

  } catch (error) {
    console.error('❌ Erreur recherche client:', error);
    throw error;
  }
};