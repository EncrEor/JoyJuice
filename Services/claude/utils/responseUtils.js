// Services/claude/utils/responseUtils.js

// Types de réponses standards
const ResponseTypes = {
    DELIVERY: 'DELIVERY',
    ERROR: 'ERROR',
    RESPONSE: 'RESPONSE',
    CLIENT_SELECTION: 'CLIENT_SELECTION',
    DEMANDE_INFO: 'DEMANDE_INFO'
  };
  
  /**
   * Logger avec différents niveaux pour une meilleure lisibilité des logs
   */
  const logger = (level, message) => {
      switch(level) {
          case 'info':
              console.info(message);
              break;
          case 'warn':
              console.warn(message);
              break;
          case 'error':
              console.error(message);
              break;
          default:
              console.log(message);
      }
  };
  
  /**
   * Vérifie et corrige une réponse avant de la retourner.
   * Remplace les `undefined` par "Donnée manquante" pour éviter les erreurs.
   *
   * @param {Object} response - La réponse à valider.
   * @param {boolean} replaceUndefined - Option pour remplacer les valeurs undefined.
   * @returns {Object} - La réponse corrigée.
   */
  function validateResponse(response, replaceUndefined = true) {
    
    logger('info', `🔍 [validateResponse] Type de réponse reçu: ${response?.type}`);  
    
    if (!response || typeof response !== "object") {
          logger('error', "❌ [validateResponse] Réponse invalide:", response);
          return { status: "ERROR", message: "Réponse invalide détectée." };
      }
      const correctedResponse = JSON.parse(JSON.stringify(response, (key, value) => {
          if (replaceUndefined && value === undefined) {
              logger('warn', `⚠️ [validateResponse] Valeur 'undefined' détectée pour la clé '${key}'`);
              return "Donnée manquante";
          }
          return value;
      }));
      logger('info', "✅ [validateResponse] Réponse validée:", correctedResponse);
      return correctedResponse;
  }
  
  /**
   * Normalise une réponse client pour un format unifié
   *
   * @param {Object} client - Les données du client à normaliser.
   * @returns {Object|null} - Les données du client normalisées ou null si non défini.
   */
  function normalizeClientData(client) {
    if (!client) return null;
  
    return {
      name: client.name || client.Nom_Client || client.nom || "Donnée manquante",
      zone: client.zone || client.Zone || "Donnée manquante",
      id: client.id || client.ID_Client || "Donnée manquante"
    };
  }
  
  /**
   * Normalise les détails de livraison
   *
   * @param {Object} livraison - Les données de livraison à normaliser.
   * @returns {Object|null} - Les données de livraison normalisées ou null si non défini.
   */
  function normalizeLivraisonData(livraison) {
    if (!livraison) return null;
    return {
      id: livraison.id || "Donnée manquante",
      odoo_id: livraison.odoo_id || "Donnée manquante",
      total: livraison.total || "Donnée manquante",
      details: livraison.details || "Donnée manquante",
      client: normalizeClientData(livraison.client)
    };
  }
  
  /**
   * Valide le contexte passé dans la fonction formatFinalResponse
   *
   * @param {Object} context - Le contexte à valider.
   * @returns {Object|null} - Le contexte validé ou null si invalide.
   */
  function validateContext(context) {
      if (!context || typeof context !== 'object') {
          logger('warn', '⚠️ [responseUtils] Format contexte invalide:', context);
          return null;
      }
      // Ici, vous pouvez ajouter des validations spécifiques pour le contexte si nécessaire
      return context;
  }
  
  /**
   * Formate la réponse finale selon un standard unifié avec validation complète et logs détaillés.
   *
   * @param {Object} response - La réponse à formater.
   * @param {Object} context - Le contexte associé à la réponse.
   * @returns {Promise<Object>} - La réponse formatée.
   */
  async function formatFinalResponse(response, context = null) {
      try {
          // Validation initiale via validateResponse
          const validatedResponse = validateResponse(response);
  
          logger('info', '🔄 [responseUtils] Début formatage réponse:', {
              type: validatedResponse?.type,
              status: validatedResponse?.status
          });
  
          // Construction de la réponse selon le type
          let formattedResponse;
          switch (validatedResponse.type) {
              case ResponseTypes.DELIVERY:
                  formattedResponse = {
                      success: validatedResponse.status === 'SUCCESS',
                      data: {
                          type: ResponseTypes.DELIVERY,
                          message: validatedResponse.message || "Donnée manquante",
                          livraison: normalizeLivraisonData(validatedResponse.livraison),
                          client: normalizeClientData(validatedResponse.client)
                      }
                  };
                  break;
              case ResponseTypes.ERROR:
                  formattedResponse = {
                      success: false,
                      data: {
                          type: ResponseTypes.ERROR,
                          message: validatedResponse.message || 'Une erreur est survenue',
                          error: {
                              code: validatedResponse.error?.code || 'UNKNOWN_ERROR',
                              details: validatedResponse.error?.details || "Donnée manquante"
                          }
                      }
                  };
                  break;
              default:
                  formattedResponse = {
                      success: true,
                      data: {
                          type: validatedResponse.type || ResponseTypes.RESPONSE,
                          message: validatedResponse.message || "Donnée manquante",
                          details: validatedResponse.details || "Donnée manquante"
                      }
                  };
          }
  
          // Ajout du contexte si présent
          const validatedContext = validateContext(context);
          if (validatedContext) {
              formattedResponse.data.context = validatedContext;
          }
  
          // Ajout timestamp
          formattedResponse.timestamp = new Date().toISOString();
  
          // Log final détaillé
          logger('info', '✅ [responseUtils] Réponse formatée:', {
              success: formattedResponse.success,
              type: formattedResponse.data.type,
              hasContent: !!formattedResponse.data.details || !!formattedResponse.data.livraison,
              hasContext: !!formattedResponse.data.context,
              message: formattedResponse.data.message.slice(0, 100) // Limite la longueur du log
          });
  
          logger('info', '📤 [responseUtils] Format final:', JSON.stringify(formattedResponse, null, 2));
          return formattedResponse;
      
        } catch (error) {
          logger('error', '❌ [responseUtils] Erreur formatage réponse:', {
              error: error.message,
              stack: error.stack,
              originalResponse: response
          });
          // Réponse d'erreur structurée
          return {
              success: false,
              data: {
                  type: ResponseTypes.ERROR,
                  message: 'Erreur lors du formatage de la réponse',
                  error: {
                      message: error.message,
                      code: 'FORMATTING_ERROR',
                      details: error.stack
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
      ResponseTypes,
      validateResponse,
      formatFinalResponse,
      normalizeClientData,
      normalizeLivraisonData
  };