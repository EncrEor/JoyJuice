// Services/claude/utils/responseUtils.js

/**
 * Vérifie et corrige une réponse avant de la retourner.
 * Remplace les `undefined` par "Donnée manquante" pour éviter les erreurs.
 */
function validateResponse(response) {
    if (!response || typeof response !== "object") {
        console.error("❌ [validateResponse] Réponse invalide:", response);
        return { status: "ERROR", message: "Réponse invalide détectée." };
    }

    const correctedResponse = JSON.parse(JSON.stringify(response, (key, value) =>
        value === undefined ? "Donnée manquante" : value
    ));

    console.log("✅ [validateResponse] Réponse validée:", correctedResponse);
    return correctedResponse;
}

/**
 * Formate la réponse finale selon le format attendu par l'API
 * avec validation complète et logs détaillés
 */
function formatFinalResponse(response, context) {
    try {
        console.log('🔄 [responseUtils] Début formatage réponse:', {
            responseType: response?.type,
            hasContext: !!context,
            responseKeys: response ? Object.keys(response) : []
        });

        // 1. Validation initiale de la réponse
        if (!response) {
            console.error('❌ [responseUtils] Response undefined');
            throw new Error('Response undefined');
        }

        // 2. Validation et correction via validateResponse
        const validatedResponse = validateResponse(response);
        console.log('✅ [responseUtils] Réponse validée:', validatedResponse);

        // 3. Validation du contexte
        if (context && typeof context !== 'object') {
            console.warn('⚠️ [responseUtils] Format contexte invalide:', context);
            context = null;
        }

        // 4. Validation et normalisation du type
        const responseType = validatedResponse.type || 'RESPONSE';
        if (!['RESPONSE', 'ERROR', 'DELIVERY', 'CLIENT_SELECTION', 'DEMANDE_INFO'].includes(responseType)) {
            console.warn(`⚠️ [responseUtils] Type de réponse non standard: ${responseType}`);
        }

        // 5. Validation du message
        const message = validatedResponse.message || validatedResponse.error?.message || 'Une erreur est survenue';
        if (!message) {
            console.warn('⚠️ [responseUtils] Message manquant dans la réponse');
        }

        // 6. Construction de la réponse finale
        const finalResponse = {
            success: !validatedResponse.error,
            message,
            data: {
                type: responseType,
                content: validatedResponse.data || null,
                context: context,
                status: validatedResponse.status || 'PROCESSED'
            },
            timestamp: new Date().toISOString(),
            debug: {
                originalType: response?.type,
                hadError: !!validatedResponse.error,
                wasValidated: true
            }
        };

        // 7. Log final détaillé
        console.log('📤 [responseUtils] Réponse finale formatée:', {
            success: finalResponse.success,
            type: finalResponse.data.type,
            hasContent: !!finalResponse.data.content,
            hasContext: !!finalResponse.data.context,
            message: finalResponse.message.slice(0, 100) // Limite la longueur du log
        });

        return finalResponse;

    } catch (error) {
        console.error('❌ [responseUtils] Erreur formatage réponse:', {
            error: error.message,
            stack: error.stack,
            originalResponse: response
        });

        // Réponse d'erreur structurée
        return {
            success: false,
            message: 'Erreur lors du formatage de la réponse',
            data: {
                type: 'ERROR',
                content: null,
                context: null,
                error: {
                    message: error.message,
                    code: 'FORMATTING_ERROR'
                }
            },
            timestamp: new Date().toISOString(),
            debug: {
                originalError: error.message,
                failedAt: 'formatFinalResponse'
            }
        };
    }
}

module.exports = { 
    validateResponse,
    formatFinalResponse 
};