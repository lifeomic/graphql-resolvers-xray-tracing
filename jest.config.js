module.exports = {
  preset: '@lifeomic/jest-config',
  maxWorkers: 1,
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  coveragePathIgnorePatterns: ['<rootDir>/test/', '/node_modules/'],
  restoreMocks: true,
  resetMocks: true,
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  verbose: true,
};
