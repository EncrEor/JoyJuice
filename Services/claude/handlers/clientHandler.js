// Services/claude/handlers/clientHandler.js
const StringUtils = require('../utils/stringUtils');
const ValidationUtils = require('../utils/validationUtils');
const ErrorUtils = require('../utils/errorUtils');
const clientLookupService = require('../../clientLookupService');
const contextManager = require('../core/contextManager');
const indexManager = require('../core/indexManager');
console.log('IndexManager instance:', indexManager);

class ClientHandler {
  async findClient(clientName, zone = null) {
    try {
      console.log(`🔍 Recherche client: ${clientName}${zone ? `, zone: ${zone}` : ''}`);
      return await contextManager.resolveClientWithZone(clientName, zone);
    } catch (error) {
      return ErrorUtils.handleClientError(error);
    }
  }

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
      console.log('🔍 Validation et enrichissement client:', clientInfo);

      // 1. Validation complète des données avec ValidationUtils
      if (!ValidationUtils.validateClient(clientInfo)) {
        console.warn('❌ Validation échouée:', clientInfo);
        throw ErrorUtils.createError('Données client invalides', 'CLIENT_VALIDATION_ERROR');
      }

      // 2. Normalisation du nom pour la recherche
      const normalizedName = StringUtils.normalizeString(clientInfo.nom);
      if (!normalizedName) {
        throw ErrorUtils.createError('Nom du client invalide après normalisation', 'INVALID_CLIENT_NAME');
      }

      // 3. Utilisation du resolver centralisé
      const resolverResult = await contextManager.resolveClientWithZone(
        normalizedName,
        clientInfo.zone
      );

      console.log('📋 Résultat résolution:', resolverResult);

      // 4. Traitement du résultat selon le statut
      switch (resolverResult.status) {
        case 'SUCCESS': {
          // Validation supplémentaire des données enrichies
          const enrichedClient = resolverResult.client;
          if (!enrichedClient.ID_Client || !enrichedClient.Nom_Client) {
            throw ErrorUtils.createError(
              'Données client incomplètes après enrichissement',
              'INVALID_ENRICHED_DATA'
            );
          }

          return {
            status: 'SUCCESS',
            client: enrichedClient
          };
        }

        case 'NEED_ZONE':
          return {
            status: 'NEED_ZONE',
            message: resolverResult.message,
            matches: resolverResult.matches,
            availableZones: resolverResult.availableZones,
            originalName: clientInfo.nom // Garder le nom original pour le contexte
          };

        case 'NOT_FOUND':
          throw ErrorUtils.createError(
            resolverResult.message,
            'CLIENT_NOT_FOUND',
            { searchedName: clientInfo.nom, searchedZone: clientInfo.zone }
          );

        default:
          throw ErrorUtils.createError(
            'Erreur lors de la résolution du client',
            'CLIENT_RESOLUTION_ERROR'
          );
      }

    } catch (error) {
      console.error('❌ Erreur validation client:', error, {
        clientInfo,
        errorDetails: error.details || {},
        stack: error.stack
      });
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
