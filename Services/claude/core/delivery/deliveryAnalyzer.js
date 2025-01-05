// deliveryAnalyzer.js 
const { Anthropic } = require('@anthropic-ai/sdk');
const juiceFamilies = require('./JuiceFamilies');

class DeliveryAnalyzer {
 constructor(clientsService, produitsService) {
   this.clientsService = clientsService;
   this.produitsService = produitsService;
   this.systemPrompt = null;
 }

 async initialize() {
   console.log('🔄 Initialisation DeliveryAnalyzer...');
   
   // Initialisation de Anthropic
   this.anthropic = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY});
   
   // Récupérer les données de référence
   const [clients, products] = await Promise.all([
     this.clientsService.getClientsData(),
     this.produitsService.getProduitsData()
   ]);

   // Construire le prompt avec toutes les données nécessaires
   this.systemPrompt = `Tu es l'assistant JoyJuice spécialisé dans l'analyse des messages de livraison et de demandes d'information sur le client.

TABLES DE RÉFÉRENCE:

1. ABRÉVIATIONS PRODUITS:
${JSON.stringify(juiceFamilies, null, 2)}

2. CLIENTS (avec leurs abréviations et formats par défaut):
${clients.map(c => 
  `${c.Nom_Client}:
   - Abréviations: ${Object.entries(c).filter(([k]) => k.startsWith('AB')).map(([,v]) => v).filter(Boolean).join(', ')}
   - Zone: ${c.zone || 'N/A'}
   - Format par défaut: ${c.DEFAULT || '1'}`
).join('\n')}

3. PRODUITS DISPONIBLES:
${products.map(p => 
  `${p.ID_Produit}: ${p.Nom_Produit} (${p.Prix_Unitaire} DNT)`
).join('\n')}

RÈGLES DE GESTION:

1. RÈGLE CLIENT:
- Première ligne = toujours le client
- Peut inclure "surgelé", date, etc.
- Si "retour" mentionné = créer livraison de type retour

2. RÈGLE SÉQUENCES CHIFFRES:
- DEFAULT 1 = quantités pour Citron 1L, Mojito 1L, Fraise 1L, Red 1L, Cool 1L
- DEFAULT 25 = mêmes produits en 25CL
- DEFAULT 5 = quantités pour Fraise 5L, Citron 5L
- Si 2 lignes de chiffres = 1L puis 25CL
RÈGLE SÉQUENCES CHIFFRES:
Exemple: Si on a ces deux lignes :
"0 1 0 5mg"
"3 3 3 3 3"
→ La première ligne donne des produits 1L : 1 M1L, 5 MG1L
→ La deuxième ligne donne du 25CL : 3 C25CL, 3 M25CL, 3 F25CL, 3 R25CL, 3 CL25CL


3. RÈGLE FORMATS:
- "surgelé/surg/surgele" = utiliser versions surgelées (ID + "S")
- "5L" = format 5L pour les lignes suivantes
- "25cl/25/25CL" = format 25CL 
- Format par défaut = 1L
Les lignes comme "surgele", "25", "5L" changent le format pour TOUTES les lignes qui suivent jusqu'au prochain changement.
Exemple:
"surgele 1L"    → active le format surgelé 1L (suffixe 'S')
"1 f"           → donne 1 F1LS (car surgelé actif)
"2 mg"          → donne 2 MG1LS (car surgelé actif)
"25"            → change en format 25CL
"2 as"          → donne 2 AS25CL (car format 25CL actif)

4. RÈGLE LIGNES PRODUITS:
- Format: [quantité] [abréviation] [format optionnel]
- Le format spécifié s'applique jusqu'au prochain changement

5. RÈGLE RETOURS:
- Si le message contient "Retour", il faut le diviser en deux opérations distinctes
- Première partie : tous les produits avant le mot "Retour" → livraison normale (isReturn: false)
- Deuxième partie : tous les produits après le mot "Retour" → nouvelle livraison (isReturn: true)
- Le même client est conservé pour les deux opérations
Exemple:
"Frais nasr
2 f 1L
3 mg
Retour
1 f 25"
→ Crée 2 livraisons :
1. Livraison normale : 2 F1L + 3 MG1L pour Frais d'Ici Ennasr
2. Retour : 1 F25CL pour Frais d'Ici Ennasr

EXEMPLES DE MESSAGES:
Bombay W
10 7 8
-
La rose
25 10 15 10 10
-
Bgh nasr
4 3 3
5L
1 1
Retour
2 1 1
-
Ksouri
0 4 0
Surgelé
4 mangue 1l
3 cool 1l
3 réd 1l
4 kiwi 25
-
Les delices
1 3 0
Surgl 1L
1 mj
1 red
-
Lord
1 f 3L

Tu dois analyser le message et retourner un JSON avec cette structure:
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

   console.log('✅ DeliveryAnalyzer initialisé');
 }

 async analyzeMessage(message) {
  try {
    console.log('📝 Analyse message:', message);

    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyse ce message de livraison et renvoie UNIQUEMENT un objet JSON sans texte d'accompagnement : ${message}`
      }],
      system: `${this.systemPrompt}\n\nIMPORTANT: Renvoie UNIQUEMENT le JSON sans texte d'accompagnement.`
    });

    console.log('🔍 Message envoyé:', message);
    console.log('📤 Réponse brute:', response.content[0].text);

    const result = JSON.parse(response.content[0].text);
    console.log('✅ Analyse complétée:', result);
    return result;

  } catch (error) {
    console.error('❌ Erreur analyse message:', error);
    throw error;
  }
}
}

module.exports = DeliveryAnalyzer;