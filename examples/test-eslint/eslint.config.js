import parser from '@typescript-eslint/parser'
import plugin from '@typescript-eslint/eslint-plugin'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    rules: {
      'no-console': 'warn',
      'semi': ['error', 'never'],
      'quotes': ['error', 'single'],
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { '@typescript-eslint': plugin },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
    },
  },
]
