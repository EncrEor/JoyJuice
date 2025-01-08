// Services/claude/core/naturalResponder.js
const { Anthropic } = require('@anthropic-ai/sdk');

class NaturalResponder {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Configuration du mode
    this.config = {
      conciseMode: true
    };

    this.systemPrompt = `Tu es l'assistant JoyJuice, avec accès direct au cache contenant :
- Clients (détails, zones, ...)
- Produits (noms, prix, ...)
- Détail des Livraisons (quantités, produits, clients, zones, ...) 
Tu aides le livreur à :
- Obtenir les informations clients depuis la base de données
- Créer et modifier les livraisons
- Répondre aux questions du livreurs depuis les données existantes dans la base de données.

Formats de réponse :
1. Livraison : "Bon L00XX enregistré : [quantité] [produit] pour [client] ([zone])"
2. Client ambigu : "[client] présent dans : [zone1], [zone2]"
3. Erreur : "[problème]. [solution]"

Règles :
1. Réponses courtes et directes
2. Inclure zone client si disponible
3. Précision demandée si info manquante
4. Suggestions uniquement si utiles
5. Pas de répétition d'infos déjà connues`;
}

async generateResponse(analysis, result) {
  try {
    console.log('💬 Analyse message:', {
      type: analysis?.type,
      status: result?.status,
      client: result?.client?.Nom_Client
    });

    // Validate input
    if (!analysis || !result) {
      throw new Error('Paramètres invalides');
    }

    // Handle errors
    if (result.status === 'ERROR') {
      const errorMsg = result.error?.message || 'Erreur technique';
      console.error('❌ Erreur:', errorMsg);
      return {
        message: `Désolé, je ne peux pas traiter cette demande: ${errorMsg}`,
        suggestions: ["Réessayer", "Reformuler la demande"],
        error: true
      };
    }

    if (analysis.type === 'DEMANDE_INFO' && result.status === 'SUCCESS') {
      console.log('ℹ️ [generateResponse] Demande d\'informations détectée.');

      const client = result.client;
      const champsDemandes = analysis.intention_details.champs || [];
      const reponses = [];

      champsDemandes.forEach(champ => {
        if (champ === 'adresse' && client?.Adresse) {
          reponses.push(`Adresse : ${client.Adresse}`);
        }
        if (champ === 'tel' && client?.Tel) {
          reponses.push(`Téléphone : ${client.Tel}`);
        }
        if (champ === 'solde' && client?.Solde) {
          reponses.push(`Solde : ${client.Solde}`);
        }
      });

      if (reponses.length > 0) {
        return {
          message: `Voici les informations demandées pour ${client.Nom_Client} :\n\n${reponses.join('\n')}`,
          suggestions: ["Voir plus d'informations", "Créer une livraison"]
        };
      }

      return {
        message: `Je n'ai pas trouvé les informations demandées pour ${client.Nom_Client || "le client"}.\nPouvez-vous reformuler ?`,
        suggestions: ["Réessayer avec d'autres informations"]
      };
    }

    console.log('📝 Passage au modèle Claude pour un traitement plus libre.');
    const prompt = this.buildPromptFromResults(analysis, result);

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
      console.error('❌ Réponse invalide de Claude.');
      throw new Error('Réponse invalide.');
    }

    console.log('✅ Réponse générée avec succès :', response.content[0].text);
    return {
      message: response.content[0].text,
      suggestions: []
    };

  } catch (error) {
    console.error('❌ Erreur générale:', {
      message: error.message,
      stack: error.stack 
    });
    
    return {
      message: "Une erreur est survenue, veuillez réessayer.",
      suggestions: ["Reformuler", "Contacter le support"],
      error: true
    };
  }
}

buildPromptFromResults(analysis, result) {
  try {
    console.log('💬 [buildPromptFromResults] Début de la construction du prompt.');
    
    // Initialisation du prompt avec le contexte de base
    let prompt = 'Contexte :';

    // Ajout du type d'intention
    if (analysis.type) {
      prompt += `\nType d'intention: ${analysis.type}`;
      console.log(`🔍 [buildPromptFromResults] Type d'intention détecté : ${analysis.type}`);
    }

    // Ajout des informations client si disponibles
    if (result.client) {
      const clientInfo = `${result.client.Nom_Client} (${result.client.Zone || 'zone non spécifiée'})`;
      prompt += `\nClient: ${clientInfo}`;
      console.log(`🔍 [buildPromptFromResults] Informations client ajoutées : ${clientInfo}`);
    }

    // Ajout du statut du résultat
    prompt += `\nRésultat: ${result.status || 'non spécifié'}`;
    console.log(`🔍 [buildPromptFromResults] Statut du résultat : ${result.status || 'non spécifié'}`);

    // Ajout du message du résultat si disponible
    if (result.message) {
      prompt += `\nMessage: ${result.message}`;
      console.log(`🔍 [buildPromptFromResults] Message du résultat : ${result.message}`);
    }

    // Ajout des champs demandés si disponibles
    if (analysis.intention_details?.champs?.length > 0) {
      const champsDemandes = analysis.intention_details.champs.join(', ');
      prompt += `\nChamps demandés : ${champsDemandes}`;
      console.log(`🔍 [buildPromptFromResults] Champs demandés ajoutés : ${champsDemandes}`);
    }

    // Ajout des actions possibles si disponibles
    if (result.nextActions?.available) {
      const actionsPossibles = result.nextActions.available.join(', ');
      prompt += `\nActions possibles: ${actionsPossibles}`;
      console.log(`🔍 [buildPromptFromResults] Actions possibles ajoutées : ${actionsPossibles}`);
    }

    // Finalisation et retour du prompt
    console.log('✅ [buildPromptFromResults] Prompt construit avec succès :', prompt);
    return prompt;
  } catch (error) {
    console.error('❌ [buildPromptFromResults] Erreur lors de la construction du prompt :', error.message);
    throw error; // Relance l'erreur pour un traitement ultérieur
  }
}

enrichResponse(message, analysis, result) {
  try {
    console.log('💬 [enrichResponse] Début de l\'enrichissement de la réponse.');
    console.log('🔍 [enrichResponse] Message brut reçu :', message);
    console.log('🔍 [enrichResponse] Analysis:', analysis);
    console.log('🔍 [enrichResponse] Result:', result);

    const response = {
      message: message,
      suggestions: []
    };

    // Ajout des suggestions si disponibles
    if (result.nextActions?.available) {
      response.suggestions = result.nextActions.available;
      console.log('✅ [enrichResponse] Suggestions ajoutées :', result.nextActions.available);
    }

    // Gestion des clarifications si nécessaire
    if (result.status === 'needs_clarification' && result.zones) {
      response.message = `Client ambigu : "${result.client?.Nom_Client || 'Client'} présent dans : ${result.zones.join(', ')}"`;
      response.suggestions = ['Préciser la zone'];
      console.log('⚠️ [enrichResponse] Clarification nécessaire pour les zones :', result.zones);
      return response;
    }

    // Génération dynamique de la réponse pour les demandes d'informations client
    if (analysis.type === 'DEMANDE_INFO' && analysis.intention_details.type_info === 'INFO_CLIENT') {
      console.log('🔍 [enrichResponse] Demande d\'information client détectée.');

      const client = result.client || {};
      const champsDemandes = analysis.intention_details.champs || [];
      const availableFields = Object.keys(client).filter(key => client[key] !== undefined && client[key] !== 'NA');
      const enrichedMessages = [];

      console.log('🔍 [enrichResponse] Champs disponibles pour le client :', availableFields);
      console.log('🔍 [enrichResponse] Champs demandés :', champsDemandes);

      // Parcours des champs demandés pour générer la réponse
      champsDemandes.forEach(champ => {
        if (availableFields.includes(champ)) {
          const champValue = client[champ];
          enrichedMessages.push(`Le champ "${champ}" pour ${client.Nom_Client || 'ce client'} est : ${champValue}.`);
          console.log(`✅ [enrichResponse] Champ "${champ}" ajouté à la réponse :`, champValue);
        } else {
          console.warn(`⚠️ [enrichResponse] Champ "${champ}" non disponible pour ce client.`);
        }
      });

      // Si aucun champ spécifique demandé, fournir un résumé des informations disponibles
      if (champsDemandes.length === 0) {
        const resume = availableFields.map(field => `${field} : ${client[field]}`).join('\n');
        response.message = `Voici les informations disponibles pour ${client.Nom_Client || 'ce client'} :\n${resume}`;
        console.log('✅ [enrichResponse] Résumé des informations client :', resume);
      } else if (enrichedMessages.length > 0) {
        response.message = enrichedMessages.join('\n');
        console.log('✅ [enrichResponse] Réponse enrichie générée :', response.message);
      } else {
        response.message = `Je n'ai pas trouvé les informations demandées (${champsDemandes.join(', ')}) pour ${client.Nom_Client || 'ce client'}.`;
        console.log('⚠️ [enrichResponse] Aucune information trouvée pour les champs demandés.');
      }
    }

    console.log('✅ [enrichResponse] Réponse finale enrichie :', response);
    return response;
  } catch (error) {
    console.error('❌ [enrichResponse] Erreur durant l\'enrichissement de la réponse :', error);
    return {
      message: "Désolé, une erreur est survenue lors de l'enrichissement de la réponse.",
      suggestions: ["Réessayer"],
      error: true
    };
  }
}
}

module.exports = new NaturalResponder();
