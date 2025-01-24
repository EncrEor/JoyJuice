// Services/livraisonsService.js
const { google } = require('googleapis');
const dotenv = require('dotenv');

dotenv.config();

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

const CONFIG_RANGE = 'Config!A1:B10';

const clientLookupService = require('./clientLookupService');
const productLookupService = require('./productLookupService');
const detailsLivraisonsService = require('./detailsLivraisonsService');

const STATUTS_VALIDES = ['En cours', 'Terminée', 'Annulée'];
const FORMAT_DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const FORMAT_DATE_EXEMPLE = 'dd/mm/yyyy';

// Constantes pour les colonnes
const COLUMNS = {
  ID_LIVRAISON: 0,
  DATE_LIVRAISON: 1,
  ID_CLIENT: 2,
  TOTAL_LIVRAISON: 3,
  STATUT_L: 4
};

// Générer un nouvel ID de livraison
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
      // Chercher la ligne 'LAST_LIVRAISON_ID'
      const configRow = configResult.data.values.findIndex(row => row[0] === 'LAST_LIVRAISON_ID');
      if (configRow !== -1) {
        lastId = parseInt(configResult.data.values[configRow][1], 10);
        configRowIndex = configRow + 1;
      }
    }

    // 2. Incrémenter et mettre à jour le compteur
    const newId = lastId + 1;

    // Mise à jour atomique du compteur
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

// Récupérer une livraison par ID
module.exports.getLivraisonById = async (id) => {
  try {
    console.log(`Récupération de la livraison ${id}`);
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Livraisons!A2:E1000',
    });

    if (!result.data.values) {
      console.log('Aucune livraison trouvée');
      return null;
    }

    const livraison = result.data.values.find(row => row[COLUMNS.ID_LIVRAISON] === id);

    if (!livraison) {
      console.log(`Livraison ${id} non trouvée`);
      return null;
    }

    return {
      ID_Livraison: livraison[COLUMNS.ID_LIVRAISON],
      Date_Livraison: livraison[COLUMNS.DATE_LIVRAISON],
      ID_Client: livraison[COLUMNS.ID_CLIENT],
      Total_livraison: livraison[COLUMNS.TOTAL_LIVRAISON],
      Statut_L: livraison[COLUMNS.STATUT_L]
    };
  } catch (error) {
    console.error(`Erreur lors de la récupération de la livraison ${id}:`, error);
    throw new Error(`Erreur lors de la récupération de la livraison: ${error.message}`);
  }
};

// Récupérer toutes les livraisons
module.exports.getLivraisonsData = async () => {
  try {
    console.log('🔍 Récupération de toutes les livraisons...');
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Livraisons!A2:E1000',
    });

    if (!result.data.values) {
      console.log('Aucune livraison trouvée');
      return [];
    }

    // Calculer la date d'il y a 3 mois
    const today = new Date();
    const threeMonthsAgo = new Date(today.setMonth(today.getMonth() - 3));
    today.setMonth(today.getMonth() + 3); // Réinitialiser aujourd'hui

    // Formater et filtrer les données
    const deliveries = result.data.values
      .filter(row => row && row.length >= 5)
      .map((row, index) => {
        const delivery = {
          ID_Livraison: row[COLUMNS.ID_LIVRAISON]?.toString() || '',
          Date_Livraison: row[COLUMNS.DATE_LIVRAISON]?.toString() || '',
          ID_Client: row[COLUMNS.ID_CLIENT]?.toString() || '',
          Total_livraison: row[COLUMNS.TOTAL_LIVRAISON]?.toString() || '0',
          Statut_L: row[COLUMNS.STATUT_L]?.toString() || 'En cours'
        };

        // Valider les champs requis
        if (!delivery.ID_Livraison || !delivery.Date_Livraison) {
          console.error(`❌ Livraison invalide à l'index ${index}:`, delivery);
          return null;
        }

        return delivery;
      })
      .filter(delivery => {
        if (!delivery) return false;

        // Convertir la date de livraison
        try {
          const [day, month, year] = delivery.Date_Livraison.split('/');
          const deliveryDate = new Date(year, month - 1, day);

          // Filtrer par date (3 derniers mois) et statut
          return deliveryDate >= threeMonthsAgo &&
            deliveryDate <= today &&
            delivery.Statut_L === 'En cours';
        } catch (error) {
          console.error(`❌ Format de date invalide:`, delivery);
          return false;
        }
      });
    console.log(`✅ ${deliveries.length} livraisons "En cours" récupérées (3 derniers mois)`);
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

// Récupérer les livraisons d'un client pour le mois en cours
module.exports.getLivraisonsByClientCurrentMonth = async (clientId) => {
  try {
    console.log(`🔍 Début récupération livraisons client ${clientId}`);

    const allLivraisons = await this.getLivraisonsData();
    console.log(`📊 Total livraisons récupérées: ${allLivraisons.length}`);

    if (!Array.isArray(allLivraisons)) {
      console.error('❌ Format invalide des livraisons:', allLivraisons);
      throw new Error('Format de données invalide');
    }

    const clientLivraisons = allLivraisons.filter(livraison => {
      if (!livraison || !livraison.ID_Client) {
        console.warn('⚠️ Livraison invalide détectée:', livraison);
        return false;
      }
      return livraison.ID_Client === clientId;
    });

    console.log(`✅ ${clientLivraisons.length} livraisons trouvées pour client ${clientId}`);

    // Log détaillé des livraisons trouvées
    clientLivraisons.forEach((liv, index) => {
      console.log(`📦 Livraison ${index + 1}:`, {
        ID: liv.ID_Livraison,
        Date: liv.Date_Livraison,
        Total: liv.Total_livraison
      });
    });

    return clientLivraisons;
  } catch (error) {
    console.error(`❌ Erreur récupération livraisons client ${clientId}:`, error);
    console.error('Stack:', error.stack);
    throw new Error(`Erreur récupération livraisons client: ${error.message}`);
  }
};
// ***
// Ajouter une nouvelle livraison
// ***
module.exports.addLivraison = async (livraisonData) => {
  try {
    console.log('Début du traitement de la nouvelle livraison:', livraisonData);

    // 1. Détection du format et validation
    const isNewFormat = 'clientName' in livraisonData;
    console.log('Format détecté:', isNewFormat ? 'nouveau' : 'ancien');

    // Validation des données
    this.validateLivraisonData(livraisonData);

    // 2. Traitement selon le format
    if (isNewFormat) {

      // 2.b Génération de l'ID et vérification d'unicité
      const newLivraisonId = await this.generateLivraisonId();


      // Vérification que l'ID n'existe pas déjà
      const existingLivraisons = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Livraisons!A:E',
      });
      const idExists = existingLivraisons.data.values?.some(
        liv => liv[COLUMNS.ID_LIVRAISON] === newLivraisonId
      );
      if (idExists) {
        console.error(`Tentative de création avec un ID déjà existant: ${newLivraisonId}`);
        throw new Error('Erreur de génération d\'ID. Veuillez réessayer.');
      }

      // Gestion de la date
      const dateNow = new Date();
      const formattedDate = livraisonData.date ||
        `${dateNow.getDate().toString().padStart(2, '0')}/${(dateNow.getMonth() + 1).toString().padStart(2, '0')}/${dateNow.getFullYear()}`;

        console.log('💰 Données produits avant calcul total:', {
          produits: livraisonData.produits,
          premierProduit: livraisonData.produits[0]
        });

// 2.c Traitement des produits
let totalLivraison = 0;
const details = livraisonData.produits
  .filter(produit => produit.quantite > 0)  // Ajout du filtre ici
  .map(produit => {
    totalLivraison += produit.total;
    return {
      ID_Detail: `${newLivraisonId}-${produit.id}`,
      ID_Livraison: newLivraisonId,
      ID_Produit: produit.id,
      Quantite: produit.quantite.toString(),
      Prix_Unit: produit.prix_unitaire.toString(),
      Total_Ligne: produit.total.toString()
    };
  });

  console.log('📋 Préparation livraison:', {
    newLivraisonId,
    formattedDate,
    clientId: livraisonData.clientId,
    totalLivraison: totalLivraison.toString(),
    etape: 'Avant création'
  });

      // 2.d Création du tableau pour Google Sheets
      const livraisonRow = [
        newLivraisonId,
        formattedDate,
        livraisonData.clientId,  // Utiliser l'ID client reçu
        totalLivraison.toString(),
        "En cours" // Statut par défaut
      ];

      // 3. Envoi vers Google Sheets
      console.log('Ajout de la livraison dans Google Sheets:', livraisonRow);
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Livraisons!A:E',
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [livraisonRow]
        },
      });

      // 4. Ajout des détails
      console.log('Ajout des détails de livraison:', details);
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

      console.log('Livraison et détails ajoutés avec succès');
      return {
        status: 'success',
        livraison_id: newLivraisonId,
        total: totalLivraison,
        details: details
      };

    } else {
      // Ancien format - conserver la logique existante
      console.log('Traitement de l\'ancien format de livraison');
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

  } catch (error) {
    console.error('Erreur lors de la création de la livraison:', error);
    throw new Error(`Erreur lors de la création de la livraison: ${error.message}`);
  }
};

// Mettre à jour une livraison existante
module.exports.updateLivraison = async (id, livraisonData) => {
  try {
    console.log(`Mise à jour de la livraison ${id}:`, livraisonData);

    // Détection du format
    const isNewFormat = 'clientName' in livraisonData;
    console.log('Format détecté:', isNewFormat ? 'nouveau' : 'ancien');

    if (isNewFormat) {
      // 1. Recherche de la ligne de la livraison
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Livraisons!A2:E1000',
      });

      if (!result.data.values) {
        throw new Error('Aucune donnée trouvée');
      }

      const rowIndex = result.data.values.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
      if (rowIndex === -1) {
        throw new Error(`Livraison ${id} non trouvée`);
      }

      // 2.c Traitement des produits sans nouvelle recherche
      let totalLivraison = 0;
      const details = livraisonData.produits.map(produit => {
        totalLivraison += produit.total; // Utilise le total déjà calculé

        return {
          ID_Detail: `${newLivraisonId}-${produit.id}`,
          ID_Livraison: newLivraisonId,
          ID_Produit: produit.id,
          Quantite: produit.quantite,
          Prix_Unit: produit.prix_unitaire,
          Total_Ligne: produit.total
        };
      });

      console.log('Ajout des détails de livraison:', details);

      // 3. Mise à jour de la livraison
      const dateNow = new Date();
      const formattedDate = livraisonData.date ||
        `${dateNow.getDate().toString().padStart(2, '0')}/${(dateNow.getMonth() + 1).toString().padStart(2, '0')}/${dateNow.getFullYear()}`;

      const livraisonArray = [
        id,
        formattedDate,
        livraisonData.clientName,
        totalLivraison.toString(),
        "En cours"
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Livraisons!A${rowIndex + 2}:E${rowIndex + 2}`,
        valueInputOption: 'RAW',
        resource: {
          values: [livraisonArray]
        },
      });

      // 4. Suppression des anciens détails
      await detailsLivraisonsService.deleteDetailsLivraisonById(id);

      // 5. Ajout des nouveaux détails
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
        details: details
      };

    } else {
      // Ancien format
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Livraisons!A2:E1000',
      });

      if (!result.data.values) {
        throw new Error('Aucune donnée trouvée');
      }

      const rowIndex = result.data.values.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
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

      return {
        status: 'success'
      };
    }
  } catch (error) {
    console.error(`Erreur lors de la mise à jour de la livraison ${id}:`, error);
    throw new Error(`Erreur lors de la mise à jour de la livraison: ${error.message}`);
  }
};

// Supprimer une livraison
module.exports.deleteLivraison = async (id) => {
  try {
    console.log(`Suppression de la livraison ${id}`);

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Livraisons!A2:E1000',
    });

    if (!result.data.values) {
      throw new Error('Aucune donnée trouvée');
    }

    const rowIndex = result.data.values.findIndex(row => row[COLUMNS.ID_LIVRAISON] === id);
    if (rowIndex === -1) {
      throw new Error(`Livraison ${id} non trouvée`);
    }

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

// Validation des données de la livraison
module.exports.validateLivraisonData = (livraisonData) => {
  try {
    //console.log("🔍 [livraisonsService] Validation données:", livraisonData);

    // Validation structure
    if (!livraisonData) {
      console.error("❌ [livraisonsService] Données nulles ou undefined");
      return false;
    }

    const isNewFormat = 'clientName' in livraisonData;
    console.log('📝 Format:', isNewFormat ? 'nouveau' : 'ancien');

    if (isNewFormat) {
      // Validation du nouveau format
      if (!livraisonData.clientName || !livraisonData.clientId) {
        console.error("❌ [livraisonsService] Client invalide");
        return false;
      }

      if (!Array.isArray(livraisonData.produits) || !livraisonData.produits.length) {
        console.error("❌ [livraisonsService] Produits manquants ou format invalide");
        return false;
      }

      // Validation produits
      const produitsValides = livraisonData.produits.every(p => {
        const isValid = p.id && p.nom && typeof p.quantite === 'number' && 
                       typeof p.prix_unitaire === 'number' && typeof p.total === 'number';
        
        if (!isValid) {
          console.error("❌ [livraisonsService] Produit invalide:", p);
        }
        return isValid;
      });

      if (!produitsValides) {
        console.error("❌ [livraisonsService] Données produits invalides");
        return false;
      }

      console.log("✅ [livraisonsService] Validation réussie");
      return true;
    }

    return false;
  } catch (error) {
    console.error("❌ [livraisonsService] Erreur validation:", error);
    return false; 
  }
};

// Convertir les données d'intention en format livraison
module.exports.convertIntentionToLivraisonData = async (intentionDetails) => {
  try {
    console.log('🔄 Conversion des données d\'intention en format livraison:', intentionDetails);

    // Vérifier la présence des données requises
    if (!intentionDetails.client || !intentionDetails.produits) {
      throw new Error('Données d\'intention incomplètes');
    }

    // Préparer les données au format attendu par addLivraison
    const livraisonData = {
      clientName: intentionDetails.client.nom,
      zone: intentionDetails.client.zone || null,
      produits: []
    };

    // Convertir chaque produit
    for (const produit of intentionDetails.produits) {
      // Normaliser le nom du produit
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
        nom: produitInfo.Nom_Produit, // Utiliser le nom exact de la base
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
    console.error('❌ Erreur lors de la conversion:', error);
    throw new Error(`Erreur de conversion des données: ${error.message}`);
  }
};


