// Services/livraisonsService.js

const dotenv = require('dotenv');
dotenv.config();

const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// On importe la logique de format pour les livraisons
const {
  handleNewFormatLivraison,
  handleOldFormatLivraison,
  handleUpdateLivraisonNewFormat,
  handleUpdateLivraisonOldFormat
} = require('./livraisonsFormat');

// On importe d'autres services si besoin
const clientLookupService = require('./clientLookupService');
const productLookupService = require('./productLookupService');
const detailsLivraisonsService = require('./detailsLivraisonsService');

// On importe les utilitaires de date
const DateUtils = require('./claude/core/cacheManager/dateUtils');

// ============================
// Constantes, colonnes, etc.
// ============================
const CONFIG_RANGE = 'Config!A1:B10';
const LIVRAISONS_RANGE = 'Livraisons!A2:E1000';

const COLUMNS = {
  ID_LIVRAISON: 0,
  DATE_LIVRAISON: 1,
  ID_CLIENT: 2,
  TOTAL_LIVRAISON: 3,
  STATUT_L: 4,
  ID_ODOO: 11  // Position de P_IDODOO
};

const FORMAT_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
const STATUTS_VALIDES = ['En cours', 'Terminée', 'Annulée'];
const FORMAT_DATE_EXEMPLE = 'dd/mm/yyyy';

// On exporte aussi COLUMNS si on en a besoin dans livraisonsFormat.js
module.exports.COLUMNS = COLUMNS;

/**
 * Lecture générique d'une plage Google Sheets
 */
async function getSheetValues(range) {
  const result = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return result.data.values || [];
}

/**
 * Recherche l'index d'une ligne en fonction d'un ID
 */
function findRowIndexById(rows, id, colIndex = 0) {
  return rows.findIndex(row => row[colIndex] === id);
}

// =====================
// 1) Générer un nouvel ID
// =====================
module.exports.generateLivraisonId = async () => {
  try {
    // 1. Lire le compteur actuel
    const configResult = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: CONFIG_RANGE
    });

    let lastId = 0;
    let configRowIndex = 1;

    if (configResult.data.values) {
      const rowIndex = configResult.data.values.findIndex(row => row[0] === 'LAST_LIVRAISON_ID');
      if (rowIndex !== -1) {
        lastId = parseInt(configResult.data.values[rowIndex][1], 10);
        configRowIndex = rowIndex + 1;
      }
    }

    // 2. Incrémenter et mettre à jour
    const newId = lastId + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Config!A${configRowIndex}:B${configRowIndex}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['LAST_LIVRAISON_ID', newId.toString()]]
      }
    });

    console.log('Nouvel ID généré:', newId);
    return `L${newId.toString().padStart(4, '0')}`;
  } catch (error) {
    console.error('Erreur lors de la génération de l\'ID de livraison:', error);
    throw new Error('Erreur lors de la génération de l\'ID de livraison');
  }
};

// =====================
// 2) getLivraisonById
// =====================
module.exports.getLivraisonById = async (id) => {
  try {
    console.log(`Récupération de la livraison ${id}`);
    const rows = await getSheetValues(LIVRAISONS_RANGE);
    if (!rows.length) {
      console.log('Aucune livraison trouvée');
      return null;
    }

    const row = rows.find(r => r[COLUMNS.ID_LIVRAISON] === id);
    if (!row) {
      console.log(`Livraison ${id} non trouvée`);
      return null;
    }

    return {
      ID_Livraison: row[COLUMNS.ID_LIVRAISON],
      Date_Livraison: row[COLUMNS.DATE_LIVRAISON],
      ID_Client: row[COLUMNS.ID_CLIENT],
      Total_livraison: row[COLUMNS.TOTAL_LIVRAISON],
      Statut_L: row[COLUMNS.STATUT_L]
    };
  } catch (error) {
    console.error(`Erreur lors de la récupération de la livraison ${id}:`, error);
    throw new Error(`Erreur lors de la récupération de la livraison: ${error.message}`);
  }
};

// =====================
// 3) getLivraisonsData
// =====================
module.exports.getLivraisonsData = async () => {
  try {
    console.log('🔍 Récupération de toutes les livraisons...');
    const rows = await getSheetValues(LIVRAISONS_RANGE);
    if (!rows.length) {
      console.log('Aucune livraison trouvée');
      return [];
    }

    // Plage de dates : 3 mois en arrière
    const { start, end, formatDate } = DateUtils.getDateRange(3);

    // Filtrer + formater
    const deliveries = rows
      .filter(row => row && row.length >= 5)
      .map((row, index) => {
        return {
          ID_Livraison: row[COLUMNS.ID_LIVRAISON] || '',
          Date_Livraison: row[COLUMNS.DATE_LIVRAISON] || '',
          ID_Client: row[COLUMNS.ID_CLIENT] || '',
          Total_livraison: row[COLUMNS.TOTAL_LIVRAISON] || '0',
          Statut_L: row[COLUMNS.STATUT_L] || 'En cours'
        };
      })
      .filter(delivery => {
        if (!delivery.ID_Livraison || !delivery.Date_Livraison) {
          return false;
        }
        // Contrôle du format + conversion
        const isoDate = DateUtils.convertToISODate(delivery.Date_Livraison);
        if (!isoDate) {
          return false;
        }
        // Vérif dans la plage (start->end) + statut = 'En cours'
        return isoDate >= DateUtils.formatDate(start) 
            && isoDate <= DateUtils.formatDate(end)
            && delivery.Statut_L === 'En cours';
      });

    console.log(`✅ ${deliveries.length} livraisons \"En cours\" récupérées (3 derniers mois)`);
    return deliveries;
  } catch (error) {
    console.error('❌ Erreur détaillée lors de la récupération des livraisons:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw new Error(`Erreur lors de la récupération des livraisons: ${error.message}`);
  }
};

// =====================
// 4) getLivraisonsByClientCurrentMonth
// =====================
module.exports.getLivraisonsByClientCurrentMonth = async (clientId) => {
  try {
    console.log(`🔍 Début récupération livraisons client ${clientId}`);

    // Puisque nous sommes dans le même service, on appelle la fonction interne
    const allLivraisons = await this.getLivraisonsData();
    console.log(`📊 Total livraisons récupérées: ${allLivraisons.length}`);

    if (!Array.isArray(allLivraisons)) {
      console.error('❌ Format invalide des livraisons:', allLivraisons);
      throw new Error('Format de données invalide');
    }

    const clientLivraisons = allLivraisons.filter(liv => {
      if (!liv || !liv.ID_Client) {
        return false;
      }
      return liv.ID_Client === clientId;
    });

    console.log(`✅ ${clientLivraisons.length} livraisons trouvées pour client ${clientId}`);
    clientLivraisons.forEach((liv, idx) => {
      console.log(`📦 Livraison ${idx + 1}:`, {
        ID: liv.ID_Livraison,
        Date: liv.Date_Livraison,
        Total: liv.Total_livraison
      });
    });

    return clientLivraisons;
  } catch (error) {
    console.error(`❌ Erreur récupération livraisons client ${clientId}:`, error);
    throw new Error(`Erreur récupération livraisons client: ${error.message}`);
  }
};

// =====================
// 5) addLivraison
// =====================
/**
 * Ajoute une livraison (nouveau ou ancien format)
 */
module.exports.addLivraison = async (livraisonData) => {
  try {
    console.log('Début du traitement de la nouvelle livraison:', livraisonData);
    
    const isNewFormat = 'clientName' in livraisonData;
    console.log('📝 [livraisonsService] Format détecté:', isNewFormat ? 'nouveau' : 'ancien');
    this.validateLivraisonData(livraisonData);

    if (isNewFormat) {
      console.log('📝 [livraisonsService] Format détecté: nouveau');
      
      const formattedResult = await handleNewFormatLivraison(
        livraisonData,
        this.generateLivraisonId,
        sheets,
        spreadsheetId
      );

      console.log('✅ [livraisonsService] Résultat brut:', formattedResult); // Vérifie la structure du résultat avant de le retourner

      return formattedResult; // Retourne le résultat brut directement
      
    } else {
      return await handleOldFormatLivraison(livraisonData, sheets, spreadsheetId);
    }

  } catch (error) {
    console.error('Erreur lors de la création de la livraison:', error);
    throw new Error(`Erreur lors de la création de la livraison: ${error.message}`);
  }
};

// =====================
// 6) updateLivraison
// =====================
module.exports.updateLivraison = async (id, livraisonData) => {
  try {
    console.log(`Mise à jour de la livraison ${id}:`, livraisonData);
    const isNewFormat = 'clientName' in livraisonData;

    if (isNewFormat) {
      return await handleUpdateLivraisonNewFormat(id, livraisonData, sheets, spreadsheetId);
    } else {
      return await handleUpdateLivraisonOldFormat(id, livraisonData, sheets, spreadsheetId);
    }
  } catch (error) {
    console.error(`Erreur lors de la mise à jour de la livraison ${id}:`, error);
    throw new Error(`Erreur lors de la mise à jour de la livraison: ${error.message}`);
  }
};

// =====================
// 7) deleteLivraison
// =====================
module.exports.deleteLivraison = async (id) => {
  try {
    console.log(`Suppression de la livraison ${id}`);

    const rows = await getSheetValues(LIVRAISONS_RANGE);
    if (!rows.length) {
      throw new Error('Aucune donnée trouvée');
    }
    const rowIndex = rows.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
    if (rowIndex === -1) {
      throw new Error(`Livraison ${id} non trouvée`);
    }

    // On efface la ligne (5 colonnes)
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Livraisons!A${rowIndex + 2}:E${rowIndex + 2}`,
      valueInputOption: 'RAW',
      resource: {
        values: [['', '', '', '', '']]
      },
    });

    console.log(`Livraison ${id} supprimée avec succès`);
  } catch (error) {
    console.error(`Erreur lors de la suppression de la livraison ${id}:`, error);
    throw new Error(`Erreur lors de la suppression de la livraison: ${error.message}`);
  }
};

// =====================
// 8) validateLivraisonData
// =====================

// Nouveau helper pour les validations Odoo
const validateOdooData = (livraisonData) => {
  if (!livraisonData.clientId) {
    console.error('❌ [livraisonsService] ID client requis pour Odoo');
    return false;
  }

  if (!livraisonData.produits?.every(p => p.id)) {
    console.error('❌ [livraisonsService] IDs produits requis pour Odoo');
    return false;
  }

  return true;
};

module.exports.validateLivraisonData = (livraisonData) => {
  try {
    if (!livraisonData) {
      console.error('❌ [livraisonsService] Données nulles ou undefined');
      return false;
    }

    const isNewFormat = 'clientName' in livraisonData;
    console.log('📝 [livraisonsService] Format détecté:', isNewFormat ? 'nouveau' : 'ancien');

    if (isNewFormat) {
      // 1. Validation nouveau format (existant)
      if (!livraisonData.clientName || !livraisonData.clientId) {
        console.error('❌ [livraisonsService] Client invalide');
        return false;
      }
      if (!Array.isArray(livraisonData.produits) || !livraisonData.produits.length) {
        console.error('❌ [livraisonsService] Produits manquants ou format invalide');
        return false;
      }
      // 2. Validation des produits
      const produitsValides = livraisonData.produits.every(p => {
        const isValid = p.id && p.nom && typeof p.quantite === 'number'
          && typeof p.prix_unitaire === 'number' && typeof p.total === 'number';
        if (!isValid) {
          console.error('❌ [livraisonsService] Produit invalide:', p);
        }
        return isValid;
      });
      if (!produitsValides) {
        console.error('❌ [livraisonsService] Données produits invalides');
        return false;
      }

      // 3. Validation Odoo (nouveau helper)
      if (!validateOdooData(livraisonData)) {
        return false;
      }

      console.log('✅ [livraisonsService] Validation réussie');
      return true;
    }

    // Ancien format : validations minimales
    return true;
  } catch (error) {
    console.error('❌ [livraisonsService] Erreur validation:', error);
    return false;
  }
};

// =====================
// 9) convertIntentionToLivraisonData
// =====================
module.exports.convertIntentionToLivraisonData = async (intentionDetails) => {
  try {
    console.log('🔄 [livraisonsService] Conversion des données d\'intention en format livraison:', intentionDetails);

    // Vérifier la présence des données requises
    if (!intentionDetails.client || !intentionDetails.produits) {
      throw new Error('Données d\'intention incomplètes');
    }

    // Préparer les données
    const livraisonData = {
      clientName: intentionDetails.client.nom,
      zone: intentionDetails.client.zone || null,
      produits: []
    };

    // Convertir chaque produit
    for (const produit of intentionDetails.produits) {
      let nomProduit = produit.nom;
      if (!nomProduit.includes('L')) {
        nomProduit = `${nomProduit} ${produit.unite || '1L'}`;
      }

      // Vérifier l'existence du produit
      const produitInfo = await productLookupService.findProductByName(nomProduit);
      if (!produitInfo) {
        throw new Error(`Produit non trouvé: ${nomProduit}`);
      }

      livraisonData.produits.push({
        nom: produitInfo.Nom_Produit,
        quantite: parseInt(produit.quantite),
      });
    }

    // Ajouter la date si spécifiée
    if (intentionDetails.date) {
      livraisonData.date = intentionDetails.date;
    }

    console.log('✅ Données converties:', livraisonData);
    return livraisonData;
  } catch (error) {
    console.error('❌ [livraisonsService] Erreur lors de la conversion:', error);
    throw new Error(`Erreur de conversion des données: ${error.message}`);
  }
};