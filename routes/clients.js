// routes/clients.js
const express = require('express');
const router = express.Router();
const { clientsService } = require('../Services/googleSheetsService');
const indexManager = require('../Services/claude/core/indexManager');
const clientLookupService = require('../Services/clientLookupService');

// Récupérer tous les clients
router.get('/', async (req, res) => {
  try {
    const searchTerm = req.query.search;
    console.log('Demande de recherche client:', searchTerm);

    const clients = await clientsService.getClientsData();

    if (searchTerm) {
      // Recherche normalisée
      const normalizedSearch = searchTerm.toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();

      const filteredClients = clients.filter(client => {
        if (!client.Nom_Client) return false;
        
        const normalizedName = client.Nom_Client.toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim();

        const normalizedId = client.ID_Client?.toString().trim();

        return normalizedName.includes(normalizedSearch) || 
               normalizedId === normalizedSearch;
      });

      if (filteredClients.length > 0) {
        res.status(200).json({
          success: true,
          data: filteredClients[0],
          totalFound: filteredClients.length
        });
      } else {
        res.status(404).json({
          success: false,
          message: `Aucun client trouvé pour "${searchTerm}"`,
          data: null
        });
      }
    } else {
      res.status(200).json({
        success: true,
        data: clients
      });
    }
  } catch (err) {
    console.error('Erreur recherche client:', err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche du client',
      error: err.message
    });
  }
});

// Récupérer une information spécifique d'un client
router.get('/:id/:field', async (req, res) => {
  try {
    const { id, field } = req.params;
    console.log(`Demande d'information ${field} pour le client ${id}`);
    const fieldValue = await clientsService.getClientFieldById(id, field);
    if (fieldValue) {
      console.log(`Information ${field} trouvée pour le client ${id}`);
      res.status(200).json({ [field]: fieldValue });
    } else {
      console.log(`Information ${field} non trouvée pour le client ${id}`);
      res.status(404).json({ message: `Champ ${field} non trouvé pour le client ${id}.` });
    }
  } catch (err) {
    console.error(`Erreur lors de la récupération du champ ${field} pour le client ${id}:`, err);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération de l\'information du client.',
      error: err.message 
    });
  }
});

// Récupérer un client par ID (toutes les colonnes)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Demande de récupération du client ${id}`);
    const client = await clientsService.getClientById(id);
    if (client) {
      console.log(`Client ${id} trouvé`);
      res.status(200).json(client);
    } else {
      console.log(`Client ${id} non trouvé`);
      res.status(404).json({ message: 'Client non trouvé.' });
    }
  } catch (err) {
    console.error(`Erreur lors de la récupération du client ${id}:`, err);
    res.status(500).json({ 
      message: 'Erreur lors de la récupération du client.',
      error: err.message 
    });
  }
});

// Ajouter un nouveau client
router.post('/', async (req, res) => {
  try {
    console.log('Demande d\'ajout d\'un nouveau client:', req.body);
    
    // Vérification du nom client uniquement
    if (!req.body.Nom_Client) {
      return res.status(400).json({ 
        success: false, 
        message: 'Le nom du client est obligatoire' 
      });
    }
    
    // Transformation des données en tableau ordonné
    // L'ID sera généré par le service
    const clientArray = [
      null, // ID_Client sera généré dans le service
      req.body.Nom_Client,
      req.body.Tel || '',
      req.body.Adresse || '',
      req.body.Zone || '',
      req.body.Delais || '',
      req.body.Congelateur || '',
      parseFloat(req.body.Solde || '0').toFixed(3) // Gestion du solde avec formatage
    ];
    
    console.log('Données formatées pour le service:', clientArray);

    const result = await clientsService.addClient(clientArray);
    console.log('Client ajouté avec succès:', result);

    res.status(201).json({ 
      success: true,
      message: 'Client ajouté avec succès.',
      data: result 
    });
  } catch (err) {
    console.error('Erreur dans la route POST /clients:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'ajout du client.',
      error: err.message 
    });
  }
});

// Mettre à jour une information spécifique d'un client
router.patch('/:id/:field', async (req, res) => {
  try {
    const { id, field } = req.params;
    const updatedValue = req.body[field];
    console.log(`Demande de mise à jour du champ ${field} pour le client ${id}:`, updatedValue);
    
    await clientsService.updateClientField(id, field, updatedValue);
    console.log(`Champ ${field} mis à jour pour le client ${id}`);
    res.status(200).json({ message: 'Client mis à jour avec succès.' });
  } catch (err) {
    console.error(`Erreur lors de la mise à jour du champ ${field} pour le client ${id}:`, err);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour du client.',
      error: err.message 
    });
  }
});

// Supprimer un client
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Demande de suppression du client ${id}`);
    await clientsService.deleteClient(id);
    console.log(`Client ${id} supprimé avec succès`);
    res.status(200).json({ message: 'Client supprimé.' });
  } catch (err) {
    console.error(`Erreur lors de la suppression du client ${id}:`, err);
    res.status(500).json({ 
      message: 'Erreur lors de la suppression du client.',
      error: err.message 
    });
  }
});

module.exports = router;

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
  ID_CLIENT: 0,
  NOM_CLIENT: 1,
  TEL: 2,
  ADRESSE: 3,
  ZONE: 4,
  DELAIS: 5,
  CONGELATEUR: 6,
  SOLDE: 7
};

// Récupérer tous les clients
module.exports.getClientsData = async () => {
  try {
    console.log('Récupération des données clients...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });
    
    if (!result.data.values) {
      console.log('Aucune donnée trouvée dans la feuille Clients');
      return [];
    }
    
    console.log(`${result.data.values.length} lignes récupérées`);
    return result.data.values;
  } catch (error) {
    console.error('Erreur lors de la récupération des clients:', error);
    throw new Error(`Erreur lors de la récupération des clients: ${error.message}`);
  }
};

// Récupérer une colonne spécifique pour un client par ID
module.exports.getClientFieldById = async (id, field) => {
  try {
    console.log(`Récupération du champ ${field} pour le client ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });

    if (!result.data.values) {
      console.log('Aucune donnée trouvée');
      return null;
    }

    const headerRow = result.data.values[0];
    const fieldIndex = headerRow.findIndex(header => 
      header.toLowerCase() === field.toLowerCase()
    );

    if (fieldIndex === -1) {
      throw new Error(`Champ ${field} non trouvé dans les en-têtes`);
    }

    const clientRow = result.data.values.find(row => row[COLUMNS.ID_CLIENT] === id);
    
    if (!clientRow) {
      console.log(`Client ${id} non trouvé`);
      return null;
    }

    console.log(`Valeur trouvée pour le champ ${field}: ${clientRow[fieldIndex]}`);
    return clientRow[fieldIndex];
  } catch (error) {
    console.error(`Erreur lors de la récupération du champ ${field}:`, error);
    throw new Error(`Erreur lors de la récupération du champ ${field}: ${error.message}`);
  }
};

// Récupérer un client par ID (toutes les colonnes)
module.exports.getClientById = async (id) => {
  try {
    console.log(`Récupération du client ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });

    if (!result.data.values) {
      console.log('Aucune donnée trouvée');
      return null;
    }

    const headerRow = result.data.values[0];
    const clientRow = result.data.values.find(row => row[COLUMNS.ID_CLIENT] === id);

    if (!clientRow) {
      console.log(`Client ${id} non trouvé`);
      return null;
    }

    // Création d'un objet avec les en-têtes comme clés
    const client = headerRow.reduce((obj, header, index) => {
      obj[header] = clientRow[index];
      return obj;
    }, {});

    console.log(`Client ${id} trouvé:`, client);
    return client;
  } catch (error) {
    console.error(`Erreur lors de la récupération du client ${id}:`, error);
    throw new Error(`Erreur lors de la récupération du client ${id}: ${error.message}`);
  }
};

// Ajouter un nouveau client
module.exports.addClient = async (clientData) => {
  try {
    console.log('Début de l\'ajout du client:', clientData);

    // Vérification des données
    if (!clientData || clientData.some(field => field === undefined)) {
      throw new Error('Données du client incomplètes');
    }

    // Vérification de l'ID unique
    const existingClients = await this.getClientsData();
    if (existingClients.some(client => client[COLUMNS.ID_CLIENT] === clientData[COLUMNS.ID_CLIENT])) {
      throw new Error(`Un client avec l'ID ${clientData[COLUMNS.ID_CLIENT]} existe déjà`);
    }

    // Ajout du client
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Clients!A:G',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [clientData]
      },
    });

    console.log('Client ajouté avec succès:', result.data);
    return result.data;
  } catch (error) {
    console.error('Erreur lors de l\'ajout du client:', error);
    throw new Error(`Erreur lors de l'ajout du client: ${error.message}`);
  }
};

// Mettre à jour une colonne spécifique d'un client
module.exports.updateClientField = async (id, field, value) => {
  try {
    console.log(`Mise à jour du champ ${field} pour le client ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });

    if (!result.data.values) {
      throw new Error('Aucune donnée trouvée');
    }

    const headerRow = result.data.values[0];
    const fieldIndex = headerRow.findIndex(header => 
      header.toLowerCase() === field.toLowerCase()
    );

    if (fieldIndex === -1) {
      throw new Error(`Champ ${field} non trouvé dans les en-têtes`);
    }

    const rowIndex = result.data.values.findIndex(row => row[COLUMNS.ID_CLIENT] === id);
    
    if (rowIndex === -1) {
      throw new Error(`Client ${id} non trouvé`);
    }

    // Mise à jour de la cellule
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clients!${String.fromCharCode(65 + fieldIndex)}${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[value]]
      },
    });

    console.log(`Champ ${field} mis à jour pour le client ${id}`);
  } catch (error) {
    console.error(`Erreur lors de la mise à jour du champ ${field}:`, error);
    throw new Error(`Erreur lors de la mise à jour du champ ${field}: ${error.message}`);
  }
};

// Supprimer un client
module.exports.deleteClient = async (id) => {
  try {
    console.log(`Suppression du client ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Clients!A1:G1000',
    });

    if (!result.data.values) {
      throw new Error('Aucune donnée trouvée');
    }

    const rowIndex = result.data.values.findIndex(row => row[COLUMNS.ID_CLIENT] === id);
    
    if (rowIndex === -1) {
      throw new Error(`Client ${id} non trouvé`);
    }

    // Effacement des données de la ligne
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Clients!A${rowIndex + 1}:G${rowIndex + 1}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['', '', '', '', '', '', '']]
      },
    });

    console.log(`Client ${id} supprimé avec succès`);
  } catch (error) {
    console.error(`Erreur lors de la suppression du client ${id}:`, error);
    throw new Error(`Erreur lors de la suppression du client ${id}: ${error.message}`);
  }
};