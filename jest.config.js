/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.m?[tj]sx?$': ['ts-jest', { useESM: true, tsconfig: 'tsconfig.jest.json', diagnostics: true }],
  },
};
