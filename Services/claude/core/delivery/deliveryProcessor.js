// Services/claude/core/delivery/deliveryProcessor.js

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
    try {
      console.log('📦 [processDelivery] Début du traitement de la livraison:', JSON.stringify(analyzedDelivery, null, 2));

      // Vérification des données entrantes
      if (!analyzedDelivery || typeof analyzedDelivery !== 'object') {
        console.error('🚨 [Erreur critique] Données de livraison invalides ou manquantes:', analyzedDelivery);
        throw new Error('Les données de livraison sont invalides ou manquantes.');
      }

      if (!analyzedDelivery.products || !Array.isArray(analyzedDelivery.products) || analyzedDelivery.products.length === 0) {
        console.error('🚨 [Erreur critique] La liste des produits est absente ou vide !');
        throw new Error('La livraison doit contenir au moins un produit.');
      }

      // Ajout prix et totaux
      console.log('🛠 [DEBUG] Enrichissement de la livraison avec les prix unitaires et totaux...');
      const enrichedDelivery = {
        ...analyzedDelivery,
        products: analyzedDelivery.products.map(p => {
          const prixUnitaire = this.productsCache[p.ID_Produit];
          if (!prixUnitaire) {
            console.warn(`⚠️ [Avertissement] Prix unitaire non trouvé pour le produit ID: ${p.ID_Produit}`);
          }
          return {
            ...p,
            prix_unit_livraison: prixUnitaire || 0,
            total_ligne: (p.quantite || 0) * (prixUnitaire || 0)
          };
        })
      };

      enrichedDelivery.total_livraison = enrichedDelivery.products
        .reduce((sum, p) => sum + p.total_ligne, 0);

      console.log('✅ [processDelivery] Livraison enrichie avec succès:', JSON.stringify(enrichedDelivery, null, 2));

      // Vérification si la livraison doit être scindée en retour
      const livraisons = analyzedDelivery.isReturn ? 
        this.splitReturnDelivery(enrichedDelivery) :
        [enrichedDelivery];

      console.log(`📦 [processDelivery] ${livraisons.length} livraison(s) à enregistrer.`);

      // Sauvegarde des livraisons
      console.log('💾 [processDelivery] Enregistrement des livraisons...');
      const results = await Promise.all(
        livraisons.map(l => this.livraisonsService.addLivraison(l))
      );

      if (!results || results.length === 0) {
        console.error('🚨 [Erreur critique] Aucun résultat retourné par addLivraison !');
        throw new Error('L’enregistrement des livraisons a échoué.');
      }

      console.log('✅ [processDelivery] Livraison(s) enregistrée(s) avec succès:', JSON.stringify(results, null, 2));
      return results;

    } catch (error) {
      console.error('❌ [Erreur] Échec du traitement de la livraison:', error.message);
      throw new Error(`Erreur lors du traitement de la livraison: ${error.message}`);
    }
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