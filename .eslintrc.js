/* eslint-env node */

module.exports = {
  ignorePatterns: ['src/**/*.test.ts'],
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 'latest',
        project: `${__dirname}/tsconfig.json`
      },
      rules: {
        'max-lines-per-function': ['error', { max: 570, skipBlankLines: true }],
        'max-depth': ['error', 6],
        complexity: ['error', 25]
      }
    }
  ]
};
