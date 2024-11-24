//Services/claude/handlers/clientHandler.js

const StringUtils = require('../utils/stringUtils');
const ValidationUtils = require('../utils/validationUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const contextManager = require('../core/contextManager');

class ClientHandler {
  async findClient(clientName, zone = null) {
    try {
      console.log(`🔍 Recherche client: ${clientName}${zone ? `, zone: ${zone}` : ''}`);
      const result = await clientLookupService.findClientByNameAndZone(clientName, zone);
      
      if (!result) {
        throw ErrorUtils.createError('Client non trouvé', 'CLIENT_NOT_FOUND');
      }

      if (result.status === 'multiple_matches') {
        return {
          status: 'NEED_ZONE',
          matches: result.matches,
          message: `Client ${clientName} présent dans zones: ${result.matches.map(m => m.zone).join(', ')}`
        };
      }

      return {
        status: 'SUCCESS',
        client: result.client
      };
    } catch (error) {
      return ErrorUtils.handleClientError(error);
    }
  }

/**
 * Gère la sélection d'un client y compris la mise à jour du contexte
 * @param {Object} clientInfo - Informations du client à sélectionner
 * @param {string} userId - ID utilisateur pour le contexte
 * @returns {Object} Résultat de la sélection avec statut
 */
async handleClientSelection(clientInfo, userId) {
  try {
      console.log('👥 Traitement sélection client:', { 
          nom: clientInfo.nom, 
          zone: clientInfo.zone,
          userId 
      });

      // 1. Recherche du client avec potentielle zone
      const lookupResult = await clientLookupService.findClientByNameAndZone(
          clientInfo.nom, 
          clientInfo.zone
      );

      console.log('🔍 Résultat recherche:', lookupResult);

      // 2. Gestion selon le résultat
      switch (lookupResult.status) {
          case 'success': {
              // Client trouvé - Mise à jour du contexte
              await contextManager.updateConversationContext(userId, {
                  lastClient: lookupResult.client,
                  conversationState: 'CLIENT_SELECTED'
              });

              console.log('✅ Client confirmé:', lookupResult.client);

              return {
                  status: 'success',
                  message: `Client "${lookupResult.client.Nom_Client}" confirmé dans la zone "${lookupResult.client.Zone}".`,
                  client: lookupResult.client,
                  nextActions: {
                      available: ['info', 'livraison'],
                      suggested: 'Voulez-vous voir les informations du client ou créer une livraison ?'
                  }
              };
          }

          case 'multiple': {
              console.log('ℹ️ Plusieurs clients possibles dans des zones différentes');
              await contextManager.updateConversationContext(userId, {
                  conversationState: 'WAITING_ZONE'
              });

              return {
                  status: 'needs_clarification',
                  message: lookupResult.message,
                  matches: lookupResult.matches,
                  zones: lookupResult.zones
              };
          }

          case 'not_found': {
              console.log('❌ Client non trouvé');
              return {
                  status: 'not_found',
                  message: lookupResult.message
              };
          }

          default: {
              console.error('❌ Statut non géré:', lookupResult.status);
              throw new Error('Résultat de recherche invalide');
          }
      }

  } catch (error) {
      console.error('❌ Erreur dans handleClientSelection:', error);
      return {
          status: 'error',
          message: `Erreur lors de la sélection du client: ${error.message}`
      };
  }
}

  async validateAndEnrichClient(clientInfo) {
    try {
      if (!ValidationUtils.validateClient(clientInfo)) {
        throw ErrorUtils.createError('Données client invalides', 'CLIENT_VALIDATION_ERROR');
      }

      const normalizedName = StringUtils.normalizeString(clientInfo.nom);
      const client = await this.findClient(normalizedName, clientInfo.zone);

      if (client.status === 'SUCCESS') {
        return {
          status: 'SUCCESS',
          client: client.client
        };
      }

      return client;
    } catch (error) {
      return ErrorUtils.handleClientError(error);
    }
  }

  async updateClientContext(userId, client) {
    try {
      if (!userId || !client) {
        throw ErrorUtils.createError('Données contexte invalides', 'CONTEXT_ERROR');
      }

      const context = await contextManager.getConversationContext(userId);
      context.lastClient = client;

      await contextManager.updateConversationContext(userId, context);

      return {
        status: 'SUCCESS',
        context: context
      };
    } catch (error) {
      return ErrorUtils.handleClientError(error);
    }
  }

  resolveClientFromContext(context, explicitClient = null) {
    // Si client explicite fourni, le valider et l'utiliser
    if (explicitClient) {
      if (!ValidationUtils.validateClient(explicitClient)) {
        throw ErrorUtils.createError('Client explicite invalide', 'CLIENT_VALIDATION_ERROR');
      }
      return explicitClient;
    }

    // Sinon utiliser le dernier client du contexte
    if (context?.lastClient) {
      return {
        nom: context.lastClient.Nom_Client,
        zone: context.lastClient.zone,
        implicite: true
      };
    }

    return null;
  }
}

module.exports = new ClientHandler();