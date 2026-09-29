import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefreshModule from 'eslint-plugin-react-refresh'
import globals from 'globals'

const reactRefresh = reactRefreshModule.default ?? reactRefreshModule

// Import boundaries are the backbone of the architecture:
//   src/core      pure TypeScript domain logic (runs in Node, renderer, main)
//   src/shared    pure contracts shared by main/preload/renderer
//   src/main      Electron main process (Node)
//   src/renderer  React UI (browser), talks to main only via window.freegaz
const NODE_BUILTINS = [
  'node:*', 'fs', 'fs/*', 'path', 'os', 'child_process', 'crypto', 'http', 'https', 'net',
  'url', 'util', 'stream', 'events', 'worker_threads', 'zlib', 'dgram', 'dns', 'tls',
]

export default defineConfig(
  {
    ignores: [
      'out/**', 'release/**', 'node_modules/**', 'coverage/**', 'test-results/**',
      'playwright-report/**', 'resources/**', '**/*.d.ts', '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/shared/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['electron', 'electron/*', 'react', 'react-dom', 'react/*', 'dexie', '@renderer/*', '@main/*', ...NODE_BUILTINS],
          message: 'src/core and src/shared must stay pure TypeScript: no DOM, Node, Electron, React or Dexie.',
        }],
      }],
      'no-restricted-globals': ['error',
        'window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB',
        'process', 'require', 'Buffer', '__dirname', '__filename', 'fetch', 'crypto',
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, __FREEGAZ_WEB__: 'readonly' } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['electron', 'electron/*', '@main/*', ...NODE_BUILTINS],
          message: 'The renderer must not import Node or Electron. Call main through window.freegaz.',
        }],
      }],
    },
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', 'dexie', '@renderer/*'],
          message: 'Main/preload must not import renderer code.',
        }],
      }],
    },
  },
  {
    files: ['tests/**/*.ts', 'scripts/**/*.{ts,mjs}', '*.config.{ts,mts,mjs}', '**/*.test.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
)
