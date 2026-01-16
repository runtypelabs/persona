module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
  },
  globals: {
    RequestInit: "readonly",
    HTMLElementTagNameMap: "readonly",
  },
  extends: [
    "eslint:recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // Disallow snake_case in property names (catches API payload fields)
    // Allows: camelCase, PascalCase, UPPER_CASE, kebab-case (CSS), colons (events), slashes (MIME)
    "@typescript-eslint/naming-convention": [
      "error",
      {
        selector: "property",
        format: null,
        custom: {
          // Fail if property contains underscore followed by lowercase (snake_case pattern)
          // but allow leading underscore (_private) and ALL_CAPS constants
          regex: "^(?!_).*_[a-z]",
          match: false,
        },
      },
    ],
  },
  ignorePatterns: ["dist/", "node_modules/"],
};
