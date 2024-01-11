module.exports = {
  extends: [
    "airbnb-base",
    "airbnb-typescript/base",
    "@loopback/eslint-config",
  ],
  rules: {
    "import/prefer-default-export": "warn",
    "no-await-in-loop": "warn",
    "class-methods-use-this": "warn",
    "prefer-destructuring": "warn",
    "@typescript-eslint/lines-between-class-members": "off",
    "no-plusplus": "off",
  }
};
