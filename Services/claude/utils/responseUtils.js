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

module.exports = { validateResponse };