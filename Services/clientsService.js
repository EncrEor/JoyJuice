// Services/clientsService.js
const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

// Authentification avec le compte de service
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

// Fonction helper pour nettoyer les chaînes de caractères
const cleanString = (str) => {
  if (!str) return '';
  return str.toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, ""); // Enlève les accents
};

// Fonction utilitaire pour convertir un tableau en objet client
const arrayToClientObject = (clientArray) => {
  if (!clientArray) return null;
  return {
    ID_Client: clientArray[COLUMNS.ID],
    Nom_Client: clientArray[COLUMNS.Nom_Client],
    zone: clientArray[COLUMNS.zone],
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
    Tel: clientArray[COLUMNS.Tel],
    Adresse: clientArray[COLUMNS.Adresse]
  };
};

// Ajouter la fonction de génération d'ID
async function generateClientId() {
  try {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A:A',
    });

    let maxId = 0;
    if (result.data.values && result.data.values.length > 1) {
      const ids = result.data.values
        .slice(1) // Skip header
        .map(row => parseInt(row[0] || '0', 10))
        .filter(id => !isNaN(id));

      maxId = Math.max(0, ...ids);
    }

    console.log('Dernier ID trouvé:', maxId);
    return (maxId + 1).toString();
  } catch (error) {
    console.error('Erreur lors de la génération de l\'ID client:', error);
    throw new Error('Erreur lors de la génération de l\'ID client');
  }
}


// Récupérer tous les clients
module.exports.getClientsData = async () => {
  try {
    console.log('🔍 Récupération des données clients...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Clients!A1:O1000',
    });

    if (!result || !result.data || !result.data.values) {
      console.error('❌ Données clients invalides ou manquantes');
      return [];
    }

    const clients = result.data.values;
    console.log('📋 Données clients récupérées :', clients);
    
    const formattedClients = clients.slice(1).map(client => arrayToClientObject(client));
    console.log(`✅ Nombre de clients récupérés : ${formattedClients.length}`);
    return formattedClients;
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des clients :', error.message);
    throw error;
  }
};

// Rechercher un client par nom ou ID
module.exports.findClientByName = async (searchTerm) => {
  try {
    console.log(`Recherche du client avec le terme: ${searchTerm}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Clients!A1:O1000',
    });
    const clients = result.data.values;
    
    // Si searchTerm est un ID, rechercher directement
    if (/^\d+$/.test(searchTerm)) {
      const client = clients.find(client => client[COLUMNS.ID] === searchTerm);
      return client ? arrayToClientObject(client) : null;
    }

    // Recherche par nom
    const searchClean = cleanString(searchTerm);
    const matches = clients
      .slice(1) // Skip header
      .filter(client => {
        const clientName = cleanString(client[COLUMNS.Nom_Client]); // Mise à jour des indices
        return clientName.includes(searchClean) || searchClean.includes(clientName);
      })
      .map(client => arrayToClientObject(client));

    if (matches.length === 0) {
      console.log(`Aucun client trouvé avec le terme: ${searchTerm}`);
      return null;
    }

    if (matches.length > 1) {
      console.log(`Plusieurs clients trouvés avec le terme: ${searchTerm}`);
      return {
        multiple: true,
        matches: matches,
        message: `Plusieurs clients trouvés avec le nom "${searchTerm}": ${matches.map(c => `${c.Nom_Client} (${c.zone})`).join(', ')}`
      };
    }

    console.log(`Client unique trouvé: ${matches[0].Nom_Client}`);
    return matches[0];

  } catch (error) {
    console.error('Erreur lors de la recherche du client:', error.message);
    console.error(error.stack);
    throw new Error('Erreur lors de la recherche du client');
  }
};

// Récupérer un client par ID
module.exports.getClientById = async (id) => {
  try {
    console.log(`Récupération des données pour le client avec ID: ${id}`);
    return await module.exports.findClientByName(id);
  } catch (error) {
    console.error(`Erreur lors de la récupération du client par ID ${id}:`, error.message);
    console.error(error.stack);
    throw new Error('Erreur lors de la récupération du client par ID');
  }
};

// Récupérer une colonne spécifique pour un client par ID
module.exports.getClientField = async (id, field) => {
  try {
    console.log(`Récupération de la colonne ${field} pour le client avec ID: ${id}`);
    const client = await module.exports.getClientById(id);

    if (!client) {
      console.log(`Client avec ID: ${id} non trouvé.`);
      return null;
    }

    if (client[field] === undefined) {
      console.error(`Champ ${field} non valide.`);
      return null;
    }

    console.log(`Colonne ${field} récupérée avec succès pour le client ID: ${id}`);
    return client[field];
  } catch (error) {
    console.error(`Erreur lors de la récupération de la colonne ${field} pour le client ${id}:`, error.message);
    console.error(error.stack);
    throw new Error(`Erreur lors de la récupération de la colonne ${field} du client`);
  }
};

// Ajouter un nouveau client
module.exports.addClient = async (clientArray) => {
  try {
    console.log('Début de l\'ajout du client, données reçues:', clientArray);

    // Génération de l'ID client
    const newId = await generateClientId();
    console.log('Nouvel ID généré:', newId);

    // Création du tableau final avec l'ID généré
    const finalClientArray = [
      newId,                               // ID
      clientArray[1],                      // Nom_Client
      clientArray[2] || '',                // zone
      clientArray[3] || 'o',               // Actif
      clientArray[4] || 'CASH',            // Mode_comptable
      clientArray[5] || '1',               // CYCLE
      clientArray[6] || new Date().toISOString().split('T')[0],  // Lat_sold_Date
      clientArray[7] || 'non',             // Paid
      clientArray[8] || new Date().toISOString().split('T')[0],  // Next_sold_date
      clientArray[1],                      // Nom_Client
      clientArray[2] || '',                // zone
      clientArray[3] || 'o',               // Actif
      clientArray[4] || 'CASH',            // Mode_comptable
      clientArray[5] || '1',               // CYCLE
      clientArray[6] || new Date().toISOString().split('T')[0],  // Lat_sold_Date
      clientArray[7] || 'non',             // Paid
      clientArray[8] || new Date().toISOString().split('T')[0],  // Next_sold_date
      clientArray[9] || '0',               // Billing_period
      clientArray[10] || 'CASH',           // PAY_MODE
      clientArray[11] || '0',              // PAY_DELAY
      clientArray[12] || new Date().toISOString().split('T')[0], // LAST_PAY_DATE
      clientArray[13] || '',               // Tel
      clientArray[14] || ''                // Adresse
    ];

    console.log('Données finales pour Google Sheets:', finalClientArray);

    // Vérification une dernière fois du nom du client
    if (!finalClientArray[1]) {
      throw new Error('Le nom du client est obligatoire');
    }

    // Ajout dans Google Sheets
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Clients!A:O',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [finalClientArray]
      },
    });

    console.log('Réponse de Google Sheets:', result.data);

    // Création de l'objet de retour
    const newClient = {
      ID_Client: newId,
      Nom_Client: finalClientArray[1],
      Tel: finalClientArray[13],
      Adresse: finalClientArray[14],
      Zone: finalClientArray[2],
      Actif: finalClientArray[3],
      Mode_comptable: finalClientArray[4],
      CYCLE: finalClientArray[5]
    };

    return newClient;

  } catch (error) {
    console.error('Erreur lors de l\'ajout du client:', error);
    throw new Error(`Erreur lors de l'ajout du client: ${error.message}`);
  }
};

// Mettre à jour une colonne spécifique d'un client
module.exports.updateClientField = async (id, field, value) => {
  try {
    console.log(`Mise à jour de la colonne ${field} pour le client avec ID: ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Clients!A1:O1000',
    });
    const clients = result.data.values;
    const row = clients.findIndex(client => client[COLUMNS.ID] === id) + 1; // Modifié ici : COLUMNS.ID_CLIENT -> COLUMNS.ID
    if (row === 0) throw new Error('Client non trouvé');

    const fieldIndex = COLUMNS[field.toUpperCase()];
    if (fieldIndex === undefined) throw new Error(`Champ ${field} non valide`);

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `Clients!${String.fromCharCode(65 + fieldIndex)}${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[value]],
      },
    });

    console.log(`Mise à jour réussie de la colonne ${field} pour le client ID: ${id}`);
    return true;
  } catch (error) {
    console.error(`Erreur lors de la mise à jour du client ${id}:`, error.message);
    console.error(error.stack);
    throw new Error(`Erreur lors de la mise à jour du client ${id}`);
  }
};

// Supprimer un client
module.exports.deleteClient = async (id) => {
  try {
    console.log(`Suppression du client avec ID: ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: spreadsheetId,
      range: 'Clients!A1:O1000',
    });
    const clients = result.data.values;
    const row = clients.findIndex(client => client[COLUMNS.ID_CLIENT] === id) + 1;
    if (row === 0) throw new Error('Client non trouvé');

    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId,
      range: `Clients!A${row}:O${row}`,
      valueInputOption: 'RAW',
      resource: {
        values: [Array(15).fill('')],       // 15 colonnes à vider
      },
    });

    console.log(`Client avec ID: ${id} supprimé avec succès.`);
    return true;
  } catch (error) {
    console.error(`Erreur lors de la suppression du client ${id}:`, error.message);
    console.error(error.stack);
    throw new Error(`Erreur lors de la suppression du client ${id}`);
  }
};