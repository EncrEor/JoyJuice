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
      console.log('🔍 Début validation et enrichissement client:', clientInfo);
  
      // Validation préliminaire
      if (!clientInfo || typeof clientInfo !== 'object') {
        throw ErrorUtils.createError('Données client invalides', 'CLIENT_VALIDATION_ERROR');
      }
  
      // Log de toutes les propriétés reçues
      console.log('📋 Propriétés client reçues:', {
        nom: clientInfo.nom || clientInfo.name,
        zone: clientInfo.zone,
        id: clientInfo.id
      });
  
      // Appel au service avec le nom complet
      const clientResult = await clientLookupService.findClientByNameAndZone(
        clientInfo.nom || clientInfo.name,
        clientInfo.zone
      );
  
      // Log du résultat détaillé
      console.log('📋 Résultat lookup service:', {
        status: clientResult?.status,
        client: clientResult?.client,
        raw: clientResult
      });
  
      // Si client trouvé avec succès
      if (clientResult?.status === 'success' && clientResult.client) {
        const enrichedClient = {
          ID_Client: clientResult.client.ID_Client,
          Nom_Client: clientResult.client.Nom_Client,
          DEFAULT: clientResult.client.DEFAULT,
          Zone: clientInfo.zone || clientResult.client.zone
        };
        console.log('✅ Client enrichi:', enrichedClient);
        
        return {
          status: 'SUCCESS',
          client: enrichedClient
        };
      }
  
      // Si besoin de zone
      if (clientResult?.status === 'multiple') {
        return {
          status: 'NEED_ZONE',
          message: clientResult.message,
          matches: clientResult.matches,
          availableZones: clientResult.zones
        };
      }
  
      // Autres cas (erreur)
      throw new Error(clientResult?.message || 'Client non trouvé');
  
    } catch (error) {
      console.error('❌ Erreur validation client:', {
        message: error.message,
        code: error.code,
        clientInfo,
        stack: error.stack
      });
      
      return {
        status: 'ERROR',
        error: {
          message: error.message || 'Erreur validation client',
          code: error.code || 'VALIDATION_ERROR'
        }
      };
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