//services/produitsService.js

const googleSheets = require('../config/googleSheetsConfig');

// Constants
const COLUMNS = {
  ID_PRODUIT: 0,
  NOM_PRODUIT: 1,
  PRIX_UNITAIRE: 2,
  CONTENANCE: 3,
  QUANTITE_STOCK: 4
};

class ProduitsService {
  constructor() {
    this.sheetRange = googleSheets.ranges.produits;
  }

  // Validation du produit
  validateProduitData(produitData) {
    if (!produitData || !Array.isArray(produitData) || produitData.length !== 5) {
      throw new Error('Format des données du produit invalide');
    }

    if (!produitData[COLUMNS.ID_PRODUIT]) {
      throw new Error('ID produit requis');
    }

    if (!produitData[COLUMNS.NOM_PRODUIT] || produitData[COLUMNS.NOM_PRODUIT].trim() === '') {
      throw new Error('Nom du produit requis');
    }

    if (!googleSheets.validateNumber(produitData[COLUMNS.PRIX_UNITAIRE], { min: 0 })) {
      throw new Error('Prix unitaire invalide');
    }

    if (!googleSheets.validateNumber(produitData[COLUMNS.QUANTITE_STOCK], { min: 0, allowZero: true })) {
      throw new Error('Quantité en stock invalide');
    }

    return true;
  }

async getProduitsData() {
  try {
    console.log('🔍 (produitsService) Récupération des données produits...');
    const values = await googleSheets.getValue(this.sheetRange);
    if (!values || values.length <= 1) return []; // Tenir compte de l'en-tête

    // Retourner les données sans l'en-tête
    return values.slice(1).map((row, index) => ({
      rowIndex: index + 2, // +2 pour tenir compte de l'en-tête et de l'indexation commençant à 0
      ID_Produit: row[COLUMNS.ID_PRODUIT],
      Nom_Produit: row[COLUMNS.NOM_PRODUIT],
      Prix_Unitaire: parseFloat((row[COLUMNS.PRIX_UNITAIRE] || '0').toString().replace(',', '.')) || 0,
      Contenance: row[COLUMNS.CONTENANCE],
      Quantite_Stock: parseInt(row[COLUMNS.QUANTITE_STOCK], 10)
    }));
  } catch (error) {
    console.error('(produitsService) Erreur lors de la récupération des produits:', error);
    throw new Error('(produitsService)Erreur lors de la récupération des produits');
  }
}

// Ajout de la fonction getProduitByNom dans produitsService.js

async getProduitByNom(nomProduit) {
  try {
    const produits = await this.getProduitsData(); // Récupère tous les produits
    return produits.find(produit => produit.Nom_Produit === nomProduit) || null; // Retourne le produit correspondant ou null si introuvable
  } catch (error) {
    console.error(`Erreur lors de la recherche du produit avec le nom ${nomProduit}:`, error);
    throw new Error(`Erreur lors de la recherche du produit: ${error.message}`);
  }
}


async updateProduitByRow(rowIndex, produitData) {
  try {
    this.validateProduitData(produitData);

    const range = `Produits!A${rowIndex}:E${rowIndex}`;
    return await googleSheets.updateValue(range, produitData);
  } catch (error) {
    console.error('Erreur lors de la mise à jour du produit:', error);
    throw new Error(`Erreur lors de la mise à jour du produit: ${error.message}`);
  }
}

  async addProduit(produitData) {
    try {
      this.validateProduitData(produitData);

      // Vérifier si l'ID existe déjà
      const existingProduits = await this.getProduitsData();
      if (existingProduits.some(p => p.ID_Produit === produitData[COLUMNS.ID_PRODUIT])) {
        throw new Error(`Un produit avec l'ID ${produitData[COLUMNS.ID_PRODUIT]} existe déjà`);
      }

      return await googleSheets.appendValue(this.sheetRange, produitData);
    } catch (error) {
      console.error('Erreur lors de l\'ajout du produit:', error);
      throw new Error(`Erreur lors de l'ajout du produit: ${error.message}`);
    }
  }

  async updateProduit(id, produitData) {
    try {
      this.validateProduitData(produitData);

      const values = await googleSheets.getValue(this.sheetRange);
      const rowIndex = values.findIndex(row => row[COLUMNS.ID_PRODUIT] === id);

      if (rowIndex === -1) {
        throw new Error(`Produit avec l'ID ${id} non trouvé`);
      }

      const range = `Produits!A${rowIndex + 1}:E${rowIndex + 1}`;
      return await googleSheets.updateValue(range, produitData);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du produit:', error);
      throw new Error(`Erreur lors de la mise à jour du produit: ${error.message}`);
    }
  }

  async deleteProduit(id) {
    try {
      const values = await googleSheets.getValue(this.sheetRange);
      const rowIndex = values.findIndex(row => row[COLUMNS.ID_PRODUIT] === id);

      if (rowIndex === -1) {
        throw new Error(`Produit avec l'ID ${id} non trouvé`);
      }

      const range = `Produits!A${rowIndex + 1}:E${rowIndex + 1}`;
      const emptyRow = Array(Object.keys(COLUMNS).length).fill('');
      return await googleSheets.updateValue(range, emptyRow);
    } catch (error) {
      console.error('Erreur lors de la suppression du produit:', error);
      throw new Error(`Erreur lors de la suppression du produit: ${error.message}`);
    }
  }

  // Générer un nouvel ID de produit unique
  async generateProductId() {
    try {
      const produits = await this.getProduitsData();
      const maxId = produits.reduce((max, produit) => {
        const id = parseInt(produit.ID_Produit.replace('P', ''), 10);
        return id > max ? id : max;
      }, 0);
      console.log('Nouvel ID produit généré:', maxId + 1);
      return `P${(maxId + 1).toString().padStart(4, '0')}`;
    } catch (error) {
      console.error('Erreur lors de la génération de l\'ID produit:', error);
      throw new Error('Erreur lors de la génération de l\'ID produit');
    }
  }
}

// Export d'une instance unique
module.exports = new ProduitsService();