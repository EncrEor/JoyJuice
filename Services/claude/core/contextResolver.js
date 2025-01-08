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
    try {
      console.log('🔍 Résolution contexte pour:', {userId, type: analysis?.type});
      
      const lastClient = await this.getContextInfo(userId, 'lastClient');
      
      if (!analysis) {
        throw new Error('Analysis object required');
      }
  
      // Validate context
      if (analysis.contexte_necessaire && !lastClient) {
        return {
          status: 'ERROR',
          error: {
            code: 'MISSING_CONTEXT',
            message: 'Contexte client manquant'
          }
        };
      }
  
      const result = {
        status: 'SUCCESS',
        contextResolved: true,
        client: lastClient
      };
  
      console.log('✅ Contexte résolu:', result);
      return result;
  
    } catch (error) {
      console.error('❌ Erreur résolution contexte:', {
        userId,
        error: {
          message: error.message,
          stack: error.stack
        }
      });
      
      return {
        status: 'ERROR',
        error: {
          code: 'CONTEXT_ERROR',
          message: error.message
        }
      };
    }
  }
}

module.exports = ContextResolver;
