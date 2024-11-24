// Services/clientLookupService.js
const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

// Auth Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Constantes des colonnes
const COLUMNS = {
  ID_CLIENT: 0,
  NOM_CLIENT: 1,
  TEL: 2,
  ADRESSE: 3,
  ZONE: 4,
  DELAIS: 5,
  CONGELATEUR: 6
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
  if (!clientArray) return null;
  return {
    ID_Client: clientArray[COLUMNS.ID_CLIENT],
    Nom_Client: clientArray[COLUMNS.NOM_CLIENT],
    Tel: clientArray[COLUMNS.TEL],
    Adresse: clientArray[COLUMNS.ADRESSE],
    Zone: clientArray[COLUMNS.ZONE],
    Delais: clientArray[COLUMNS.DELAIS],
    Congelateur: clientArray[COLUMNS.CONGELATEUR]
  };
};

// Fonction principale de recherche
module.exports.findClientByNameAndZone = async function (name, zone = null) {
  try {
    console.log(`🔍 Recherche client - Nom: ${name}${zone ? `, Zone: ${zone}` : ''}`);

    // 1. Récupération des données
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });

    if (!result.data.values || result.data.values.length <= 1) {
      console.log('❌ Aucune donnée client trouvée');
      return {
        status: 'error',
        message: 'Données clients non disponibles'
      };
    }

    // 2. Recherche des correspondances
    const clients = result.data.values.slice(1);
    const normalizedName = normalizeString(name);
    const normalizedZone = zone ? normalizeString(zone) : null;

    // 3. Collecte des matches
    const matches = clients
      .filter(clientRow => {
        const clientName = normalizeString(clientRow[COLUMNS.NOM_CLIENT]);
        const clientZone = normalizeString(clientRow[COLUMNS.ZONE]);

        // Si zone spécifiée, filtre par nom ET zone
        if (normalizedZone) {
          return clientName === normalizedName && clientZone === normalizedZone;
        }
        // Sinon filtre juste par nom
        return clientName === normalizedName;
      })
      .map(clientRow => arrayToClientObject(clientRow));

    console.log(`🎯 Correspondances trouvées: ${matches.length}`);

    // 4. Analyse des résultats
    if (matches.length === 0) {
      return {
        status: 'not_found',
        message: `Aucun client "${name}" trouvé${zone ? ` dans la zone ${zone}` : ''}`
      };
    }

    if (matches.length === 1) {
      return {
        status: 'success',
        client: matches[0]
      };
    }

    // 5. Cas multiples : retourner les zones disponibles
    const availableZones = [...new Set(
      matches.map(client => client.Zone).filter(Boolean)
    )];

    return {
      status: 'multiple',
      message: `Client "${name}" trouvé dans plusieurs zones`,
      matches: matches,
      zones: availableZones
    };

  } catch (error) {
    console.error('❌ Erreur recherche client:', error);
    return {
      status: 'error',
      message: 'Erreur lors de la recherche'
    };
  }
};