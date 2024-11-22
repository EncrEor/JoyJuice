// Services/detailsLivraisonsService.js
const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Constantes pour les colonnes
const COLUMNS = {
  ID_DETAIL_LIVRAISON: 0,
  ID_LIVRAISON: 1,
  ID_PRODUIT: 2,
  QUANTITE: 3,
  PRIX_UNIT_LIVRAISON: 4,
  TOTAL_LIGNE: 5
};

// Récupérer tous les détails de livraisons
module.exports.getDetailsLivraisonsDataCurrentMonth = async () => {
  try {
    console.log('Récupération des détails de livraisons');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DetailsLivraisons!A2:F1000', // Skip header
    });

    if (!result.data.values) {
      console.log('Aucun détail de livraison trouvé');
      return [];
    }

    console.log(`${result.data.values.length} détails de livraisons récupérés`);
    return result.data.values;
  } catch (error) {
    console.error('Erreur lors de la récupération des détails de livraison:', error);
    throw new Error(`Erreur lors de la récupération des détails de livraison: ${error.message}`);
  }
};

// Récupérer les détails d'une livraison spécifique
module.exports.getDetailsLivraisonById = async (livraisonId) => {
  try {
    console.log(`🔍 Recherche détails livraison: ${livraisonId}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DetailsLivraisons!A2:F1000',
    });

    if (!result.data.values) {
      console.log(`Aucun détail trouvé pour la livraison ${livraisonId}`);
      return [];
    }

    const details = result.data.values
      .filter(detail => detail && detail.length >= 6 && detail[COLUMNS.ID_LIVRAISON] === livraisonId)
      .map(detail => ({
        ID_Detail_Livraison: detail[COLUMNS.ID_DETAIL_LIVRAISON]?.toString() || '',
        ID_Livraison: detail[COLUMNS.ID_LIVRAISON]?.toString() || '',
        ID_Produit: detail[COLUMNS.ID_PRODUIT]?.toString() || '',
        Quantite: parseFloat(detail[COLUMNS.QUANTITE]) || 0,
        prix_unit_livraison: parseFloat(detail[COLUMNS.PRIX_UNIT_LIVRAISON]) || 0,
        Total_Ligne: parseFloat(detail[COLUMNS.TOTAL_LIGNE]) || 0
      }));

    console.log(`✅ ${details.length} détails trouvés pour livraison ${livraisonId}`);
    return details;
  } catch (error) {
    console.error(`❌ Erreur détails livraison ${livraisonId}:`, error);
    throw new Error(`Erreur détails livraison: ${error.message}`);
  }
};

// Ajouter un détail de livraison
module.exports.addDetailsLivraison = async (detailData) => {
  try {
    console.log('Ajout d\'un nouveau détail de livraison:', detailData);
    
    if (!detailData || detailData.length !== 6) {
      throw new Error('Données de détail de livraison invalides');
    }

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'DetailsLivraisons!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [detailData]
      },
    });

    console.log('Détail de livraison ajouté avec succès');
    return result.data;
  } catch (error) {
    console.error('Erreur lors de l\'ajout du détail de livraison:', error);
    throw new Error(`Erreur lors de l'ajout du détail de livraison: ${error.message}`);
  }
};

// Supprimer les détails d'une livraison
module.exports.deleteDetailsLivraisonById = async (livraisonId) => {
  try {
    console.log(`Suppression des détails pour la livraison ${livraisonId}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DetailsLivraisons!A2:F1000',
    });

    if (!result.data.values) {
      console.log('Aucun détail à supprimer');
      return;
    }

    // Trouver toutes les lignes à supprimer
    const rowsToUpdate = [];
    result.data.values.forEach((row, index) => {
      if (row[COLUMNS.ID_LIVRAISON] === livraisonId) {
        rowsToUpdate.push({
          range: `DetailsLivraisons!A${index + 2}:F${index + 2}`,
          values: [['', '', '', '', '', '']]
        });
      }
    });

    if (rowsToUpdate.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: rowsToUpdate
        }
      });
    }

    console.log(`${rowsToUpdate.length} détails supprimés pour la livraison ${livraisonId}`);
  } catch (error) {
    console.error(`Erreur lors de la suppression des détails de la livraison ${livraisonId}:`, error);
    throw new Error(`Erreur lors de la suppression des détails de la livraison: ${error.message}`);
  }
};

// À ajouter à la fin du fichier, avant le dernier module.exports

// Récupérer un détail spécifique par son ID
module.exports.getDetailById = async (detailId) => {
  try {
    console.log(`Récupération du détail ${detailId}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DetailsLivraisons!A2:F1000',
    });

    if (!result.data.values) {
      return null;
    }

    const detail = result.data.values.find(row => row[COLUMNS.ID_DETAIL_LIVRAISON] === detailId);
    
    if (!detail) {
      console.log(`Détail ${detailId} non trouvé`);
      return null;
    }

    return {
      ID_Detail_Livraison: detail[COLUMNS.ID_DETAIL_LIVRAISON],
      ID_Livraison: detail[COLUMNS.ID_LIVRAISON],
      ID_Produit: detail[COLUMNS.ID_PRODUIT],
      Quantite: detail[COLUMNS.QUANTITE],
      prix_unit_livraison: detail[COLUMNS.PRIX_UNIT_LIVRAISON],
      Total_Ligne: detail[COLUMNS.TOTAL_LIGNE]
    };
  } catch (error) {
    console.error(`Erreur lors de la récupération du détail ${detailId}:`, error);
    throw new Error(`Erreur lors de la récupération du détail: ${error.message}`);
  }
};

// Mettre à jour un détail spécifique
module.exports.updateDetailLivraison = async (detailId, detailData) => {
  try {
    console.log(`Mise à jour du détail ${detailId}:`, detailData);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'DetailsLivraisons!A2:F1000',
    });

    if (!result.data.values) {
      throw new Error('Aucune donnée trouvée');
    }

    const rowIndex = result.data.values.findIndex(row => 
      row[COLUMNS.ID_DETAIL_LIVRAISON] === detailId
    );

    if (rowIndex === -1) {
      throw new Error(`Détail ${detailId} non trouvé`);
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `DetailsLivraisons!A${rowIndex + 2}:F${rowIndex + 2}`,
      valueInputOption: 'RAW',
      resource: {
        values: [detailData]
      },
    });

    console.log(`Détail ${detailId} mis à jour avec succès`);
  } catch (error) {
    console.error(`Erreur lors de la mise à jour du détail ${detailId}:`, error);
    throw new Error(`Erreur lors de la mise à jour du détail: ${error.message}`);
  }
};

// Vérifier l'existence d'un produit dans une livraison
module.exports.checkProduitInLivraison = async (livraisonId, produitId) => {
  try {
    const details = await this.getDetailsLivraisonById(livraisonId);
    return details.some(detail => detail.ID_Produit === produitId);
  } catch (error) {
    console.error(`Erreur lors de la vérification du produit ${produitId} dans la livraison ${livraisonId}:`, error);
    throw new Error(`Erreur lors de la vérification du produit: ${error.message}`);
  }
};

// Calculer le total d'une livraison à partir de ses détails
module.exports.calculateLivraisonTotal = async (livraisonId) => {
  try {
    const details = await this.getDetailsLivraisonById(livraisonId);
    return details.reduce((total, detail) => 
      total + parseFloat(detail.Total_Ligne), 0
    );
  } catch (error) {
    console.error(`Erreur lors du calcul du total pour la livraison ${livraisonId}:`, error);
    throw new Error(`Erreur lors du calcul du total: ${error.message}`);
  }
};

// Vérifier la cohérence des données d'une livraison
module.exports.verifyLivraisonIntegrity = async (livraisonId) => {
  try {
    const details = await this.getDetailsLivraisonById(livraisonId);
    let isValid = true;
    const errors = [];

    for (const detail of details) {
      // Vérifier que chaque ligne a un total cohérent
      const calculatedTotal = parseFloat(detail.Quantite) * parseFloat(detail.prix_unit_livraison);
      if (Math.abs(calculatedTotal - parseFloat(detail.Total_Ligne)) > 0.01) {
        isValid = false;
        errors.push(`Total incorrect pour le produit ${detail.ID_Produit}`);
      }

      // Vérifier que les quantités sont positives
      if (parseFloat(detail.Quantite) <= 0) {
        isValid = false;
        errors.push(`Quantité invalide pour le produit ${detail.ID_Produit}`);
      }
    }

    return {
      isValid,
      errors
    };
  } catch (error) {
    console.error(`Erreur lors de la vérification de l'intégrité de la livraison ${livraisonId}:`, error);
    throw new Error(`Erreur lors de la vérification de l'intégrité: ${error.message}`);
  }
};

module.exports.validateDetailLivraisonData = (detailData) => {
  if (!detailData.ID_Produit || !detailData.Quantite || 
      !detailData.prix_unit_livraison || !detailData.Total_Ligne) {
    throw new Error('Données de détail de livraison incomplètes');
  }

  const quantite = parseFloat(detailData.Quantite);
  const prixUnit = parseFloat(detailData.prix_unit_livraison);
  const totalLigne = parseFloat(detailData.Total_Ligne);

  if (isNaN(quantite) || quantite <= 0) {
    throw new Error('La quantité doit être un nombre positif');
  }

  if (isNaN(prixUnit) || prixUnit <= 0) {
    throw new Error('Le prix unitaire doit être un nombre positif');
  }

  if (isNaN(totalLigne) || Math.abs(quantite * prixUnit - totalLigne) > 0.01) {
    throw new Error('Le total ligne ne correspond pas au calcul');
  }

  return true;
};  