const express = require('express');
const router = express.Router();
const googleSheetsService = require('../services/googleSheetsService');

// Récupérer les détails de toutes les commandes sur le mois en cours
router.get('/', async (req, res) => {
  try {
    const detailsCommandes = await googleSheetsService.getDetailsCommandesData();
    res.status(200).json(detailsCommandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des détails des commandes.' });
  }
});

// Ajouter des détails de commande
router.post('/', async (req, res) => {
  try {
    const detailsCommandeData = req.body;
    await googleSheetsService.addDetailsCommande(detailsCommandeData);
    res.status(201).json({ message: 'Détails de commande ajoutés avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de l\'ajout des détails de commande.' });
  }
});

// Mettre à jour un détail de commande existant
router.put('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    const updatedValues = req.body;
    await googleSheetsService.updateDetailsCommande(row, updatedValues);
    res.status(200).json({ message: 'Détails de commande mis à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour des détails de commande.' });
  }
});

// Supprimer un détail de commande
router.delete('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    await googleSheetsService.deleteDetailsCommande(row);
    res.status(200).json({ message: 'Détails de commande supprimés.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la suppression des détails de commande.' });
  }
});

module.exports = router;
