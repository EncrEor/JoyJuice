// Services/livraisonsFormat.js

const detailsLivraisonsService = require('./detailsLivraisonsService');
const { COLUMNS } = require('./livraisonsService');
const odooSalesService = require('./odooSalesService');
const produitsService = require('./produitsService'); // Pour getProductOdooId

/**
 * Gère l'ajout d'une livraison (nouveau format).
 * @param {Object} livraisonData - Données de livraison
 * @param {Function} generateLivraisonId - Fonction pour générer un nouvel ID (appelée depuis livraisonsService)
 * @param {Object} sheets - Instance Google Sheets
 * @param {string} spreadsheetId - ID du Google Spreadsheet
 */

async function rollbackGoogleSheets(livraisonId, sheets, spreadsheetId) {
  try {
    console.log('🔄 [livraisonsFormat] Rollback Google Sheets pour livraison:', livraisonId);

    // Suppression de la ligne livraison
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `Livraisons!A${livraisonId}:F${livraisonId}`,
    });

    // Suppression des détails
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `DetailsLivraisons!A${livraisonId}:F${livraisonId}`,
    });

  } catch (rollbackError) {
    console.error('❌ Erreur rollback:', rollbackError);
  }
}

async function handleNewFormatLivraison(livraisonData, generateLivraisonId, sheets, spreadsheetId) {
  try {
    console.log('[livraisonsFormat] Début traitement nouvelle livraison:', livraisonData);

    // 1. Génération ID et mapping initial
    const newLivraisonId = await generateLivraisonId();
    
    // 2. Préparation pour Odoo
    console.log('[livraisonsFormat] Préparation données Odoo...');
    const odooProducts = [];
    let totalLivraison = 0;
    const details = [];

    // 3. Mapping des produits
    for (const produit of livraisonData.produits) {
      if (produit.quantite <= 0) continue;

      const odooId = await produitsService.getProductOdooId(produit.id);
      odooProducts.push({
        id: odooId,
        quantite: produit.quantite
      });

      totalLivraison += produit.total;
      details.push({
        ID_Detail: `${newLivraisonId}-${produit.id}`,
        ID_Livraison: newLivraisonId,
        ID_Produit: produit.id,
        Quantite: produit.quantite.toString(),
        Prix_Unit: produit.prix_unitaire.toString(),
        Total_Ligne: produit.total.toString()
      });
    }

    // 4. Création devis Odoo
    const odooResult = await odooSalesService.createQuotation(
      { id: livraisonData.clientId },
      odooProducts
    );

    if (!odooResult.success) {
      throw new Error('Échec création devis Odoo');
    }

    try {
      // 5. Création dans Google Sheets
      const livraisonRow = [
        newLivraisonId,
        livraisonData.date,
        livraisonData.clientId,
        totalLivraison.toString(),
        'En cours',
        odooResult.orderId
      ];

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Livraisons!A:F',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: { values: [livraisonRow] }
      });

      // 6. Ajout des détails
      for (const detail of details) {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'DetailsLivraisons!A:F',
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          resource: {
            values: [[
              detail.ID_Detail,
              detail.ID_Livraison, 
              detail.ID_Produit,
              detail.Quantite,
              detail.Prix_Unit,
              detail.Total_Ligne
            ]]
          }
        });
      }

      // 7. Retour du résultat global
      const result = {
        success: true,
        status: 'SUCCESS',
        type: 'DELIVERY',
        client: {
          Nom_Client: livraisonData.clientName,  
          Zone: livraisonData.zone,
          ID_Client: livraisonData.clientId
        },
        livraison: {
          id: newLivraisonId,
          odoo_id: odooResult.orderId,
          total: odooResult.total,
          details: details
        },
        message: `Livraison ${newLivraisonId} créée avec succès pour ${livraisonData.clientName}`
      };
      
      console.log('[livraisonsFormat] Retour structuré:', result);
      return result;

    } catch (sheetsError) {
      console.error('[livraisonsFormat] Erreur Google Sheets:', sheetsError);
      // TODO: Ajouter rollback Odoo si nécessaire
      throw new Error(`Erreur Google Sheets: ${sheetsError.message}`);
    }

  } catch (error) {
    console.error('[livraisonsFormat] Erreur globale:', error);
    throw error;
  }
}

/**
 * Gère l'ajout d'une livraison (ancien format).
 */
async function handleOldFormatLivraison(livraisonData, sheets, spreadsheetId) {
  const result = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: 'Livraisons!A:E',
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [livraisonData]
    },
  });
  return result.data;
}

/**
 * Met à jour une livraison (nouveau format).
 * @param {string} id - ID de la livraison
 * @param {Object} livraisonData - Données de livraison
 * @param {Object} sheets - Instance Google Sheets
 * @param {string} spreadsheetId - ID du Google Spreadsheet
 */
async function handleUpdateLivraisonNewFormat(id, livraisonData, sheets, spreadsheetId) {
  // 1. Récupération de la livraison pour trouver la ligne
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Livraisons!A2:E1000',
  });

  const rows = existing.data.values || [];
  const rowIndex = rows.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
  if (rowIndex === -1) {
    throw new Error(`[livraisonsFormat] Livraison ${id} non trouvée`);
  }

  // 2. Calcul du nouveau total et préparation des détails
  let totalLivraison = 0;
  const details = livraisonData.produits.map(prod => {
    totalLivraison += prod.total;
    return {
      ID_Detail: `${id}-${prod.id}`,  // On conserve l'ID de livraison = id
      ID_Livraison: id,
      ID_Produit: prod.id,
      Quantite: prod.quantite,
      Prix_Unit: prod.prix_unitaire,
      Total_Ligne: prod.total
    };
  });

  // 3. Mise à jour de la livraison dans la feuille Livraisons
  const now = new Date();
  const dateLivraison = livraisonData.date
    ? livraisonData.date
    : `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const livraisonArray = [
    id,
    dateLivraison,
    livraisonData.clientId || livraisonData.clientName, // votre logique
    totalLivraison.toString(),
    'En cours' // ou garder le statut actuel ?
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Livraisons!A${rowIndex + 2}:E${rowIndex + 2}`,
    valueInputOption: 'RAW',
    resource: {
      values: [livraisonArray]
    },
  });

  // 4. Supprimer les anciens détails
  await detailsLivraisonsService.deleteDetailsLivraisonById(id);

  // 5. Ajouter les nouveaux détails
  for (const detail of details) {
    const detailRow = [
      detail.ID_Detail,
      detail.ID_Livraison,
      detail.ID_Produit,
      detail.Quantite.toString(),
      detail.Prix_Unit.toString(),
      detail.Total_Ligne.toString()
    ];
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'DetailsLivraisons!A:F',
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      resource: {
        values: [detailRow]
      },
    });
  }

  return {
    status: 'success',
    total: totalLivraison,
    details
  };
}

/**
 * Met à jour une livraison (ancien format).
 */
async function handleUpdateLivraisonOldFormat(id, livraisonData, sheets, spreadsheetId) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Livraisons!A2:E1000',
  });

  const rows = existing.data.values || [];
  const rowIndex = rows.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
  if (rowIndex === -1) {
    throw new Error(`Livraison ${id} non trouvée`);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Livraisons!A${rowIndex + 2}:E${rowIndex + 2}`,
    valueInputOption: 'RAW',
    resource: {
      values: [livraisonData]
    },
  });

  return { status: 'success' };
}

module.exports = {
  handleNewFormatLivraison,
  handleOldFormatLivraison,
  handleUpdateLivraisonNewFormat,
  handleUpdateLivraisonOldFormat
};