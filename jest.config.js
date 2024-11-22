module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['./tests/setup.js'],
    testTimeout: 10000,
    transform: {
      '^.+\\.js$': 'babel-jest'
    },
    moduleFileExtensions: ['js', 'json'],
    testPathIgnorePatterns: ['/node_modules/'],
    collectCoverageFrom: [
      'Services/**/*.js',
      '!Services/**/index.js'
    ],
    coverageDirectory: 'coverage',
    verbose: true
  };