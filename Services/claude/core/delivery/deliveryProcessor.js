// deliveryProcessor.js

class DeliveryProcessor {
  constructor(livraisonsService, produitsService) {
    this.livraisonsService = livraisonsService;
    this.produitsService = produitsService;
    this.productsCache = null;
  }
 
  async initialize() {
    console.log('🔄 Initialisation cache des prix...');
    const products = await this.produitsService.getProduitsData();
    this.productsCache = products.reduce((cache, p) => {
      cache[p.ID_Produit] = p.Prix_Unitaire;
      return cache;
    }, {});
  }
 
  async processDelivery(analyzedDelivery) {
    console.log('📦 Traitement livraison:', analyzedDelivery);
 
    // Ajout prix et totaux
    const enrichedDelivery = {
      ...analyzedDelivery,
      products: analyzedDelivery.products.map(p => ({
        ...p,
        prix_unit_livraison: this.productsCache[p.ID_Produit],
        total_ligne: p.quantite * this.productsCache[p.ID_Produit]
      }))
    };
 
    enrichedDelivery.total_livraison = enrichedDelivery.products
      .reduce((sum, p) => sum + p.total_ligne, 0);
 
    // Split en deux livraisons si retour
    const livraisons = analyzedDelivery.isReturn ? 
      this.splitReturnDelivery(enrichedDelivery) :
      [enrichedDelivery];
 
    // Sauvegarde
    const results = await Promise.all(
      livraisons.map(l => this.livraisonsService.addLivraison(l))
    );
 
    console.log('✅ Livraison(s) enregistrée(s):', results);
    return results;
  }
 
  splitReturnDelivery(delivery) {
    return [
      {...delivery, type: 'LIVRAISON'},
      {...delivery, type: 'RETOUR', 
       products: delivery.products.map(p => ({
         ...p,
         total_ligne: -p.total_ligne
       })),
       total_livraison: -delivery.total_livraison
      }
    ];
  }
 }
 
 module.exports = DeliveryProcessor;