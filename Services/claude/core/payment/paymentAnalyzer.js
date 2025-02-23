// Services/claude/core/payment/paymentAnalyzer.js

const { Anthropic } = require('@anthropic-ai/sdk');
const clientLookupService = require('../../../clientLookupService');
const odooSalesService = require('../../../odooSalesService'); // Nous utiliserons ce service pour créer les paiements dans Odoo

class PaymentAnalyzer {
  constructor(context) {
    this.context = context;
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.systemPrompt = null;
  }

  async initialize() {
    console.log('🔄 [paymentAnalyzer] Initialisation PaymentAnalyzer...');

    // Configuration du prompt système
    this.systemPrompt = `Tu es l'assistant JoyJuice spécialisé dans l'analyse des messages de paiement client.
    
    RÈGLES DE TRAITEMENT DES PAIEMENTS:
    1. Format du message:
       - Première ligne: type de paiement (ch, vi, tr)
       - Deuxième ligne: nom du client suivi du montant

    2. Types de paiement:
       - ch: Cash (CSH3 dans Odoo)
       - vi: Virement (BNK1 dans Odoo)
       - tr: Traite (TRT dans Odoo)

    3. Extraction du montant:
       - Le montant peut être écrit avec un point ou une virgule comme séparateur décimal
       - Exemple: "123,45" ou "123.45"
    
    Analayse le message et retourne un JSON structuré avec les informations du paiement.`;

    console.log('✅ [paymentAnalyzer] PaymentAnalyzer initialisé');
  }

  async analyzeMessage(message) {
    try {
      console.log('📝 [paymentAnalyzer] Début analyse message de paiement:', message);
      
      const lines = message.trim().split('\n');
      if (lines.length < 2) {
        throw new Error('Format de message de paiement invalide - besoin d\'au moins 2 lignes');
      }

      // Extraction du type de paiement (première ligne)
      const paymentTypeCode = lines[0].trim().toLowerCase();
      let paymentType, odooJournal;
      
      switch (paymentTypeCode) {
        case 'ch':
          paymentType = 'Cash';
          odooJournal = 'CSH3';
          break;
        case 'vi':
          paymentType = 'Virement';
          odooJournal = 'BNK1';
          break;
        case 'tr':
          paymentType = 'Traite';
          odooJournal = 'TRT';
          break;
        default:
          throw new Error(`Type de paiement non reconnu: ${paymentTypeCode}`);
      }

      // Extraction du client et montant (deuxième ligne)
      const paymentInfo = lines[1].trim();
      const parts = paymentInfo.match(/^(.+?)\s+(\d+[.,]?\d*)$/);
      
      if (!parts || parts.length < 3) {
        throw new Error(`Format de ligne de paiement invalide: ${paymentInfo}`);
      }

      const clientName = parts[1].trim();
      // Normaliser le montant (remplacer la virgule par un point)
      const amount = parseFloat(parts[2].replace(',', '.'));

      if (isNaN(amount)) {
        throw new Error(`Montant invalide: ${parts[2]}`);
      }

      // Recherche du client
      console.log('👤 [paymentAnalyzer] Recherche client:', clientName);
      const clientResult = await clientLookupService.findClientByNameAndZone(clientName);
      
      if (!clientResult || clientResult.status !== 'success') {
        throw new Error(`Client non trouvé: ${clientName}`);
      }

      // Création de la réponse
      const result = {
        type: 'PAYMENT',
        status: 'SUCCESS',
        payment: {
          type: paymentType,
          odooJournal: odooJournal,
          amount: amount,
          clientName: clientResult.client.Nom_Client,
          clientId: clientResult.client.ID_Client,
          clientOdooId: clientResult.client.odooId
        },
        client: clientResult.client,
        message: `Paiement ${paymentType} de ${amount} DNT enregistré pour ${clientResult.client.Nom_Client}`
      };

      console.log('✅ [paymentAnalyzer] Analyse terminée:', {
        client: result.client,
        payment: result.payment
      });

      return result;

    } catch (error) {
      console.error('❌ Erreur analyse message de paiement:', {
        message: error.message,
        stack: error.stack
      });
      
      return {
        type: 'PAYMENT',
        status: 'ERROR',
        error: {
          message: error.message,
          code: 'PAYMENT_ANALYSIS_ERROR'
        }
      };
    }
  }
}

module.exports = PaymentAnalyzer;