// Services/odooSalesService.js
const odooAuth = require('./odooAuth');

class OdooSalesService {
  async createQuotation(clientData, products) {
    try {
      console.log('📝 Création devis Odoo...');
      const models = odooAuth.getModelsClient();
      const uid = odooAuth.getUid();

      // Format de date Odoo : YYYY-MM-DD HH:mm:ss
      const now = new Date();
      const formattedDate = now.toISOString().replace('T', ' ').slice(0, 19);

      const saleOrderData = {
        partner_id: clientData.id,
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
            console.error('❌ Erreur création devis:', error);
            reject(error);
            return;
          }

          try {
            const orderLines = products.map(product => ({
              order_id: orderId,
              product_id: product.id,
              product_uom_qty: product.quantite,
            }));

            await this.addOrderLines(orderId, orderLines);
            const total = await this.getQuotationTotal(orderId);

            resolve({
              success: true,
              orderId: orderId,
              total: total
            });

          } catch (error) {
            console.error('❌ Erreur ajout lignes:', error);
            reject(error);
          }
        });
      });

    } catch (error) {
      console.error('❌ Erreur service devis:', error);
      throw error;
    }
  }

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