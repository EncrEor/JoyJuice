// Services/odooSalesService.js

const odooAuth = require('./odooAuth');

class OdooSalesService {
  /**
   * Vérifie que la connexion à Odoo est établie, sinon authentifie.
   */
  async ensureConnection() {
    if (!odooAuth.getUid()) {
      await odooAuth.authenticate();
    }
  }

  /**
   * Crée un devis dans Odoo
   * @param {Object} clientData - Données du client
   * @param {Array} products - Liste des produits (id, quantite, etc.)
   */
  async createQuotation(clientData, products) {
    try {
      await this.ensureConnection();
      console.log('📝 Création devis Odoo...', { client: clientData, produits: products });
      const models = odooAuth.getModelsClient();
      const uid = odooAuth.getUid();
  
      const now = new Date();
      const formattedDate = now.toISOString().replace('T', ' ').slice(0, 19);
  
      const saleOrderData = {
        partner_id: parseInt(clientData.id),
        date_order: formattedDate,
        state: 'draft'
      };
  
      return new Promise((resolve, reject) => {
        models.methodCall('execute_kw', [
          odooAuth.db,
          uid,
          odooAuth.password,
          'sale.order',
          'create',
          [saleOrderData]
        ], async (error, orderId) => {
          if (error) {
            console.error('❌ Erreur création devis Odoo:', {
              error: error.message,
              data: saleOrderData
            });
            reject(error);
            return;
          }
  
          try {
            console.log('✅ Devis créé:', orderId);
            const orderLines = products.map(product => ({
              order_id: orderId,
              product_id: parseInt(product.id),
              product_uom_qty: product.quantite
            }));
  
            console.log('📝 Ajout lignes:', orderLines);
            await this.addOrderLines(orderId, orderLines);
            const total = await this.getQuotationTotal(orderId);
  
            resolve({
              success: true,
              orderId,
              total
            });
          } catch (error) {
            console.error('❌ Erreur ajout lignes:', {
              error: error.message,
              orderId,
              lines: orderLines
            });
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('❌ Erreur création devis:', {
        error: error.message,
        stack: error.stack,
        client: clientData,
        products
      });
      throw error;
    }
  }

  /**
   * Ajoute des lignes (produits) à la commande/devis
   * @param {number} orderId - ID de la commande/devis dans Odoo
   * @param {Array} lines - Détails des produits (product_id, product_uom_qty, etc.)
   */
  async addOrderLines(orderId, lines) {
    const models = odooAuth.getModelsClient();
    const uid = odooAuth.getUid();

    return new Promise((resolve, reject) => {
      models.methodCall('execute_kw', [
        odooAuth.db,
        uid,
        odooAuth.password,
        'sale.order.line',
        'create',
        [lines]
      ], (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  /**
   * Récupère le montant total d'un devis (sale.order)
   * @param {number} orderId - ID de la commande/devis
   */
  async getQuotationTotal(orderId) {
    const models = odooAuth.getModelsClient();
    const uid = odooAuth.getUid();

    return new Promise((resolve, reject) => {
      models.methodCall('execute_kw', [
        odooAuth.db,
        uid,
        odooAuth.password,
        'sale.order',
        'read',
        [[orderId], ['amount_total']]
      ], (error, result) => {
        if (error) reject(error);
        else resolve(result[0].amount_total);
      });
    });
  }
}

module.exports = new OdooSalesService();