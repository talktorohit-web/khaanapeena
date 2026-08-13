import globals from 'globals'

// Minimal lint focused on catching out-of-scope identifiers (e.g. a sub-component
// using `state` without receiving it) — the crash class that hit KDS/Tables.
export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        structuredClone: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^(React|_)' }],
    },
  },
]
