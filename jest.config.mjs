/* eslint-env node */
/** @type {import('ts-jest').JestConfigWithTsJest} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?[tj]sx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json', diagnostics: true }],
  },
};
