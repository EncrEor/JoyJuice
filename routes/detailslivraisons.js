//detailslivraisons.js

const express = require('express');
const router = express.Router();
const { detailsLivraisonsService } = require('../Services/googleSheetsService');

// Récupérer les détails de toutes les livraisons sur le mois en cours
router.get('/', async (req, res) => {
  try {
    const detailsLivraisons = await detailsLivraisonsService.getDetailsLivraisonsDataCurrentMonth();
    res.status(200).json(detailsLivraisons);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des détails de livraison.' });
  }
});

// Ajouter des détails de livraison
router.post('/', async (req, res) => {
  try {
    const detailsLivraisonData = req.body;
    await detailsLivraisonsService.addDetailsLivraison(detailsLivraisonData);
    res.status(201).json({ message: 'Détails de livraison ajoutés avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de l\'ajout des détails de livraison.' });
  }
});

// Mettre à jour un détail de livraison existant
router.put('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    const updatedValues = req.body;
    await detailsLivraisonsService.updateDetailsLivraison(row, updatedValues);
    res.status(200).json({ message: 'Détails de livraison mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour des détails de livraison.' });
  }
});

// Supprimer un détail de livraison
router.delete('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    await detailsLivraisonsService.deleteDetailsLivraison(row);
    res.status(200).json({ message: 'Détails de livraison supprimés.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la suppression des détails de livraison.' });
  }
});

module.exports = router;
