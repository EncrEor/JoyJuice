const COLUMNS = {
    ID_LIVRAISON: 0,
    DATE_LIVRAISON: 1,
    ID_CLIENT: 2,
    TOTAL_LIVRAISON: 3,
    STATUT_L: 4,
    ID_ODOO: 11
  };
  
  const FORMAT_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
  const STATUTS_VALIDES = ['En cours', 'Terminée', 'Annulée'];
  const FORMAT_DATE_EXEMPLE = 'dd/mm/yyyy';
  
  module.exports = {
    COLUMNS,
    FORMAT_DATE_REGEX,
    STATUTS_VALIDES,
    FORMAT_DATE_EXEMPLE
  };