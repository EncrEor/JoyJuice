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

  /**
   * Récupère le solde (montant dû) d'un client depuis Odoo
   * @param {string} partnerId - ID du client dans Odoo
   * @returns {Promise<number>} Solde total du client
   */





  async getCustomerBalance(partnerId) {
    try {
      console.log(`💰 [odooSalesService] Récupération solde pour client ${partnerId}`);
  
      // S'assurer d'être connecté à Odoo
      await this.ensureConnection();
      const models = odooAuth.getModelsClient();
      const uid = odooAuth.getUid();
      if (!models || !uid) {
        console.error("❌ [ERROR] Échec connexion à Odoo (models ou uid est null)");
        return 0;
      }
  
      // 🔹 Vérification de l'existence du client
      let clientExists = await new Promise((resolve, reject) => {
        models.methodCall(
          'execute_kw',
          [
            odooAuth.db,
            uid,
            odooAuth.password,
            'res.partner',
            'search_read',
            [
              [['id', '=', parseInt(partnerId)]]
            ],
            { fields: ['name'] }
          ],
          (error, result) => {
            if (error) {
              console.error("❌ [ERROR] Vérification client Odoo:", error);
              reject(error);
              return;
            }
            //console.log(`📊 [DEBUG] Client trouvé dans Odoo:`, result);
            resolve(result.length > 0);
          }
        );
      });
      if (!clientExists) {
        console.error("❌ [ERROR] Client non trouvé dans Odoo.");
        return 0;
      }
  
      // 🔹 Récupération des factures impayées (account.move)
      let unpaidInvoices = await new Promise((resolve, reject) => {
        models.methodCall(
          'execute_kw',
          [
            odooAuth.db,
            uid,
            odooAuth.password,
            'account.move',
            'search_read',
            [
              [['partner_id', '=', parseInt(partnerId)],
               ['state', '=', 'posted'],
               ['payment_state', '!=', 'paid']]
            ],
            { fields: ['id', 'amount_residual'] }
          ],
          (error, result) => {
            if (error) {
              console.error("❌ [ERROR] Problème récupération factures impayées:", error);
              reject(error);
              return;
            }
            //console.log("📊 [DEBUG] Factures impayées récupérées:", result);
            const totalUnpaid = result.reduce((sum, invoice) => sum + (invoice.amount_residual || 0), 0);
            resolve(totalUnpaid);
          }
        );
      });
  
      // 🔹 Récupération des devis (sale.order en mode draft)
      let draftOrders = await new Promise((resolve, reject) => {
        models.methodCall(
          'execute_kw',
          [
            odooAuth.db,
            uid,
            odooAuth.password,
            'sale.order',
            'search_read',
            [
              [['partner_id', '=', parseInt(partnerId)],
               ['state', '=', 'draft']]
            ],
            { fields: ['id', 'amount_total'] }
          ],
          (error, result) => {
            if (error) {
              console.error("❌ [ERROR] Problème récupération devis (draft orders):", error);
              reject(error);
              return;
            }
            //console.log("📊 [DEBUG] Devis (draft orders) récupérés:", result);
            const totalDraft = result.reduce((sum, order) => sum + (order.amount_total || 0), 0);
            resolve(totalDraft);
          }
        );
      });
  
      // 🔹 Récupération des commandes validées en attente de facturation (state = 'sale' et invoice_status = 'to invoice')
      let confirmedOrders = await new Promise((resolve, reject) => {
        models.methodCall(
          'execute_kw',
          [
            odooAuth.db,
            uid,
            odooAuth.password,
            'sale.order',
            'search_read',
            [
              [['partner_id', '=', parseInt(partnerId)],
               ['state', '=', 'sale'],
               ['invoice_status', '=', 'to invoice']]
            ],
            { fields: ['id', 'amount_total'] }
          ],
          (error, result) => {
            if (error) {
              console.error("❌ [ERROR] Problème récupération commandes validées en attente de facturation:", error);
              reject(error);
              return;
            }
            //console.log("📊 [DEBUG] Commandes validées en attente de facturation récupérées:", result);
            const totalConfirmed = result.reduce((sum, order) => sum + (order.amount_total || 0), 0);
            resolve(totalConfirmed);
          }
        );
      });
  
      const unpaidOrders = draftOrders + confirmedOrders;
      const balance = unpaidInvoices + unpaidOrders;
      console.log(`✅ Solde client final: ${balance} DNT (Factures impayées + Devis + Commandes en attente de facturation)`);
      return balance;
  
    } catch (error) {
      console.error('❌ [ERROR] Récupération solde client a échoué:', error);
      return 0;
    }
  }




}

module.exports = new OdooSalesService();