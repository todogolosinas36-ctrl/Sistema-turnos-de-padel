module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  plugins: ['react', 'react-hooks', 'react-refresh'],
  ignorePatterns: ['dist', 'node_modules', 'supabase'],
  rules: {
    'react-refresh/only-export-components': 'off',
    // El proyecto usa `console.error` para reportar fallas de Supabase
    'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', argsIgnorePattern: '^_' }],
    // React 17+ no necesita import explícito
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-empty': ['warn', { allowEmptyCatch: true }],
  },
}
