// numberUtils.js

/**
 * Formate une valeur numérique pour qu'elle affiche exactement 3 décimales.
 * @param {number} value - La valeur à formater.
 * @returns {number} La valeur formatée avec 3 décimales.
 */
function formatPrice(value) {
    return parseFloat(value.toFixed(3));
  }
  
  module.exports = {
    formatPrice
  };