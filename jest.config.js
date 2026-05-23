/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Per-file environment overrides via @jest-environment docblock
  testEnvironmentOptions: {},
};

module.exports = config;
