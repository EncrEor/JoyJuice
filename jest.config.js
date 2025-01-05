  module.exports = {
    testEnvironment: 'node', // Utilise un environnement Node.js pour les tests
    setupFilesAfterEnv: ['./tests/setup.js'], // Fichier de configuration après l'environnement
    testTimeout: 10000, // Temps maximum pour chaque test (10 secondes)
    transform: {
      '^.+\\.js$': 'babel-jest' // Transforme les fichiers JavaScript avec Babel
    },
    moduleFileExtensions: ['js', 'json'], // Extensions de fichiers à inclure
    testPathIgnorePatterns: ['/node_modules/', '/dist/'], // Ignore les tests dans ces répertoires
    transformIgnorePatterns: ['node_modules/(?!@anthropic-ai/sdk)'], // Transforme certains modules ignorés par défaut
    collectCoverageFrom: [
      'Services/**/*.js', // Collecte les informations de couverture dans ce répertoire
      '!Services/**/index.js' // Exclut les fichiers index.js
    ],
    coverageDirectory: 'coverage', // Répertoire pour les rapports de couverture
    verbose: true, // Affiche les détails des tests dans la console
    testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'], // Correspond aux fichiers de test
    globals: {
      'babel-jest': {
        configFile: './babel.config.js' // Utilise explicitement le fichier de configuration Babel
      }
    }
  };