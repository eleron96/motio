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
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
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
  {
    // Domain purity (AGENTS.md §3.4): shared/domain holds pure business logic —
    // no React, no data access, no infrastructure/IO dependencies.
    files: ["src/shared/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react",
              message:
                "shared/domain must stay UI-free. Keep React in hooks/components (see AGENTS.md, section 3).",
            },
            {
              name: "react-dom",
              message: "shared/domain must stay UI-free (see AGENTS.md, section 3).",
            },
            {
              name: "@/shared/lib/supabaseClient",
              message:
                "shared/domain must not access data directly. Go through an infrastructure repository or store (see AGENTS.md, section 3).",
            },
          ],
          patterns: [
            {
              group: ["@supabase/*", "@tanstack/*", "@/infrastructure/*"],
              message:
                "shared/domain must not depend on infrastructure/IO (see AGENTS.md, section 3).",
            },
          ],
        },
      ],
    },
  },
);
