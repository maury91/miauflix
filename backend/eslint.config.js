import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
        ecmaFeatures: { legacyDecorators: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // No-restricted-imports rule (keep this)
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../entities/*",
                "../../entities/*",
                "../../../entities/*",
                "../../../../entities/*",
              ],
              message: "Use '@entities/...' instead of long relative paths.",
            },
            {
              group: [
                "../database/*",
                "../../database/*",
                "../../../database/*",
                "../../../../database/*",
              ],
              message: "Use '@database/...' instead of long relative paths.",
            },
            {
              group: [
                "../errors/*",
                "../../errors/*",
                "../../../errors/*",
                "../../../../errors/*",
              ],
              message: "Use '@errors/...' instead of long relative paths.",
            },
            {
              group: [
                "../middleware/*",
                "../../middleware/*",
                "../../../middleware/*",
                "../../../../middleware/*",
              ],
              message: "Use '@middleware/...' instead of long relative paths.",
            },
            {
              group: [
                "../repositories/*",
                "../../repositories/*",
                "../../../repositories/*",
                "../../../../repositories/*",
              ],
              message:
                "Use '@repositories/...' instead of long relative paths.",
            },
            {
              group: [
                "../routes/*",
                "../../routes/*",
                "../../../routes/*",
                "../../../../routes/*",
              ],
              message: "Use '@routes/...' instead of long relative paths.",
            },
            {
              group: [
                "../services/*",
                "../../services/*",
                "../../../services/*",
                "../../../../services/*",
              ],
              message: "Use '@services/...' instead of long relative paths.",
            },
            {
              group: [
                "../types/*",
                "../../types/*",
                "../../../types/*",
                "../../../../types/*",
              ],
              message: "Use '@mytypes/...' instead of long relative paths.",
            },
            {
              group: [
                "../utils/*",
                "../../utils/*",
                "../../../utils/*",
                "../../../../utils/*",
              ],
              message: "Use '@utils/...' instead of long relative paths.",
            },
          ],
        },
      ],
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            // Side effect imports.
            ["^\\u0000"],
            // Node.js builtins prefixed with `node:`.
            ["^node:"],
            // External packages. Matches things like 'elysia', '@elysiajs/cors'
            ["^@?\\w"],
            // Internal aliases. Matches specific aliases like @entities/, @services/, etc.
            [
              "^@entities/",
              "^@database/",
              "^@errors/",
              "^@middleware/",
              "^@repositories/",
              "^@routes/",
              "^@services/",
              "^@mytypes/",
              "^@utils/",
              "^@constants",
              "^@config", // Assuming @config maps to configuration.ts
            ],
            // Relative imports. Put parent imports first (`../`), then sibling imports (`./`).
            [
              "^\\.\\.(?!/?$)",
              "^\\.\\./?$",
              "^\\./(?=.*/)(?!/?$)",
              "^\\.(?!/?$)",
              "^\\./?$",
            ],
          ],
        },
      ],
      "simple-import-sort/exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/sort-type-constituents": "error",
    },
  },
];
