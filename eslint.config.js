import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Architecture boundary (AGENTS.md §3): pages and feature UI components must not
    // talk to Supabase directly — data access belongs in stores/application services
    // and infrastructure repositories.
    files: ["src/features/*/pages/**/*.{ts,tsx}", "src/features/*/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/shared/lib/supabaseClient",
              message:
                "Pages and feature UI components must not access Supabase directly. Use a store action or an infrastructure repository (see AGENTS.md, section 3).",
            },
          ],
        },
      ],
    },
  },
);
