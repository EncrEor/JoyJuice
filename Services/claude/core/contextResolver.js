const contextManager = require('./contextManager');

class ContextResolver {
  /**
   * Récupère une information spécifique du contexte utilisateur.
   * @param {string} userId - Identifiant utilisateur
   * @param {string} key - Clé à chercher dans le contexte
   */
  
  
  static async getContextInfo(userId, key) {
    const context = await contextManager.getConversationContext(userId);

    console.log(`🔍 Lecture du contexte pour ${userId}:`, context);

    if (!context || !context[key]) {
      console.log(`⚠️ Clé "${key}" non trouvée dans le contexte pour l'utilisateur ${userId}`);
      return null;
    }
  
    console.log(`✅ Clé "${key}" trouvée dans le contexte pour l'utilisateur ${userId}:`, context[key]);
  
    // Validation supplémentaire
    if (key === 'lastClient' && (!context[key].name || !context[key].availableZones)) {
      console.error('❌ Contexte invalide pour lastClient:', context[key]);
      return null;
    }
  
    return context[key];
  }
  

  /**
   * Tente de résoudre automatiquement les besoins d'informations manquantes.
   * @param {string} userId - Identifiant utilisateur
   * @param {Object} analysis - Analyse de l'intention utilisateur
   */
  static async resolveMissingInformation(userId, analysis) {
    const lastClient = await this.getContextInfo(userId, 'lastClient');

    if (analysis.type === 'CLIENT_SELECTION' && !analysis.intention_details.client?.zone && lastClient?.availableZones) {
      console.log(`🔍 Résolution automatique: Ajout des zones disponibles pour le client ${lastClient.name}`);
      analysis.intention_details.client.availableZones = lastClient.availableZones;
    }

    if (analysis.type === 'DEMANDE_INFO' && analysis.intention_details.type_info === 'LISTE_ZONES') {
      console.log(`🔍 Résolution automatique: Utilisation du contexte pour les zones disponibles`);
      return {
        status: 'SUCCESS',
        message: `Les zones disponibles pour ${lastClient.name} sont : ${lastClient.availableZones.join(', ')}`,
        availableZones: lastClient.availableZones
      };
    }

    return null; // Aucune résolution automatique applicable
  }
}

module.exports = ContextResolver;
