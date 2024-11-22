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