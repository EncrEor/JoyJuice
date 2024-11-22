// routes/livraisons.js
const express = require('express');
const router = express.Router();
const { livraisonsService, detailsLivraisonsService } = require('../Services/googleSheetsService');

const clientLookupService = require('../Services/clientLookupService');

// Constantes pour la validation
const STATUT_LIVRAISON = ['En cours', 'Terminée', 'Annulée'];


// Récupérer toutes les livraisons sur le mois en cours
router.get('/currentMonth', async (req, res) => {
  try {
    console.log('Récupération des livraisons du mois en cours');
    const livraisons = await livraisonsService.getLivraisonsDataCurrentMonth();
    console.log(`${livraisons.length} livraisons trouvées`);
    
    res.status(200).json({
      success: true,
      message: 'Livraisons récupérées avec succès',
      data: {
        count: livraisons.length,
        livraisons: livraisons
      }
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des livraisons:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des livraisons.',
      error: err.message 
    });
  }
});

// Nouvelle route pour récupérer les livraisons d'un client par nom et zone (si nécessaire)
router.get('/by-client', async (req, res) => {
  const { clientName, clientZone } = req.query;

  // Vérification du nom du client
  if (!clientName) {
    return res.status(400).json({ message: 'Nom du client requis.' });
  }

  try {
    // Recherche du client par nom et zone (si précisée)
    const client = await clientLookupService.findClientByNameAndZone(clientName, clientZone);

    if (!client) {
      return res.status(404).json({ 
        success: false,
        message: `Client avec le nom "${clientName}" introuvable.`,
        data: {
          requested_name: clientName,
          requested_zone: clientZone || null,
          timestamp: new Date().toISOString(),
          error_type: 'CLIENT_NOT_FOUND'
        }
      });
    }

    // Gestion des doublons sans précision de zone
    if (client.multiple) {
      return res.status(400).json({
        message: `Plusieurs clients trouvés pour le nom "${clientName}". Précisez la zone parmi : ${client.matches.map(c => c.Zone).join(', ')}.`
      });
    }

    // Récupération des livraisons pour l'ID client trouvé
    const clientId = client.ID_Client;
    const livraisons = await livraisonsService.getLivraisonsByClientCurrentMonth(clientId);

    res.status(200).json(livraisons);
  } catch (error) {
    console.error('Erreur lors de la récupération des livraisons du client:', error);
    res.status(500).json({ message: 'Erreur lors de la récupération des livraisons.', error: error.message });
  }
});

// Récupérer une livraison spécifique avec ses détails
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Récupération de la livraison ${id}`);
    
    const livraison = await livraisonsService.getLivraisonById(id);
    if (!livraison) {
      console.log(`Livraison ${id} non trouvée`);
      return res.status(404).json({ 
        success: false,
        message: 'Livraison non trouvée.',
        data: {
          requested_id: id,
          timestamp: new Date().toISOString(),
          error_type: 'NOT_FOUND'
        }
      });
    }

    const details = await detailsLivraisonsService.getDetailsLivraisonById(id);
    console.log(`Livraison ${id} trouvée avec ${details.length} détails`);

    res.status(200).json({
      success: true,
      message: 'Livraison récupérée avec succès',
      data: {
        livraison: {
          ...livraison,
          details_count: details.length
        },
        details: details,
        retrieved_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error(`Erreur lors de la récupération de la livraison ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération de la livraison.',
      error: err.message 
    });
  }
});

// Créer une nouvelle livraison avec ses détails
router.post('/', async (req, res) => {
  try {
    console.log('Création d\'une nouvelle livraison:', req.body);
    
    // Détection du format de données
    const isNewFormat = 'clientName' in req.body;
    console.log('Format détecté:', isNewFormat ? 'nouveau' : 'ancien');
    
    if (isNewFormat) {
      // Nouveau format - Passage direct au service
      const result = await livraisonsService.addLivraison(req.body);
      
      // Gestion des différents cas de réponse
      if (result.status === 'need_zone') {
        return res.status(400).json({
          success: false,
          message: result.message,
          data: {
            error_type: 'ZONE_REQUIRED',
            client_name: req.body.clientName,
            available_zones: result.matches.map(m => m.Zone),
            matches: result.matches,
            timestamp: new Date().toISOString()
          }
        });
      }

      if (result.status === 'success') {
        return res.status(201).json({
          success: true,
          message: 'Livraison créée avec succès',
          data: {
            livraison_id: result.livraison_id,
            total: result.total,
            details: result.details,
            created_at: new Date().toISOString()
          }
        });
      }
    } else {
      // Ancien format
      const { livraison, details } = req.body;
      
      // Validation des données
      if (!livraison || !details || !Array.isArray(details)) {
        throw new Error('Format de données invalide');
      }

      if (!livraison.Date_Livraison || !livraison.ID_Client || !livraison.Total_livraison) {
        throw new Error('Données de livraison incomplètes');
      }

      // Validation du format de la date (dd/mm/yyyy)
      const dateRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      if (!dateRegex.test(livraison.Date_Livraison)) {
        throw new Error('Format de date invalide. Utilisez dd/mm/yyyy');
      }

      // Validation du montant total
      if (isNaN(parseFloat(livraison.Total_livraison))) {
        throw new Error('Le montant total doit être un nombre');
      }

      // Générer l'ID de livraison
      const nextId = await getNextLivraisonId();
      const livraisonId = `L${nextId.toString().padStart(4, '0')}`;
      
      // Création de la livraison
      const livraisonArray = [
        livraisonId,
        livraison.Date_Livraison,
        livraison.ID_Client,
        livraison.Total_livraison,
        livraison.Statut_L || 'En cours'
      ];

      await livraisonsService.addLivraison(livraisonArray);
      console.log(`En-tête de livraison ${livraisonId} créée`);

      // Validation et ajout des détails
      let totalCalcule = 0;
      const detailsCreated = [];
      
      for (const detail of details) {
        // Validation des données du détail
        if (!detail.ID_Produit || !detail.Quantite || !detail.prix_unit_livraison || !detail.Total_Ligne) {
          throw new Error('Données de détail incomplètes');
        }

        const quantite = parseFloat(detail.Quantite);
        const prixUnit = parseFloat(detail.prix_unit_livraison);
        const totalLigne = parseFloat(detail.Total_Ligne);

        if (isNaN(quantite) || isNaN(prixUnit) || isNaN(totalLigne)) {
          throw new Error('Les valeurs numériques sont invalides dans les détails');
        }

        // Vérification du calcul du total ligne
        const totalCalculeLigne = quantite * prixUnit;
        if (Math.abs(totalCalculeLigne - totalLigne) > 0.01) {
          throw new Error(`Total ligne incorrect pour le produit ${detail.ID_Produit}`);
        }

        totalCalcule += totalLigne;

        // Générer ID détail et ajouter
        const detailId = await getNextDetailId();
        const detailArray = [
          `DL${detailId.toString().padStart(4, '0')}`,
          livraisonId,
          detail.ID_Produit,
          detail.Quantite,
          detail.prix_unit_livraison,
          detail.Total_Ligne
        ];
        
        await detailsLivraisonsService.addDetailsLivraison(detailArray);
        console.log(`Détail ${detailId} ajouté pour la livraison ${livraisonId}`);
        
        detailsCreated.push({
          ID_Detail: detailId,
          ID_Produit: detail.ID_Produit,
          Quantite: detail.Quantite,
          Prix_Unit: detail.prix_unit_livraison,
          Total_Ligne: detail.Total_Ligne
        });
      }

      // Vérification du total global
      if (Math.abs(totalCalcule - parseFloat(livraison.Total_livraison)) > 0.01) {
        throw new Error('Le total de la livraison ne correspond pas à la somme des lignes');
      }

      console.log(`Livraison ${livraisonId} créée avec succès`);
      res.status(201).json({ 
        success: true,
        message: 'Livraison créée avec succès.',
        data: {
          livraison_id: livraisonId,
          date: livraison.Date_Livraison,
          client_id: livraison.ID_Client,
          total: livraison.Total_livraison,
          status: livraison.Statut_L || 'En cours',
          details: detailsCreated,
          created_at: new Date().toISOString()
        }
      });
    }
  } catch (err) {
    console.error('Erreur lors de la création de la livraison:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la création de la livraison.',
      data: {
        error_type: 'CREATION_ERROR',
        error_message: err.message,
        timestamp: new Date().toISOString()
      }
    });
  }
});

// Mettre à jour une livraison existante
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Mise à jour de la livraison ${id}:`, req.body);
    
    // Détection du format de données
    const isNewFormat = 'clientName' in req.body;
    console.log('Format détecté:', isNewFormat ? 'nouveau' : 'ancien');

    // Vérification que la livraison existe
    const existingLivraison = await livraisonsService.getLivraisonById(id);
    if (!existingLivraison) {
      console.log(`Livraison ${id} non trouvée`);
      return res.status(404).json({ 
        success: false,
        message: 'Livraison non trouvée.',
        data: {
          requested_id: id,
          timestamp: new Date().toISOString(),
          error_type: 'NOT_FOUND'
        }
      });
    }

    if (isNewFormat) {
      const result = await livraisonsService.updateLivraison(id, req.body);
      
      // Gestion des différents cas de réponse
      if (result.status === 'need_zone') {
        return res.status(400).json({
          message: result.message,
          status: 'need_zone',
          matches: result.matches
        });
      }

      if (result.status === 'success') {
        return res.status(200).json({
          message: 'Livraison mise à jour avec succès',
          livraison_id: id,
          total: result.total,
          details: result.details
        });
      }
    } else {
      // Ancien format
      const { livraison, details } = req.body;

      // Validation des données
      if (!livraison.Date_Livraison || !livraison.ID_Client || !livraison.Total_livraison) {
        throw new Error('Données de livraison incomplètes');
      }

      // Mise à jour de la livraison
      const livraisonArray = [
        id,
        livraison.Date_Livraison,
        livraison.ID_Client,
        livraison.Total_livraison,
        livraison.Statut_L || existingLivraison.Statut_L
      ];

      await livraisonsService.updateLivraison(id, livraisonArray);
      console.log(`En-tête de livraison ${id} mise à jour`);

      // Mise à jour des détails si fournis
      if (details && Array.isArray(details)) {
        // Suppression des anciens détails
        await detailsLivraisonsService.deleteDetailsLivraisonById(id);
        console.log(`Anciens détails de la livraison ${id} supprimés`);
        
        // Ajout des nouveaux détails
        for (const detail of details) {
          const detailId = await getNextDetailId();
          const detailArray = [
            `DL${detailId.toString().padStart(4, '0')}`,
            id,
            detail.ID_Produit,
            detail.Quantite,
            detail.prix_unit_livraison,
            detail.Total_Ligne
          ];
          
          await detailsLivraisonsService.addDetailsLivraison(detailArray);
          console.log(`Nouveau détail ${detailId} ajouté pour la livraison ${id}`);
        }
      }

      console.log(`Livraison ${id} mise à jour avec succès`);
      res.status(200).json({ message: 'Livraison mise à jour avec succès.' });
    }
  } catch (err) {
    console.error(`Erreur lors de la mise à jour de la livraison ${req.params.id}:`, err);
    res.status(500).json({ 
      message: 'Erreur lors de la mise à jour de la livraison.',
      error: err.message 
    });
  }
});

// Supprimer une livraison
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Suppression de la livraison ${id}`);
    
    // Vérification que la livraison existe et récupération des détails
    const existingLivraison = await livraisonsService.getLivraisonById(id);
    if (!existingLivraison) {
      console.log(`Livraison ${id} non trouvée`);
      return res.status(404).json({ 
        success: false,
        message: 'Livraison non trouvée.',
        data: {
          requested_id: id,
          timestamp: new Date().toISOString(),
          error_type: 'NOT_FOUND'
        }
      });
    }

    const details = await detailsLivraisonsService.getDetailsLivraisonById(id);
    console.log(`${details.length} détails trouvés pour la livraison ${id}`);

    // Suppression des détails d'abord
    await detailsLivraisonsService.deleteDetailsLivraisonById(id);
    console.log(`Détails de la livraison ${id} supprimés`);
    
    // Puis suppression de la livraison
    await livraisonsService.deleteLivraison(id);
    console.log(`Livraison ${id} supprimée`);
    
    res.status(200).json({ 
      success: true,
      message: 'Livraison supprimée avec succès.',
      data: {
        livraison: existingLivraison,
        details: details,
        deleted_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error(`Erreur lors de la suppression de la livraison ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression de la livraison.',
      error: err.message 
    });
  }
});

// Fonction utilitaire pour obtenir le prochain ID de livraison
async function getNextLivraisonId() {
  try {
    const result = await livraisonsService.getLivraisonsDataCurrentMonth();
    if (!result || result.length === 0) return 1;

    const maxId = result.reduce((max, livraison) => {
      const id = parseInt(livraison[0].replace('L', ''), 10);
      return id > max ? id : max;
    }, 0);

    return maxId + 1;
  } catch (error) {
    console.error('Erreur lors de la génération de l\'ID de livraison:', error);
    throw new Error('Erreur lors de la génération de l\'ID de livraison');
  }
}

// Fonction utilitaire pour obtenir le prochain ID de détail
async function getNextDetailId() {
  try {
    const result = await detailsLivraisonsService.getDetailsLivraisonsDataCurrentMonth();
    if (!result || result.length === 0) return 1;

    const maxId = result.reduce((max, detail) => {
      const id = parseInt(detail[0].replace('DL', ''), 10);
      return id > max ? id : max;
    }, 0);

    return maxId + 1;
  } catch (error) {
    console.error('Erreur lors de la génération de l\'ID de détail:', error);
    throw new Error('Erreur lors de la génération de l\'ID de détail');
  }
}

module.exports = router;