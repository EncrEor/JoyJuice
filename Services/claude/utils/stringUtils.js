class StringUtils {
    static normalizeString(str) {
      if (!str) return '';
      return str.toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    }
  
    static normalizeProductName(name) {
      if (!name) return '';
      name = this.normalizeString(name);
      const contenanceMap = {
        'l': 'L',
        'litre': 'L',
        'litres': 'L',
        'cl': 'CL'
      };
  
      for (const [key, value] of Object.entries(contenanceMap)) {
        name = name.replace(new RegExp(`\\s*${key}\\s*$`), ` ${value}`);
      }
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  
    static buildContextualMessage(message, context) {
      const parts = [`Message: ${message}`];
  
      if (context?.lastClient) {
        parts.push(`Client actuel: ${context.lastClient.Nom_Client} ${context.lastClient.zone || ''}`);
      }
  
      if (context?.lastDelivery) {
        parts.push(`Livraison ${context.lastDelivery.ID_Livraison}:`);
        if (context.lastDelivery.details) {
          parts.push(context.lastDelivery.details
            .map(d => `${d.quantite} ${d.nom_produit}`)
            .join(', '));
        }
      }
  
      if (context?.recentProducts?.size > 0) {
        parts.push(`Produits récents: ${Array.from(context.recentProducts).join(', ')}`);
      }
  
      return parts.join('\n');
    }
  
    static formatResponse(message, context = null) {
      let response = message
        .replace(/^(bonjour|salut|bonsoir|au revoir)[\s,.!]*/i, '')
        .replace(/n'hésitez pas[^.]*\./g, '')
        .replace(/je (vous )?suggère/g, '')
        .replace(/s'il vous pla[iî]t/g, '')
        .replace(/je peux vous aider[^.]*\./g, '');
  
      if (context?.client?.zone) {
        response = response.replace(
          new RegExp(`client ${context.client.nom}`, 'gi'),
          `client ${context.client.nom} ${context.client.zone}`
        );
      }
  
      return response.trim();
    }
  }
  
  module.exports = StringUtils;