const xmlrpc = require('xmlrpc');
const dotenv = require('dotenv');
dotenv.config();

class OdooAuth {
  constructor() {
    this.url = process.env.ODOO_URL || 'https://joy-juice.odoo.com';
    this.db = process.env.ODOO_DB || 'joy-juice';
    this.username = process.env.ODOO_USERNAME;
    this.password = process.env.ODOO_PASSWORD;
    
    this.common = xmlrpc.createClient({
      url: `${this.url}/xmlrpc/2/common`
    });
    
    this.models = null;
    this.uid = null;
  }

  async authenticate() {
    try {
      console.log('🔄 Tentative authentification Odoo...');
      
      return new Promise((resolve, reject) => {
        this.common.methodCall('authenticate', [
          this.db,
          this.username, 
          this.password,
          {}
        ], (error, uid) => {
          if (error) {
            console.error('❌ Erreur authentification Odoo:', error);
            reject(error);
            return;
          }

          if (!uid) {
            reject(new Error('Authentification échouée'));
            return;
          }

          this.uid = uid;
          this.models = xmlrpc.createClient({
            url: `${this.url}/xmlrpc/2/object`
          });

          console.log('✅ Authentification Odoo réussie (uid:', uid, ')');
          resolve(uid);
        });
      });
    } catch (error) {
      console.error('❌ Erreur critique auth Odoo:', error);
      throw error; 
    }
  }

  getModelsClient() {
    if (!this.models || !this.uid) {
      throw new Error('Non authentifié');
    }
    return this.models;
  }

  getUid() {
    return this.uid;
  }
}

// Export singleton
module.exports = new OdooAuth();