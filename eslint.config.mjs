import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import storybook from 'eslint-plugin-storybook';

const storybookConfigs = storybook.configs['flat/recommended'].map(config => ({
  ...config,
  files: config.files ?? [
    'frontend/**/*.stories.@(ts|tsx|js|jsx|mdx)',
    'frontend/.storybook/**/*.{ts,tsx,js,jsx}',
  ],
}));

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'frontend/storybook-static/**',
      'frontend/.next/**',
      'packages/**/dist/**',
      'backend-e2e/docker/**',
      'backend-e2e/scripts/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
      },
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-inferrable-types': 'off',
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Side effect imports.
            ['^\\u0000'],
            // Node.js builtins prefixed with `node:`.
            ['^node:'],
            // External packages. Matches things like 'elysia', '@elysiajs/cors'
            ['^@?\\w'],
            // Internal aliases. Matches specific aliases like @entities/, @services/, etc.
            [
              '^@config', // Assuming @config maps to configuration.ts
              '^@constants',
              '^@content-directories/',
              '^@database/',
              '^@entities/',
              '^@errors/',
              '^@middleware/',
              '^@mytypes/',
              '^@repositories/',
              '^@routes/',
              '^@services/',
              '^@utils/',
            ],
            // Relative imports. Put parent imports first (`../`), then sibling imports (`./`).
            ['^\\.\\.(?!/?$)', '^\\.\\./?$', '^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
          ],
        },
      ],
      'simple-import-sort/exports': 'warn',
    },
  },
  {
    files: ['backend/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../entities/*',
                '../../entities/*',
                '../../../entities/*',
                '../../../../entities/*',
              ],
              message: "Use '@entities/...' instead of long relative paths.",
            },
            {
              group: [
                '../database/*',
                '../../database/*',
                '../../../database/*',
                '../../../../database/*',
              ],
              message: "Use '@database/...' instead of long relative paths.",
            },
            {
              group: ['../errors/*', '../../errors/*', '../../../errors/*', '../../../../errors/*'],
              message: "Use '@errors/...' instead of long relative paths.",
            },
            {
              group: [
                '../middleware/*',
                '../../middleware/*',
                '../../../middleware/*',
                '../../../../middleware/*',
              ],
              message: "Use '@middleware/...' instead of long relative paths.",
            },
            {
              group: [
                '../repositories/*',
                '../../repositories/*',
                '../../../repositories/*',
                '../../../../repositories/*',
              ],
              message: "Use '@repositories/...' instead of long relative paths.",
            },
            {
              group: ['../routes/*', '../../routes/*', '../../../routes/*', '../../../../routes/*'],
              message: "Use '@routes/...' instead of long relative paths.",
            },
            {
              group: [
                '../services/*',
                '../../services/*',
                '../../../services/*',
                '../../../../services/*',
              ],
              message: "Use '@services/...' instead of long relative paths.",
            },
            {
              group: [
                '../content-directories/*',
                '../../content-directories/*',
                '../../../content-directories/*',
                '../../../../content-directories/*',
              ],
              message: "Use '@content-directories/...' instead of long relative paths.",
            },
            {
              group: ['../types/*', '../../types/*', '../../../types/*', '../../../../types/*'],
              message: "Use '@mytypes/...' instead of long relative paths.",
            },
            {
              group: ['../utils/*', '../../utils/*', '../../../utils/*', '../../../../utils/*'],
              message: "Use '@utils/...' instead of long relative paths.",
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/sort-type-constituents': 'warn',
    },
  },
  {
    files: ['frontend/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: process.cwd(),
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'simple-import-sort': simpleImportSort,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', '**/__tests__/**/*.ts', '**/*.spec.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  {
    files: ['backend-e2e/**/*.{ts,tsx,js}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-namespace': 'warn',
    },
  },
  {
    files: ['packages/**/*.{ts,tsx,js}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  ...storybookConfigs,
];
