// routes/produits.js
const express = require('express');
const router = express.Router();
const produitsService = require('../Services/produitsService');

// Récupérer tous les produits
router.get('/', async (req, res) => {
  try {
    console.log('Demande de récupération de tous les produits');
    const produits = await produitsService.getProduitsData();
    console.log(`${produits.length} produits récupérés`);
    res.status(200).json({
      success: true,
      data: produits
    });
  } catch (err) {
    console.error('Erreur lors de la récupération des produits:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération des produits.',
      error: err.message 
    });
  }
});

// Récupérer un produit par ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Demande de récupération du produit ${id}`);
    
    const produits = await produitsService.getProduitsData();
    const produit = produits.find(p => p.ID_Produit === id);
    
    if (produit) {
      console.log(`Produit ${id} trouvé`);
      res.status(200).json({
        success: true,
        data: produit
      });
    } else {
      console.log(`Produit ${id} non trouvé`);
      res.status(404).json({ 
        success: false,
        message: 'Produit non trouvé.' 
      });
    }
  } catch (err) {
    console.error(`Erreur lors de la récupération du produit ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la récupération du produit.',
      error: err.message 
    });
  }
});

// Ajouter un nouveau produit
router.post('/', async (req, res) => {
  try {
    console.log('Demande d\'ajout d\'un nouveau produit:', req.body);
    
    // Validation des données requises
    if (!req.body.Nom_Produit || !req.body.Prix_Unitaire) {
      return res.status(400).json({
        success: false,
        message: 'Le nom du produit et le prix unitaire sont requis.'
      });
    }
    
    // Transformation des données en tableau ordonné pour Google Sheets
    const produitArray = [
      req.body.ID_Produit || await produitsService.generateProductId(), // Génération d'ID si non fourni
      req.body.Nom_Produit,
      req.body.Prix_Unitaire,
      req.body.Contenance || '',
      req.body.Quantite_Stock || '0'
    ];
    
    console.log('Données formatées pour l\'ajout:', produitArray);
    
    await produitsService.addProduit(produitArray);
    console.log('Produit ajouté avec succès');
    
    res.status(201).json({
      success: true,
      message: 'Produit ajouté avec succès.',
      data: {
        ID_Produit: produitArray[0],
        Nom_Produit: produitArray[1],
        Prix_Unitaire: produitArray[2],
        Contenance: produitArray[3],
        Quantite_Stock: produitArray[4]
      }
    });
  } catch (err) {
    console.error('Erreur dans la route POST /produits:', err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de l\'ajout du produit.',
      error: err.message 
    });
  }
});

// Mettre à jour un produit
router.put('/name/:nom_produit', async (req, res) => {
  try {
    const { nom_produit } = req.params;
    console.log(`Demande de mise à jour du produit ${nom_produit}:`, req.body);
    
    // Récupérer tous les produits
    const produits = await produitsService.getProduitsData();

    // Trouver le produit par Nom_Produit
    const existingProduit = produits.find(p => p.Nom_Produit === nom_produit);

    if (!existingProduit) {
      console.log(`Produit ${nom_produit} non trouvé`);
      return res.status(404).json({
        success: false,
        message: 'Produit non trouvé.'
      });
    }
    
    // Préparation des données mises à jour en conservant les valeurs existantes si non fournies
    const produitArray = [
      existingProduit.ID_Produit, // Garder l'ID original
      req.body.Nom_Produit || existingProduit.Nom_Produit,
      req.body.Prix_Unitaire || existingProduit.Prix_Unitaire.toString(),
      req.body.Contenance || existingProduit.Contenance,
      req.body.Quantite_Stock || existingProduit.Quantite_Stock.toString()
    ];

    console.log('Données à mettre à jour:', produitArray);
    
    await produitsService.updateProduitByRow(existingProduit.rowIndex, produitArray);
    console.log(`Produit ${nom_produit} mis à jour avec succès`);

    res.status(200).json({
      success: true,
      message: 'Produit mis à jour avec succès.',
      data: {
        ID_Produit: produitArray[0],
        Nom_Produit: produitArray[1],
        Prix_Unitaire: produitArray[2],
        Contenance: produitArray[3],
        Quantite_Stock: produitArray[4]
      }
    });
  } catch (err) {
    console.error(`Erreur lors de la mise à jour du produit ${req.params.nom_produit}:`, err);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du produit.',
      error: err.message
    });
  }
});

// Supprimer un produit
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Demande de suppression du produit ${id}`);
    
    await produitsService.deleteProduit(id);
    console.log(`Produit ${id} supprimé avec succès`);
    
    res.status(200).json({
      success: true,
      message: 'Produit supprimé avec succès.'
    });
  } catch (err) {
    console.error(`Erreur lors de la suppression du produit ${req.params.id}:`, err);
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la suppression du produit.',
      error: err.message 
    });
  }
});

module.exports = router;
