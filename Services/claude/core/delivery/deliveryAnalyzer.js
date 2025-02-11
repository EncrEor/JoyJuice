// deliveryAnalyzer.js 

const { Anthropic } = require('@anthropic-ai/sdk');
const juiceFamilies = require('./JuiceFamilies');
const clientLookupService = require('../../../../Services/clientLookupService');

class DeliveryAnalyzer {
  constructor(context) {
    this.context = context;
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.systemPrompt = null;
  }

  async initialize() {

    console.log('🧐 Vérification données du cache:', {
      hasClients: !!this.context.clients,
      hasProducts: !!this.context.products?.byId,
      clientsFormat: this.context.clients?.byId ? 'object' : 'array',
      productsCount: Object.keys(this.context.products?.byId || {}).length
    });

    if (this.systemPrompt) {
      console.log('✅ DeliveryAnalyzer déjà initialisé');
      return;
    }

    //console.log('🔄 (deliveryAnalyzer)Initialisation DeliveryAnalyzer...');

    // Extraire clients et produits du contexte
    const clients = this.context.clients || [];
    const products = this.context.products?.byId ?
      Object.values(this.context.products.byId) : [];

    // Construction du prompt
    const referenceTables = this.buildReferenceTables(clients, products);
    const rules = this.buildRules();
    const examples = this.buildExamples();
    const outputFormat = this.buildOutputFormat();

    this.systemPrompt = `Tu es l'assistant JoyJuice spécialisé dans l'analyse des messages de livraison et de demandes d'information sur le client.
   
    ${referenceTables}
    ${rules}
    ${examples}
    ${outputFormat}`;

    console.log('✅ [deliveryAnalyzer] DeliveryAnalyzer initialisé');
  }

  buildReferenceTables(clients, products) {
    return `TABLES DE RÉFÉRENCE:
     
    1. ABRÉVIATIONS PRODUITS:
    ${JSON.stringify(juiceFamilies, null, 2)}
     
    2. CLIENTS:
    ${Array.isArray(clients) ? clients.map(c =>
      `${c.Nom_Client} - Zone: ${c.zone || 'N/A'}`
    ).join('\n') : '(Aucun client dans le cache)'}
     
    3. PRODUITS:
    ${Array.isArray(products) ? products.map(p =>
      `${p.Nom_Produit} (${p.Prix_Unitaire} DNT)`
    ).join('\n') : '(Aucun produit dans le cache)'}`;
  }

  buildRules() {
    return `RÈGLES DE GESTION:
 
  1. RÈGLE CLIENT:
  - Première ligne = toujours le client

  2. RÈGLE PRODUITS:
  - CONTENANCE: définit le volume (1L, 1l, 25CL,25, 25cl, 5L, 3L...)
    > Par défaut : 1L
    > Change avec : "5L", "25cl", "25", "25CL"
    > 25cl = 25 = 25CL
    
  - ATTRIBUT: définit si le produit est frais ou surgelé
    > PAR DEFAUT : frais (pas de suffixe)
    > Si "surgelé/surg/Surgl/surgele" : surgelé. Garder Surgelé actif jusqu'a la fin du message ou le prochain Frais.
    
  - TYPE: définit s'il s'agit d'une livraison ou d'un retour
    > Par défaut : livraison
    > Change avec le mot "Retour"
  
  3. RÈGLE TRAITEMENT PAR LIGNE:
  
  a) SÉQUENCES DE CHIFFRES:
  - 1ère séquence (la 1ere ligne de chiffre)= 
  SI le client sa valeur DEFAULT = 1 alors 1L : [C] [M] [F] [R] [CL]
  SI le client sa valeur DEFAULT = 25 alors 25CL : [C] [M] [F] [R] [CL]
  SI le client sa valeur DEFAULT = 5 alors 5L : [F] [C]
    Ex1: (DEFAULT = 1) et (cas particulier ou on précise le nom du produit à coté de la quantité) : "0 1 0 5mg" → 1 M1L + 5 MG1L
    Ex2: (DEFAULT = 5) : "1 3" → 1 F5L + 3 C5L

  - 2EME SEQUENCE = 25CL : [C] [M] [F] [R] [CL]
    Ex: "1 1 1 1 1" → 1 C25CL, 1 M25CL, etc.
  
  b) LIGNES SIMPLES:
  Format : [quantité] [produit] [contenance optionnelle]
  
  4. CONSTRUCTION DES ID PRODUITS:
  - Structure : [CODE_PRODUIT][CONTENANCE][ATTRIBUT?]
    Exemples:
    > Frais 1L : F1L
    > Surgelé 1L : F1LS
    > Frais 25CL : F25CL
    > Surgelé 25CL : F25CLS`;
  }

  buildExamples() {
    return `EXEMPLES DE MESSAGES ET LEURS RÉSULTATS:

1. Message:
716  (client avec DEFAULT=5)
2 2
Résultat attendu:
{
  "type": "DELIVERY",
  "client": {"name": "716", "id": "C00021"},
  "products": [
    {"ID_Produit": "F5L", "quantite": 2},
    {"ID_Produit": "C5L", "quantite": 2}
  ]    
}

2. Message:
Ksouri
2 1 0 1mg
1 1 1 1 1 
Résultat attendu:
{
  "type": "DELIVERY",
  "isReturn": false,
  "client": {"name": "Ben Ksouri Shop", "zone": "Soukra"}
  "products": [
    {"ID_Produit": "C1L", "quantite": 2},
    {"ID_Produit": "M1L", "quantite": 1},
    {"ID_Produit": "F1L", "quantite": 0},
    {"ID_Produit": "MG1L", "quantite": 1},
    {"ID_Produit": "R1L", "quantite": 0}, //implicite)
    {"ID_Produit": "CL1L", "quantite": 0}, //implicite)
    {"ID_Produit": "C25CL", "quantite": 1},
    {"ID_Produit": "M25CL", "quantite": 1},
    {"ID_Produit": "F25CL", "quantite": 1},
    {"ID_Produit": "R25CL", "quantite": 1},
    {"ID_Produit": "CL25CL", "quantite": 1}
  ]
}

3. Message:
Bgh nasr
4 3 3
5L
1 1
Retour
2 1 1
Résultat attendu:
{
    "type": "DELIVERY",
    "isReturn": false,
    "client": {"name": "BGH Ennasr", "zone": "Ennasr"},
    "products": [
      {"ID_Produit": "C1L", "quantite": 4},
      {"ID_Produit": "M1L", "quantite": 3},
      {"ID_Produit": "F1L", "quantite": 3},
      {"ID_Produit": "C5L", "quantite": 1},
      {"ID_Produit": "F5L", "quantite": 1}
    ]
  },
  {
    "type": "DELIVERY", 
    "isReturn": true,
    "client": {"name": "BGH Ennasr", "zone": "Ennasr"},
    "products": [
      {"ID_Produit": "C5L", "quantite": 2},
      {"ID_Produit": "F5L", "quantite": 1},
      {"ID_Produit": "C1L", "quantite": 1}
    ]
}
  
4. Message:
Ksouri
0 4 0
Surgelé
4 mangue 1l
3 cool 1l
3 réd 1l
4 kiwi 25
Résultat attendu:
  {
    "type": "DELIVERY",
    "isReturn": false,
    "client": {"name": "Ben Ksouri Shop", "zone": "Soukra"},
    "products": [
      {"ID_Produit": "M1L", "quantite": 4},
      {"ID_Produit": "MG1LS", "quantite": 4},
      {"ID_Produit": "CL1LS", "quantite": 3},
      {"ID_Produit": "R1LS", "quantite": 3}, 
      {"ID_Produit": "K25CL", "quantite": 4}
    ]
  }

  `;
  }

  buildOutputFormat() {
    return `Tu dois analyser le message et retourner un JSON avec cette structure:
   {
    "type": "DELIVERY",
    "isReturn": boolean,
    "client": {
      "name": string,
      "zone": string
    },
    "products": [{
      "ID_Produit": string, // ID exact de la table produits
      "quantite": number
    }]
   }`;
  }

  async analyzeMessage(message) {
    try {
      console.log('📝 [DeliveryAnalyzer] Début analyse message:', message);
  
      // 1. Préparation du message avec le contexte si nécessaire
      let processedMessage = message.trim();
      if (this.context.lastClient && !processedMessage.includes('\n')) {
        processedMessage = `${this.context.lastClient.Nom_Client}\n${processedMessage}`;
        console.log('📝 [DeliveryAnalyzer] Message enrichi avec client du contexte:', processedMessage);
      }
  
      // 2. Extraction et validation du client
      const lines = processedMessage.split('\n');
      const clientName = lines[0].trim();
      
      console.log('👤 [DeliveryAnalyzer] Recherche client:', clientName);
      
      const clientResult = await clientLookupService.findClientByNameAndZone(clientName);
      if (!clientResult || clientResult.status !== 'success') {
        throw new Error(`Client non trouvé: ${clientName}`);
      }
  
      // Récupérer la valeur DEFAULT depuis les abréviations
      const defaultValue = clientResult.client.DEFAULT || '1';
      //console.log('✅ Client trouvé:', {
      //  nom: clientResult.client.Nom_Client,
      //  zone: clientResult.client.zone,
     //   DEFAULT: defaultValue
     // });
  
      // 3. Construction du message enrichi pour Claude avec la valeur DEFAULT
      const enrichedClientInfo = `Client ${clientResult.client.Nom_Client} (DEFAULT=${defaultValue})`;
      const restOfMessage = lines.slice(1).join('\n');
      const enrichedMessage = `${enrichedClientInfo}\n${restOfMessage}`;
  
      console.log('📦 [DeliveryAnalyzer] Préparation analyse Claude:', {
        hasContext: !!this.context,
        hasSystemPrompt: !!this.systemPrompt,
        messageLength: enrichedMessage.length,
        defaultValue
      });
  
      // 4. Appel à Claude pour l'analyse
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        temperature: 0.05,
        messages: [{
          role: 'user',
          content: `${enrichedMessage}\n\nAnalyse le message ci-dessus et renvoie l'objet JSON correspondant à la livraison.`
        }],
        system: `${this.systemPrompt}\n\nIMPORTANT: Ne fais AUCUN texte d'accompagnement. Renvoie uniquement un objet JSON valide sans aucune autre réponse.`
      });
  
// 5. Traitement et enrichissement du résultat
const result = JSON.parse(response.content[0].text);

// Enrichir avec toutes les données client trouvées par abréviation
if (result.client) {
  result.client = {
    name: clientResult.client.Nom_Client, // Utiliser le nom complet trouvé
    zone: result.client.zone,  // Garder la zone analysée
    id: clientResult.client.ID_Client,
    DEFAULT: clientResult.client.DEFAULT, // On s'assure que DEFAULT est copié
    originalData: clientResult.client // On garde l'objet client complet
  };
}

console.log('✅ [DeliveryAnalyzer] Analyse terminée:', {
  client: result.client,
  productsCount: result.products?.length,
  defaultValue: clientResult.client.DEFAULT
});

return result;
  
    } catch (error) {
      console.error('❌ Erreur analyse message:', {
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}

module.exports = DeliveryAnalyzer;