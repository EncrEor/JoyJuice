//Services/claude/core/cacheManager/dateUtils.js

/**
 * Utilitaires pour la gestion des dates dans le cache
 */
class DateUtils {
    /**
     * Calcule la plage de dates pour les livraisons
     * @param {number} monthsBack - Nombre de mois en arrière
     * @returns {Object} - Dates de début, fin et fonction de formatage
     */
    static getDateRange(monthsBack = 3) {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - monthsBack);

        // Fonction de formatage pour la comparaison des dates
        const formatDate = (date) => {
            return date.toISOString().split('T')[0];
        };

        return {
            start,
            end,
            formatDate
        };
    }

    /**
     * Convertit une date du format dd/mm/yyyy en format ISO
     * @param {string} dateString - Date au format dd/mm/yyyy
     * @returns {string} Date au format ISO ou null si invalide
     */
    static convertToISODate(dateString) {
        if (!dateString) return null;

        const parts = dateString.split('/');
        if (parts.length !== 3) return null;

        try {
            // Conversion au format ISO (yyyy-mm-dd)
            const date = new Date(parts[2], parts[1] - 1, parts[0]);
            if (isNaN(date.getTime())) return null;

            return date.toISOString().split('T')[0];
        } catch (error) {
            console.error('❌ Erreur conversion date:', error);
            return null;
        }
    }

    /**
 * Convertit une date ISO en format dd/mm/yyyy
 * @param {string} isoDate - Date au format ISO (YYYY-MM-DD)
 * @returns {string} Date au format dd/mm/yyyy
 */
static formatDateForDelivery(isoDate = null) {
    try {
      const date = isoDate ? new Date(isoDate) : new Date();
      return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    } catch (error) {
      console.error('❌ Erreur formatage date:', error);
      return null;
    }
  }

    /**
     * Vérifie si la date est dans la plage spécifiée
     * @param {string} dateToCheck - Date à vérifier
     * @param {Date} startDate - Date de début
     * @param {Date} endDate - Date de fin
     * @returns {boolean} - true si dans la plage
     */
    static isDateInRange(dateToCheck, startDate, endDate) {
        const checkDate = this.convertToISODate(dateToCheck);
        if (!checkDate) return false;

        const start = this.formatDate(startDate);
        const end = this.formatDate(endDate);

        return checkDate >= start && checkDate <= end;
    }

    /**
     * Formate une date en chaîne ISO
     * @param {Date} date - Date à formater
     * @returns {string} Date au format ISO
     */
    static formatDate(date) {
        if (!date || !(date instanceof Date)) return null;
        return date.toISOString().split('T')[0];
    }

    /**
     * Calcule la différence en jours entre deux dates
     * @param {string|Date} date1 - Première date
     * @param {string|Date} date2 - Deuxième date
     * @returns {number} Différence en jours
     */
    static daysBetween(date1, date2) {
        try {
            const d1 = date1 instanceof Date ? date1 : new Date(this.convertToISODate(date1));
            const d2 = date2 instanceof Date ? date2 : new Date(this.convertToISODate(date2));

            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch (error) {
            console.error('❌ Erreur calcul différence dates:', error);
            return 0;
        }
    }

    /**
     * Vérifie si la date est aujourd'hui
     * @param {string} dateString - Date à vérifier
     * @returns {boolean} true si la date est aujourd'hui
     */
    static isToday(dateString) {
        try {
            const today = new Date();
            const checkDate = this.convertToISODate(dateString);
            
            return this.formatDate(today) === checkDate;
        } catch (error) {
            console.error('❌ Erreur vérification date aujourd\'hui:', error);
            return false;
        }
    }
}

module.exports = DateUtils;