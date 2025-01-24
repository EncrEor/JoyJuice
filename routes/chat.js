// routes/chat.js
const express = require('express');
const router = express.Router();
const claudeService = require('../Services/claude/core/claudeService');

router.post('/', async (req, res) => {
  try {
    const { message, userId } = req.body;
    
    if (!message || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Message et userId requis' 
      });
    }

    //console.log('Message reçu de l\'utilisateur', userId, ':', message);
    const response = await claudeService.processMessage(userId, message);
    
    res.status(200).json({
      success: true,
      data: response
    });
    
  } catch (error) {
    console.error('Erreur lors du traitement du message:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;