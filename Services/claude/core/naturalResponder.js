// Services/claude/core/naturalResponder.js
const { Anthropic } = require('@anthropic-ai/sdk');

class NaturalResponder {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.systemPrompt = `Tu es l'assistant JoyJuice, expert dans la gestion des livraisons de jus de fruits.
    Tu parles en français de manière naturelle, concise et efficace avec Nizar.

    Règles importantes :
    1. Sois direct et naturel - pas de formalités inutiles
    2. Réponds toujours avec le contexte du client en tête
    4. Si tu as besoin d'une précision, demande-la clairement
    5. Quand le livreur parle de livraison, confirme simplement l'enregistrement de la livraison :
    Format de réponse pour une livraison effectuée :
    "Bon de livraison L00XX enregistré pour [client] ([zone]) : [quantité] [produit] pour un total de [total] DNT"
    6. Quand tu parles d'un client, inclus toujours sa zone si tu la connais.`;
  }

  async generateResponse(analysis, result) {
    try {
      console.log('💬 Génération réponse naturelle pour:', { analysis, result });

      if (analysis.type === 'ACTION_LIVRAISON') {
        return result;
      }

      if (analysis.type === 'DEMANDE_INFO' &&
        analysis.intention_details.type_info === 'LISTE_CLIENTS' &&
        result.status === 'SUCCESS') {

        const clients = result.data.clients;
        const clientsByZone = clients.reduce((acc, client) => {
          const zone = client.Zone || 'Sans zone';
          if (!acc[zone]) acc[zone] = [];
          acc[zone].push(client);
          return acc;
        }, {});

        let message = 'Voici la liste des clients par zone :\n\n';
        Object.entries(clientsByZone).forEach(([zone, zoneClients]) => {
          message += `${zone}:\n`;
          zoneClients.forEach(client => {
            message += `• ${client.Nom_Client}\n`;
          });
          message += '\n';
        });

        return {
          message,
          suggestions: ['Voir les détails d\'un client', 'Créer une livraison']
        };
      }

      let prompt = this.buildPromptFromResults(analysis, result);
      console.log('📝 Prompt construit:', prompt);

      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: prompt
        }],
        system: this.systemPrompt
      });

      if (!response?.content?.[0]?.text) {
        throw new Error('Réponse invalide de Claude');
      }

      return this.enrichResponse(
        response.content[0].text,
        analysis,
        result
      );

    } catch (error) {
      console.error('❌ Erreur génération réponse:', error);
      return {
        message: "Désolé, j'ai rencontré une difficulté. Pouvez-vous reformuler ?",
        suggestions: ["Réessayer"],
        error: true
      };
    }
  }

  buildPromptFromResults(analysis, result) {
    let prompt = 'Contexte :';

    if (analysis.type) {
      prompt += `\nType d'intention: ${analysis.type}`;
    }

    if (result.client) {
      prompt += `\nClient: ${result.client.Nom_Client} (${result.client.Zone || 'zone non spécifiée'})`;
    }

    prompt += `\nRésultat: ${result.status || 'non spécifié'}`;
    if (result.message) {
      prompt += `\nMessage: ${result.message}`;
    }

    if (result.nextActions?.available) {
      prompt += `\nActions possibles: ${result.nextActions.available.join(', ')}`;
    }

    return prompt;
  }

  enrichResponse(message, analysis, result) {
    const response = {
      message: message,
      suggestions: []
    };

    if (result.nextActions?.available) {
      response.suggestions = result.nextActions.available;
    }

    if (result.status === 'needs_clarification' && result.zones) {
      response.zones = result.zones;
    }

    if (result.options) {
      response.options = result.options;
    }

    return response;
  }
}

module.exports = new NaturalResponder();
