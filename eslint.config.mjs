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

// Long relative paths into backend/src areas must use the path aliases instead.
const backendAliasPatterns = [
  {
    group: ['../entities/*', '../../entities/*', '../../../entities/*', '../../../../entities/*'],
    message: "Use '@entities/...' instead of long relative paths.",
  },
  {
    group: ['../database/*', '../../database/*', '../../../database/*', '../../../../database/*'],
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
    group: ['../services/*', '../../services/*', '../../../services/*', '../../../../services/*'],
    message: "Use '@services/...' instead of long relative paths.",
  },
  {
    group: ['../types/*', '../../types/*', '../../../types/*', '../../../../types/*'],
    message: "Use '@mytypes/...' instead of long relative paths.",
  },
  {
    group: ['../utils/*', '../../utils/*', '../../../utils/*', '../../../../utils/*'],
    message: "Use '@utils/...' instead of long relative paths.",
  },
];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'frontend/storybook-static/**',
      'frontend/.next/**',
      'frontend/playwright-report*/**',
      'frontend/test-results*/**',
      'legacy/**',
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
              '^@constants',
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
          patterns: backendAliasPatterns,
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
      '@typescript-eslint/sort-type-constituents': 'warn',
    },
  },
  {
    // Backend logs go through `@logger`, which redacts source identifiers and adds trace ids.
    files: ['backend/src/**/*.ts'],
    ignores: [
      'backend/src/logger.ts',
      // The interactive setup talks to the person at the terminal.
      'backend/src/services/configuration/configuration.wizard.ts',
      'backend/src/**/*.test.ts',
      'backend/src/__test-utils__/**',
      'backend/src/__mocks__/**',
    ],
    rules: { 'no-console': 'error' },
  },
  {
    // Routes are the HTTP edge: nothing below them may depend on them. Shared shapes live in
    // backend/src/types (`@mytypes/...`).
    files: [
      'backend/src/{services,middleware,utils,repositories,entities,errors,database,types}/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...backendAliasPatterns,
            {
              group: ['@routes/*'],
              message:
                "Only routes may import '@routes/...'. Move the shared type to backend/src/types and import it from '@mytypes/...'.",
            },
          ],
        },
      ],
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
      // Prefer library variants to feature-local visual overrides.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='styled'] > Identifier.arguments[name=/^(Button|BaseButton|Input|Select|FieldLabel|LoadingIndicator|Spinner|Alert|Switch)$/]",
          message:
            'Use the Miauflix UI component props. Add shared visual variants in shared/ui and put positioning/spacing on a parent. Document any existing domain-specific exception.',
        },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // Components migrated to build-time styles (docs/development/css-architecture.md); add each
    // folder as it migrates, so it can't go back to generating CSS at runtime.
    files: ['frontend/src/**/*.css.ts', 'frontend/src/shared/ui/media-card/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'styled-components',
              message:
                'This component is styled at build time: use a *.css.ts file, data-* attributes for variants and inline styles for continuous values.',
            },
          ],
        },
      ],
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
  {
    files: ['services/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        Bun: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  ...storybookConfigs,
];
