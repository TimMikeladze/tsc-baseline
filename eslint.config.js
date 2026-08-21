import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import perfectionist from 'eslint-plugin-perfectionist'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The shareable configs used here (standard, typescript-sort-keys) are still
// published in the eslintrc format, so they are loaded through the compat layer
// rather than rewritten. That keeps this file a translation of the previous
// .eslintrc, not a change of rules.
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'test-dir-*/**']
  },
  ...compat.extends('standard', 'prettier'),
  ...compat.plugins(
    '@typescript-eslint',
    'unused-imports',
    'prefer-arrow',
    'prettier',
    'sort-class-members'
  ),
  {
    // Flat config only lints .js by default, so the TypeScript sources have to
    // be opted in explicitly
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { perfectionist },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: (await import('@typescript-eslint/parser')).default,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    rules: {
      indent: 'off',
      'space-before-function-paren': 'off',
      'no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_'
        }
      ],
      'prettier/prettier': 'error',
      'import/extensions': 'off',
      'import/no-extraneous-dependencies': 'off',
      'import/no-unresolved': 'off',
      'import/prefer-default-export': 'off',
      // Replaces typescript-sort-keys/interface and /string-enum, which are
      // stuck on an eslint 8 era API. Same intent, maintained plugin.
      'perfectionist/sort-interfaces': 'error',
      'perfectionist/sort-enums': 'error',
      'prefer-arrow/prefer-arrow-functions': [
        'error',
        {
          disallowPrototype: true,
          singleReturnOnly: true,
          classPropertiesAllowed: false
        }
      ],
      'sort-class-members/sort-class-members': [
        'error',
        {
          order: [
            '[static-properties]',
            '[properties]',
            '[conventional-private-properties]',
            'constructor',
            '[static-methods]',
            '[methods]',
            '[conventional-private-methods]'
          ],
          accessorPairPositioning: 'getThenSet'
        }
      ]
    }
  }
]
