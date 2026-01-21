import tsparser from "@typescript-eslint/parser";
import tseslint from "@typescript-eslint/eslint-plugin";
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // TypeScript files configuration with Obsidian rules
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tseslint,
      obsidianmd: obsidianmd,
    },
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      // Apply all recommended Obsidian rules
      ...obsidianmd.configs.recommended,
      // Allow "Claude Code" as brand name and UI labels starting with emoji
      "obsidianmd/ui/sentence-case": ["error", {
        brands: ["Claude Code"],
        // Ignore strings starting with emoji (icon + label pattern)
        ignoreRegex: ["^[⚠️📋📄🔧✅❌]"],
      }],

      // TypeScript-ESLint rules matching Obsidian Review Bot checks
      "@typescript-eslint/require-await": "error",                    // Async methods must use await
      "@typescript-eslint/no-this-alias": "error",                    // No aliasing 'this' to variables
      "@typescript-eslint/no-unnecessary-type-assertion": "error",    // No redundant type assertions
      "@typescript-eslint/no-empty-object-type": "error",             // No empty interfaces/object types
      "no-case-declarations": "error",                                // Wrap case blocks with lexical declarations
      "@typescript-eslint/no-unused-vars": ["warn", {
        argsIgnorePattern: "^_",                                      // Allow unused args starting with _
        varsIgnorePattern: "^_",                                      // Allow unused vars starting with _
      }],
    },
  },

  // Ignore patterns
  {
    ignores: [
      "node_modules/**",
      "main.js",
      "*.mjs",
      "tests/**",
      "**/__tests__/**",          // Test files inside src/
      "**/*.test.ts",             // Any .test.ts files
      "claudedocs/**",
    ],
  },
];
