import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const accessibilityRules = {
  "jsx-a11y/click-events-have-key-events": "error",
  "jsx-a11y/label-has-associated-control": "error",
  "jsx-a11y/no-static-element-interactions": "error",
};

export default defineConfig([
  ...tseslint.configs.recommended,
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  {
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      ...accessibilityRules,
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  globalIgnores([
    "dist/**",
    "worker/dist/**",
    "worker/.wrangler/**",
    "node_modules/**",
  ]),
]);
