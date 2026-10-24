import { createDefaultPreset } from 'ts-jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import { readFileSync } from 'fs';

// Parse tsconfig.json to get the paths configuration
const tsConfig = JSON.parse(readFileSync('./tsconfig.json', 'utf-8'));
const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Workspace tests run in parallel; leave capacity for the other runners and builds.
  maxWorkers: 2,
  transform: {
    ...tsJestTransformCfg,
    '^.+\\.(js|jsx)$': 'babel-jest',
  },
  // Use the paths from tsconfig
  moduleNameMapper: {
    ...pathsToModuleNameMapper(tsConfig.compilerOptions.paths, {
      prefix: '<rootDir>/',
    }),
  },
  // Allow ES modules
  extensionsToTreatAsEsm: ['.ts'],
  // Transform chalk and other ESM modules
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|@inquirer|inquirer|figures|@chalk|ansi-styles|#ansi-styles|kleur|sisteransi|random-access-file|thunky|filename-reserved-regex|uuid|@faker-js)/)',
  ],
  setupFilesAfterEnv: ['./src/jest.setup.ts'],
  prettierPath: null,
};
