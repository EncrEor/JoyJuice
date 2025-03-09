// routes/chat.js
const express = require('express');
const router = express.Router();
const claudeService = require('../Services/claude/core/claudeService');

/**
 * Formate la réponse pour le client
 * @param {Object} response - Réponse du service
 * @returns {Object} Réponse formatée
 */
function formatResponse(response) {
    // Si la réponse est déjà formatée par responseUtils
    if (response?.data?.type) {
        return response;
    }

    // Si la réponse est une livraison réussie
    if (response?.type === 'DELIVERY' && response?.status === 'SUCCESS') {
        return {
            success: true,
            data: {
                type: 'DELIVERY',
                message: response.message || response.livraison?.message,
                livraison: {
                    id: response.livraison?.id,
                    total: response.livraison?.total,
                    details: response.livraison?.details
                },
                client: {
                    name: response.client?.name,
                    zone: response.client?.zone
                }
            }
        };
    }

    // Si la réponse est une erreur - AMÉLIORATION ICI
    if (response?.status === 'ERROR' || response?.type === 'ERROR') {
        // Gestion améliorée des codes d'erreur
        let errorMessage = response.error?.message || response.message || 'Une erreur est survenue';
        
        // Personnalisation des messages selon le code d'erreur
        if (response.error?.code === 'CLIENT_NOT_FOUND') {
            errorMessage = `Client non trouvé: ${response.error.clientName || 'nom inconnu'}`;
        } else if (response.error?.code === 'VALIDATION_ERROR') {
            errorMessage = `Erreur de validation: ${errorMessage}`;
        } else if (response.error?.code === 'UNSUPPORTED_ACTION') {
            errorMessage = `Action non prise en charge: ${errorMessage}`;
        }
        
        return {
            success: false,
            data: {
                type: 'ERROR',
                message: errorMessage,
                error: {
                    code: response.error?.code || 'UNKNOWN_ERROR',
                    details: response.error?.details
                }
            }
        };
    }

    // Format par défaut
    return {
        success: true,
        data: {
            type: response?.type || 'RESPONSE',
            message: response?.message,
            details: response?.details || response
        }
    };
}

/**
 * Validation des données d'entrée
 * @param {Object} data - Données à valider
 * @returns {Object} Résultat de la validation
 */
function validateInput(data) {
    const errors = [];
    
    if (!data.message?.trim()) {
        errors.push('Message requis');
    }
    
    if (!data.userId) {
        errors.push('UserId requis');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

router.post('/', async (req, res) => {
    try {
        // 1. Validation des données d'entrée
        const { message, userId } = req.body;
        const validation = validateInput({ message, userId });
        
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Données invalides',
                    details: validation.errors
                }
            });
        }   

        // 2. Traitement du message
        console.log(`📩 Message reçu de ${userId}: ${message}`);
        const response = await claudeService.processMessage(userId, message);
        
        // Si la réponse est vide ou de type UNKNOWN, on renvoie un statut 204 (No Content)
        if (!response || response.type === 'UNKNOWN') {
        console.log('[chat.js] Message de type UNKNOWN, aucune réponse renvoyée');
        return res.status(204).send();
        }

        // 3. Formatage et envoi de la réponse
        const formattedResponse = formatResponse(response);
        
        // Log de debug
        //console.log('📤 Réponse formatée:', JSON.stringify(formattedResponse, null, 2));

        return res.status(200).json(formattedResponse);

    } catch (error) {
        console.error('❌ Erreur lors du traitement du message:', {
            error: error.message,
            stack: error.stack
        });

        // 4. Gestion structurée des erreurs
        return res.status(500).json({
            success: false,
            data: {
                success: false,
                message: 'Erreur lors du traitement de la demande',
                error: {
                    message: error.message || 'Erreur interne',
                    code: error.code || 'INTERNAL_ERROR',
                    timestamp: new Date().toISOString(),
                    details: process.env.NODE_ENV === 'development' ? error.stack : null
                }
            }
        });
    }
});

module.exports = router;