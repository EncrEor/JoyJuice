const express = require('express');
const router = express.Router();
const { commandesService } = require('../Services/googleSheetsService');

// Récupérer toutes les commandes sur le mois en cours
router.get('/currentMonth', async (req, res) => {
  try {
    const commandes = await commandesService.getCommandesDataCurrentMonth();
    res.status(200).json(commandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des commandes.' });
  }
});

// Récupérer toutes les commandes d'un client particulier sur le mois en cours
router.get('/:clientId/currentMonth', async (req, res) => {
  try {
    const { clientId } = req.params;
    const commandes = await commandesService.getCommandesByClientCurrentMonth(clientId);
    res.status(200).json(commandes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la récupération des commandes.' });
  }
});

// Ajouter une nouvelle commande
router.post('/', async (req, res) => {
  try {
    const commandeData = req.body;
    await commandesService.addCommande(commandeData);
    res.status(201).json({ message: 'Commande ajoutée avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de l\'ajout de la commande.' });
  }
});

// Mettre à jour une commande existante
router.put('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    const updatedValues = req.body;
    await commandesService.updateCommande(row, updatedValues);
    res.status(200).json({ message: 'Commande mise à jour avec succès.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la mise à jour de la commande.' });
  }
});

// Supprimer une commande
router.delete('/:row', async (req, res) => {
  try {
    const { row } = req.params;
    await commandesService.deleteCommande(row);
    res.status(200).json({ message: 'Commande supprimée.' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur lors de la suppression de la commande.' });
  }
});

module.exports = router;

