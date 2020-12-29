module.exports = {
  coverageDirectory: '../coverage',
  collectCoverageFrom: ['**/src/**/*.ts'],
  coverageReporters: ['cobertura', 'text'],
  preset: 'ts-jest',
  rootDir: 'packages',
  reporters: [
    'default',
    [
      'jest-junit',
      { suiteName: 'jest tests', suiteNameTemplate: '{filepath}' },
    ],
  ],
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.ts'],
  globals: {
    skipBabel: true,
  },
};
