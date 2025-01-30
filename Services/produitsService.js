const googleSheets = require('../config/googleSheetsConfig');

// Constants
const COLUMNS = {
  ID_PRODUIT: 0,
  NOM_PRODUIT: 1,
  PRIX_UNITAIRE: 2,
  CONTENANCE: 3,
  QUANTITE_STOCK: 4,
  P_IDODOO: 11 // Ajout de la nouvelle colonne
};

class ProduitsService {
  constructor() {
    this.sheetRange = googleSheets.ranges.produits;
  }

  // Validation des données produit
  validateProduitData(produitData) {
    if (!produitData || !Array.isArray(produitData) || produitData.length < Object.keys(COLUMNS).length) {
      throw new Error('Format des données du produit invalide');
    }

    if (!produitData[COLUMNS.ID_PRODUIT]) {
      throw new Error('ID produit requis');
    }

    if (!produitData[COLUMNS.NOM_PRODUIT]?.trim()) {
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

  // Méthode utilitaire pour mapper une ligne de données à un objet produit
  mapRowToProduit(row, index) {
    return {
      rowIndex: index + 2, // +2 pour tenir compte de l'en-tête et de l'indexation 0
      ID_Produit: row[COLUMNS.ID_PRODUIT],
      Nom_Produit: row[COLUMNS.NOM_PRODUIT],
      Prix_Unitaire: parseFloat((row[COLUMNS.PRIX_UNITAIRE] || '0').toString().replace(',', '.')) || 0,
      Contenance: row[COLUMNS.CONTENANCE],
      Quantite_Stock: parseInt(row[COLUMNS.QUANTITE_STOCK], 10),
      P_IDODOO: row[COLUMNS.P_IDODOO] || null
    };
  }

  async getProduitsData() {
    try {
      console.log('🔍 [produitsService] Récupération des données produits...');
      const values = await googleSheets.getValue(this.sheetRange);
      
      // Debug structure données reçues
      console.log('📊 [produitsService] Structure données brutes:', {
        colonnes: values[0], // en-têtes
        exemple: values[1],  // premier produit
        total: values.length
      });
  
      if (!values || values.length <= 1) return [];
  
      const produits = values.slice(1).map(row => {
        const produit = this.mapRowToProduit(row);
        // Debug mapping
        //console.log('🔄 [produitsService] Mapping produit:', {
        //  ID_Produit: produit.ID_Produit,
       //   P_IDODOO: produit.P_IDODOO,
       //   raw: row
       // });
        return produit;
      });
  
      return produits;
    } catch (error) {
      console.error('❌ [produitsService] Erreur récupération produits:', error);
      throw error;
    }
  }

  async getProductOdooId(productId) {
    try {
      console.log(`🔍 [produitsService] Résolution ID Odoo pour produit: ${productId}`);
      const produits = await this.getProduitsData();
  
      // Extraction de la colonne ID_Produit des données 
      console.log('📊 Produits chargés:', produits.map(p => ({
        id: p.ID_Produit,
        nom: p.Nom_Produit,
        odooId: p.P_IDODOO
      })));
  
      // Recherche du produit par ID
      const produit = produits.find(p => p.ID_Produit === productId);
      if (!produit) {
        throw new Error(`Produit ${productId} non trouvé`);
      }
  
      if (!produit.P_IDODOO) {
        throw new Error(`[produitsService] ID Odoo manquant pour ${productId}`);
      }
  
      console.log(`✅ [produitsService] ID Odoo trouvé pour ${productId}:`, produit.P_IDODOO);
      return parseInt(produit.P_IDODOO);
  
    } catch (error) {
      console.error(`❌ [produitsService] Erreur récupération ID Odoo:`, {
        produitId: productId,
        error: error.message
      });
      throw error;
    }
  }

  async getProduitByNom(nomProduit) {
    try {
      const produits = await this.getProduitsData();
      return produits.find(produit => produit.Nom_Produit === nomProduit) || null;
    } catch (error) {
      console.error(`[produitsService] Erreur lors de la recherche du produit avec le nom ${nomProduit}:`, error);
      throw new Error(`[produitsService] Erreur lors de la recherche du produit: ${error.message}`);
    }
  }

  _getRangeByRowIndex(rowIndex) {
    return `Produits!A${rowIndex}:E${rowIndex}`;
  }

  async updateProduitByRow(rowIndex, produitData) {
    try {
      this.validateProduitData(produitData);
      const range = this._getRangeByRowIndex(rowIndex);
      return await googleSheets.updateValue(range, produitData);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du produit:', error);
      throw new Error(`Erreur lors de la mise à jour du produit: ${error.message}`);
    }
  }

  async addProduit(produitData) {
    try {
      this.validateProduitData(produitData);

      const existingProduits = await this.getProduitsData();
      if (existingProduits.some(p => p.ID_Produit === produitData[COLUMNS.ID_PRODUIT])) {
        throw new Error(`[produitsService] Un produit avec l'ID ${produitData[COLUMNS.ID_PRODUIT]} existe déjà`);
      }

      return await googleSheets.appendValue(this.sheetRange, produitData);
    } catch (error) {
      console.error('[produitsService] Erreur lors de l\'ajout du produit:', error);
      throw new Error(`[produitsService] Erreur lors de l'ajout du produit: ${error.message}`);
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

      const range = this._getRangeByRowIndex(rowIndex + 1);
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

      const range = this._getRangeByRowIndex(rowIndex + 1);
      const emptyRow = Array(Object.keys(COLUMNS).length).fill('');
      return await googleSheets.updateValue(range, emptyRow);
    } catch (error) {
      console.error(`Erreur lors de la suppression du produit avec ID: ${id}`, error);
      throw new Error(`Erreur lors de la suppression du produit: ${error.message}`);
    }
  }

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