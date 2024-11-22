// Services/clientLookupService.js

const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

// Authentification Google Sheets
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });
const spreadsheetId = process.env.SPREADSHEET_ID;

// Constantes des colonnes pour plus de clarté
const COLUMNS = {
  ID_CLIENT: 0,
  NOM_CLIENT: 1,
  TEL: 2,
  ADRESSE: 3,
  ZONE: 4,
  DELAIS: 5,
  CONGELATEUR: 6
};

// Fonction utilitaire pour normaliser les chaînes de texte
const normalizeString = (str) => {
  if (!str) return '';
  return str.toString().trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Retire les accents
};

// Fonction pour convertir un tableau de données client en objet
const arrayToClientObject = (clientArray) => {
  if (!clientArray) return null;
  return {
    ID_Client: clientArray[COLUMNS.ID_CLIENT],
    Nom_Client: clientArray[COLUMNS.NOM_CLIENT],
    Tel: clientArray[COLUMNS.TEL],
    Adresse: clientArray[COLUMNS.ADRESSE],
    Zone: clientArray[COLUMNS.ZONE],
    Delais: clientArray[COLUMNS.DELAIS],
    Congelateur: clientArray[COLUMNS.CONGELATEUR]
  };
};

// Fonction principale de recherche par nom et zone en cas de doublon
module.exports.findClientByNameAndZone = async function(name, zone = null) {
    try {
        console.log(`🔍 Recherche du client avec nom: ${name}${zone ? ` et zone: ${zone}` : ''}`);

        // Récupérer les données des clients depuis Google Sheets
        const result = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: 'Clients!A1:G1000',
        });

        // Validation de la présence des données
        if (!result.data.values || result.data.values.length <= 1) {
            console.log('❌ Aucun client trouvé dans Google Sheets');
            return {
                status: 'no_match',
                message: `Aucun client trouvé.`,
                matches: []
            };
        }

        // Ignorer la ligne d'en-tête
        const clients = result.data.values.slice(1);

        // Normaliser le nom du client recherché
        const normalizedName = normalizeString(name);
        if (!normalizedName) {
            return {
                status: 'no_match',
                message: 'Nom de client invalide',
                matches: []
            };
        }

        // Filtrer les clients en fonction du nom normalisé
        let matches = clients.filter(client => {
            if (!client || !client[COLUMNS.NOM_CLIENT]) return false;
            const clientName = normalizeString(client[COLUMNS.NOM_CLIENT]);
            return clientName === normalizedName || clientName.includes(normalizedName);
        });

        // Aucune correspondance trouvée
        if (matches.length === 0) {
            console.log(`❌ Aucun client trouvé pour le nom: ${name}`);
            return {
                status: 'no_match',
                message: `Aucun client trouvé pour le nom "${name}".`,
                matches: []
            };
        }

        // Une seule correspondance trouvée
        if (matches.length === 1) {
            console.log(`✅ Client unique trouvé pour le nom: ${name}`);
            return {
                status: 'single_match',
                client: arrayToClientObject(matches[0])
            };
        }

        // Plusieurs correspondances sans précision de zone
        if (!zone) {
            console.log(`⚠️ Plusieurs clients trouvés pour le nom: ${name}`);
            
            // Validation pour détecter des clients sans zone
            const clientsWithoutZone = matches.filter(client => !client[COLUMNS.ZONE]);
            if (clientsWithoutZone.length > 0) {
                console.warn(`⚠️ Certains clients trouvés n'ont pas de zone spécifiée.`);
            }

            // Construire une liste des zones disponibles
            const availableZones = matches
                .map(client => client[COLUMNS.ZONE])
                .filter((zone, index, self) => zone && self.indexOf(zone) === index);

            if (availableZones.length === 0) {
                console.error(`❌ Aucun client avec une zone valide trouvé pour "${name}".`);
                return {
                    status: 'no_zones_available',
                    message: `Aucun client avec une zone valide trouvé pour "${name}".`,
                    matches: [],
                    availableZones: []
                };
            }

            // Créer un résumé détaillé des clients par zone
            const zoneDetails = matches.reduce((acc, client) => {
                const clientZone = client[COLUMNS.ZONE] || 'Zone non spécifiée';
                if (!acc[clientZone]) {
                    acc[clientZone] = [];
                }
                acc[clientZone].push({
                    id: client[COLUMNS.ID_CLIENT]?.toString() || '',
                    tel: client[COLUMNS.TEL]?.toString() || '',
                    adresse: client[COLUMNS.ADRESSE]?.toString() || ''
                });
                return acc;
            }, {});

            console.log(`📍 Zones disponibles pour ${name}:`, availableZones);

            return {
                status: 'multiple_matches',
                message: `Le client "${name}" est présent dans les zones suivantes : ${availableZones.join(', ')}`,
                matches: matches.map(client => arrayToClientObject(client)),
                multiple: true,
                availableZones: availableZones,
                zoneDetails: zoneDetails,
                originalSearch: {
                    name: name,
                    zone: zone
                },
                summary: {
                    totalMatches: matches.length,
                    totalZones: availableZones.length,
                    zonesFound: availableZones
                }
            };
        }

        // Si une zone est spécifiée, filtrer par zone
        const normalizedZone = normalizeString(zone);
        matches = matches.filter(client => 
            normalizeString(client[COLUMNS.ZONE]?.toString() || '') === normalizedZone
        );

        if (matches.length === 1) {
            console.log(`✅ Client unique trouvé pour le nom: ${name} et la zone: ${zone}`);
            return {
                status: 'single_match',
                client: arrayToClientObject(matches[0])
            };
        } else if (matches.length > 1) {
            console.log(`⚠️ Plusieurs clients trouvés pour ${name} dans la zone ${zone}`);
            return {
                status: 'multiple_matches_zone',
                message: `Plusieurs clients "${name}" trouvés dans la zone "${zone}".`,
                matches: matches.map(client => arrayToClientObject(client))
            };
        }

        return {
            status: 'no_match_in_zone',
            message: `Aucun client "${name}" trouvé dans la zone "${zone}".`,
            matches: []
        };

    } catch (error) {
        console.error('❌ Erreur lors de la recherche de client:', error);
        throw new Error('Erreur lors de la recherche de client');
    }
};