module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true,
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
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
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
          // Also excludes Stripe API fields via filter below
          regex: "^(?!_).*_[a-z]",
          match: false,
        },
        // Allow Stripe API snake_case fields (external API requirement)
        filter: {
          regex: "^(price_data|product_data|unit_amount|payment_method_types|success_url|cancel_url|line_items)",
          match: false,
        },
      },
    ],
  },
  ignorePatterns: ["dist/", "node_modules/"],
};
