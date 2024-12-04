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
        status: 'not_found',
        message: 'Données clients non disponibles'
      };
    }

    // 2. Recherche par nom
    const clients = result.data.values.slice(1);  // Skip header
    const searchName = normalizeString(name);
    console.log('🔍 Recherche avec nom normalisé:', searchName);

    // Recherche d'abord avec le nom complet
    const matchesComplet = clients.filter(clientRow =>
      normalizeString(clientRow[COLUMNS.NOM_CLIENT]) === searchName
    ).map(clientRow => arrayToClientObject(clientRow));

    // Si pas de correspondance, chercher avec la première partie du nom
    if (matchesComplet.length === 0) {
      const firstPart = searchName.split(' ')[0];
      console.log('🔍 Tentative avec première partie du nom:', firstPart);

      const matchesPartiel = clients.filter(clientRow =>
        normalizeString(clientRow[COLUMNS.NOM_CLIENT]).startsWith(firstPart)
      ).map(clientRow => arrayToClientObject(clientRow));

      if (matchesPartiel.length > 0) {
        matchesComplet.push(...matchesPartiel);
      }
    }

    console.log(`🎯 Correspondances trouvées: ${matchesComplet.length}`);

    // 3. Analyse des résultats
    if (matchesComplet.length === 0) {
      return {
        status: 'not_found',
        message: `Aucun client "${name}" trouvé`
      };
    }

    // Si une zone est spécifiée, filtrer par zone
    if (zone) {
      const matchesZone = matchesComplet.filter(client =>
        normalizeString(client.Zone) === normalizeString(zone)
      );

      if (matchesZone.length === 1) {
        return {
          status: 'success',
          client: matchesZone[0]
        };
      }

      if (matchesZone.length === 0) {
        return {
          status: 'not_found',
          message: `Client "${name}" non trouvé dans la zone "${zone}"`
        };
      }
    }

    // Si plusieurs correspondances sans zone spécifiée
    if (matchesComplet.length > 1) {
      const availableZones = [...new Set(
        matchesComplet
          .map(client => client.Zone)
          .filter(Boolean)
      )];

      return {
        status: 'multiple',
        message: `Client "${name}" trouvé dans plusieurs zones`,
        matches: matchesComplet,
        zones: availableZones
      };
    }

    // Un seul client trouvé
    return {
      status: 'success',
      client: matchesComplet[0]
    };

  } catch (error) {
    console.error('❌ Erreur recherche client:', error);
    throw error;
  }
};
