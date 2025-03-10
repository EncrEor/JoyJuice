const odooAuth = require('./odooAuth');
const { formatPrice } = require('./claude/utils/numberUtils');

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
      const total = unpaidInvoices + unpaidOrders;
      
      const balanceDetails = {
        unpaidInvoices: formatPrice(unpaidInvoices),
        unpaidOrders: formatPrice(unpaidOrders),
        total: formatPrice(total)
      };
      
      console.log(`✅ Solde client détaillé: `, balanceDetails);
      return balanceDetails;
  
    } catch (formattingError) {
      console.error("❌ Erreur lors du formatage des prix:", formattingError);
      // En cas d'erreur de formatage, retourner les valeurs brutes
      return {
        unpaidInvoices: unpaidInvoices || 0,
        unpaidOrders: unpaidOrders || 0,
        total: (unpaidInvoices || 0) + (unpaidOrders || 0)
      };
    }

  } catch (error) {
    console.error('❌ [ERROR] Récupération solde client a échoué:', error);
    console.error('Erreur :', error.message); // Ajoutons ceci pour voir l'erreur spécifique
    // Assurons-nous de retourner une structure valide même en cas d'erreur
    return { 
      unpaidInvoices: 0, 
      unpaidOrders: 0, 
      total: 0 
    };
  }



/**
 * Crée un paiement client dans Odoo
 * @param {Object} paymentData - Données du paiement
 * @param {string} paymentData.clientId - ID du client (identique à l'ID Odoo)
 * @param {string} paymentData.journal - Code du journal (CSH3, BNK1, TRT)
 * @param {number} paymentData.amount - Montant du paiement
 */

async createPayment(paymentData) {
  try {
    console.log('💰 [odooSalesService] Début création paiement dans Odoo:', paymentData);

    if (!paymentData.clientId) {
      console.error('❌ [odooSalesService] ID client requis pour créer un paiement');
      throw new Error('ID client requis pour créer un paiement');
    }

    // Vérifions d'abord si odooAuth est disponible
    console.log('🔍 [odooSalesService] Vérification de odooAuth:', !!odooAuth);

    try {
      // S'assurer d'être connecté à Odoo
      console.log('🔄 [odooSalesService] Tentative d\'authentification Odoo...');
      await this.ensureConnection();
      console.log('✅ [odooSalesService] Authentification Odoo réussie');
    } catch (authError) {
      console.error('❌ [odooSalesService] Erreur d\'authentification Odoo:', {
        message: authError.message,
        stack: authError.stack
      });
      throw new Error(`Échec connexion à Odoo: ${authError.message}`);
    }

    // Vérifier si models et uid sont disponibles
    const models = odooAuth.getModelsClient();
    const uid = odooAuth.getUid();
    console.log('🔍 [odooSalesService] Vérification models et uid:', {
      modelsExist: !!models,
      uidExist: !!uid,
      uid: uid
    });

    if (!models || !uid) {
      console.error("❌ [odooSalesService] Models ou UID manquant");
      throw new Error("Échec de la connexion à Odoo: Models ou UID manquant");
    }

    // Formatage des données
    const now = new Date();
    const formattedDate = now.toISOString().split('T')[0]; // Format YYYY-MM-DD

    // S'assurer que l'ID client est numérique
    let partnerId;
    try {
      partnerId = parseInt(paymentData.clientId, 10);
      if (isNaN(partnerId)) {
        throw new Error("ID client invalide (doit être un nombre)");
      }
      console.log('✅ [odooSalesService] ID Client valide:', partnerId);
    } catch (parseError) {
      console.error("❌ [odooSalesService] Échec de la conversion de l'ID client:", paymentData.clientId);
      throw new Error(`ID client invalide: ${paymentData.clientId}`);
    }

    // Préparation des données de paiement pour Odoo
    // Convertir le code journal en ID de journal
    let journalId;
    switch (paymentData.journal) {
      case 'CSH3':
        journalId = 28; // ID réel du journal de caisse dans Odoo
        break;
      case 'BNK1':
        journalId = 22; // ID réel du journal bancaire dans Odoo
        break;
      case 'TRT':
        journalId = 32; // ID réel du journal des traites dans Odoo
        break;
      default:
        throw new Error(`Journal non reconnu: ${paymentData.journal}`);
    }

    console.log('✅ [odooSalesService] Journal ID récupéré:', journalId);

    // Mise à jour de l'objet de paiement pour inclure les champs requis
    const paymentVals = {
      partner_id: partnerId,
      payment_type: 'inbound',   // Du client vers l'entreprise
      partner_type: 'customer',
      journal_id: journalId,     // Utiliser l'ID numérique du journal
      amount: paymentData.amount,
      date: formattedDate,       // Champ requis (remplace payment_date)
      payment_method_id: 1,      // cash method id
      company_id: 1,             // Valeur par défaut (à ajuster si nécessaire)
      state: 'draft'             // Valeur par défaut pour l'état
    };

    console.log('📑 [odooSalesService] Données préparées pour Odoo:', paymentVals);

    // --- Nouvelle section : Débogage des champs requis ---
    models.methodCall('execute_kw', [
      odooAuth.db,
      uid,
      odooAuth.password,
      'account.payment',
      'fields_get',
      [],
      { attributes: ['required', 'type', 'string'] }
    ], (error, fields) => {
      if (error) {
        console.error('❌ Erreur récupération structure du modèle:', error);
      } else {
        const requiredFields = Object.entries(fields)
          .filter(([_, props]) => props.required)
          .map(([field, props]) => ({ field, type: props.type, label: props.string }));
        console.log('📋 Champs requis pour account.payment:', requiredFields);
      }
    });
    // --- Fin de la section de débogage ---

    // Création d'une Promise avec un timeout pour éviter un blocage indéfini
    return new Promise((resolve, reject) => {
      // Ajouter un timeout de 10 secondes
      const timeout = setTimeout(() => {
        reject(new Error('Timeout lors de la création du paiement Odoo'));
      }, 10000);

      console.log('🔄 [odooSalesService] Appel à Odoo pour créer le paiement...');
      console.log('📤 Payload complet:', [
        odooAuth.db,
        uid,
        odooAuth.password,
        'account.payment',
        'create',
        [paymentVals]
      ]);

      // Appel de test préliminaire pour vérifier l'API
      models.methodCall('execute_kw', [
        odooAuth.db,
        uid,
        odooAuth.password,
        'account.journal',  // Utilisation d'un modèle différent pour tester
        'search_count',
        [[]]
      ], (searchError, journalCount) => {
        if (searchError) {
          console.error('❌ Echec de la recherche préliminaire:', searchError);
          clearTimeout(timeout);
          reject(searchError);
          return;
        }

        console.log('✅ Test préliminaire réussi, nombre de journaux:', journalCount);

        // Maintenant, tentative de création effective du paiement
        models.methodCall('execute_kw', [
          odooAuth.db,
          uid,
          odooAuth.password,
          'account.payment',
          'create',
          [paymentVals]
        ], (error, paymentId) => {
          clearTimeout(timeout); // Annuler le timeout

          if (error) {
            console.error('❌ [odooSalesService] Erreur création paiement Odoo:', {
              message: error.message || 'Erreur sans message',
              code: error.code || 'Pas de code',
              data: error.data || 'Pas de données d\'erreur',
              name: error.name || 'Erreur sans nom',
              stack: error.stack || 'Pas de stack'
            });

            const errorDetails = {
              message: error.message || 'Pas de message',
              code: error.code || 'Pas de code',
              faultCode: error.faultCode || 'Pas de faultCode',
              faultString: error.faultString || 'Pas de faultString',
              keys: Object.keys(error || {})
            };
            console.error('📝 Détails supplémentaires de l\'erreur:', errorDetails);

            reject(error);
            return;
          }

          console.log('✅ [odooSalesService] Paiement créé dans Odoo avec l\'ID:', paymentId);
          resolve({
            success: true,
            paymentId: paymentId,
            amount: paymentData.amount
          });
        });
      });
    });
  } catch (error) {
    console.error('❌ [odooSalesService] Erreur générale création paiement:', {
      message: error.message || 'Erreur inconnue',
      stack: error.stack
    });
    return {
      success: false,
      error: error.message || 'Erreur inconnue'
    };
  }
}



}

module.exports = new OdooSalesService();