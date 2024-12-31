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
  Adresse: 14
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
    LAST_PAY_DATE: clientArray[COLUMNS.LAST_PAY_DATE]
  };

  // Validation des champs critiques
  if (!client.ID_Client || !client.Nom_Client) {
    console.warn('⚠️ Client ignoré à cause de données manquantes :', client);
    return null;
  }

  return client;
};

// Fonction principale de recherche
module.exports.findClientByNameAndZone = async function (name, zone = null) {
  try {
    console.log(`🔍 Recherche client - Nom: ${name}${zone ? `, Zone: ${zone}` : ''}`);

    // 1. Récupération des données
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:O1000',
    });

    if (!result.data.values || result.data.values.length <= 1) {
      console.log('❌ Aucune donnée client trouvée');
      return {
        status: 'not_found',
        message: 'Données clients non disponibles'
      };
    }

    // 2. Conversion et validation des données
    const clients = result.data.values.slice(1) // Skip header
      .map(arrayToClientObject)
      .filter(client => client !== null);

    if (clients.length === 0) {
      console.log('❌ Aucun client valide trouvé après validation.');
      return {
        status: 'not_found',
        message: 'Aucun client valide disponible'
      };
    }

    const searchName = normalizeString(name);
    console.log('🔍 Recherche avec nom normalisé:', searchName);

    // 3. Recherche exacte par nom
    const matchesExact = clients.filter(client => 
      normalizeString(client.Nom_Client) === searchName
    );

    if (matchesExact.length === 1) {
      console.log(`✅ Correspondance exacte trouvée :`, matchesExact[0]);
      return { status: 'success', client: matchesExact[0] };
    }

    // 4. Recherche par zone si spécifiée
    if (zone) {
      const matchesZone = clients.filter(client => 
        normalizeString(client.Nom_Client) === searchName &&
        normalizeString(client.Zone) === normalizeString(zone)
      );

      if (matchesZone.length === 1) {
        console.log(`✅ Correspondance exacte avec zone trouvée :`, matchesZone[0]);
        return { status: 'success', client: matchesZone[0] };
      }

      if (matchesZone.length === 0) {
        return {
          status: 'not_found',
          message: `Client "${name}" non trouvé dans la zone "${zone}"`
        };
      }
    }

    // 5. Recherche partielle si aucune correspondance exacte
    console.log('🔍 Tentative avec recherche partielle...');
    const matchesPartial = clients.filter(client => 
      normalizeString(client.Nom_Client).startsWith(searchName)
    );

    if (matchesPartial.length === 1) {
      console.log(`✅ Correspondance partielle trouvée :`, matchesPartial[0]);
      return { status: 'success', client: matchesPartial[0] };
    }

    if (matchesPartial.length > 1) {
      const availableZones = [...new Set(
        matchesPartial.map(client => client.Zone).filter(Boolean)
      )];

      console.log(`⚠️ Ambiguïté détectée : plusieurs clients trouvés.`);
      return {
        status: 'multiple',
        message: `Client "${name}" trouvé dans plusieurs zones`,
        matches: matchesPartial,
        zones: availableZones
      };
    }

    // Aucune correspondance
    return {
      status: 'not_found',
      message: `Aucun client "${name}" trouvé`
    };

  } catch (error) {
    console.error('❌ Erreur recherche client:', error);
    throw error;
  }
};
