module.exports = {
  extends: [
    "airbnb-base",
    "airbnb-typescript/base",
    "@loopback/eslint-config",
  ],
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "warn",
    "@typescript-eslint/return-await": "warn",
    "import/prefer-default-export": "warn",
    "no-await-in-loop": "warn",
    "class-methods-use-this": "warn",
    "prefer-destructuring": "warn",
    "no-else-return": "warn",
    "prefer-promise-reject-errors": "warn",
    "no-restricted-syntax": "warn",
    "no-continue": "warn",
    "consistent-return": "warn",
    "eqeqeq": "warn",
    "no-param-reassign": "warn",
    "prefer-const": "warn",
    "prefer-template": "warn",
    "prefer-regex-literals": "warn",
    "arrow-body-style": "warn",
    "default-case": "warn",
    "@typescript-eslint/lines-between-class-members": "off",
    "@typescript-eslint/no-shadow": "off",
    "radix": "off",
    "no-plusplus": "off",
    "spaced-comment": "off",
  },
  "overrides": [
    {
      "files": "src/models/**/*.ts",
      "rules": {
        "@typescript-eslint/no-useless-constructor": "off",
        "max-classes-per-file": "off"
      }
    },
  ]
};
