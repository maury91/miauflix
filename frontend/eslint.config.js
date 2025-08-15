import storybook from 'eslint-plugin-storybook';

import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: [
      'jest.config.ts',
      'playwright.config*.ts',
      'vite.config.ts',
      'vite.ssr.config.ts',
      'storybook-static/**/*',
      '**/*.d.ts',
    ],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: process.cwd(),
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // E2E test files configuration
  {
    files: ['e2e/**/*.ts', '**/*.e2e.spec.ts'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.spec.json',
        tsconfigRootDir: process.cwd(),
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  ...storybook.configs['flat/recommended'],
];
