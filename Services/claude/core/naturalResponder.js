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

            // Pour les livraisons, on laisse claudeService gérer
            if (analysis.type === 'ACTION_LIVRAISON') {
                return result;
            }

            // Cas spécial pour la liste des clients
            if (analysis.type === 'DEMANDE_INFO' &&
                analysis.intention_details.type_info === 'LISTE_CLIENTS' &&
                result.status === 'SUCCESS') {

                const clients = result.data.clients;
                // Grouper par zone pour une meilleure lisibilité
                const clientsByZone = clients.reduce((acc, client) => {
                    const zone = client.Zone || 'Sans zone';
                    if (!acc[zone]) acc[zone] = [];
                    acc[zone].push(client);
                    return acc;
                }, {});

                // Formater la réponse
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

            // Construction du prompt contextuel
            let prompt = this.buildPromptFromResults(analysis, result);
            console.log('📝 Prompt construit:', prompt);

            // Appel à Claude pour la réponse naturelle
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

            // Enrichir la réponse avec le contexte
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

        // Ajouter le type d'intention
        if (analysis.type) {
            prompt += `\nType d'intention: ${analysis.type}`;
        }

        // Ajouter les informations client
        if (result.client) {
            prompt += `\nClient: ${result.client.Nom_Client} (${result.client.Zone || 'zone non spécifiée'})`;
        }

        // Ajouter les détails du résultat
        prompt += `\nRésultat: ${result.status || 'non spécifié'}`;
        if (result.message) {
            prompt += `\nMessage: ${result.message}`;
        }

        // Ajouter les options disponibles
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

        // Ajouter des suggestions selon le contexte
        if (result.nextActions?.available) {
            response.suggestions = result.nextActions.available;
        }

        // Si besoin de clarification zone
        if (result.status === 'needs_clarification' && result.zones) {
            response.zones = result.zones;
        }

        // Ajouter les options si disponibles
        if (result.options) {
            response.options = result.options;
        }

        return response;
    }
}

module.exports = new NaturalResponder();