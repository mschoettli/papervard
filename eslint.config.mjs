import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const baseDirectory = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory });

const config = [
  {
    ignores: [".next/**", "next-env.d.ts", "node_modules/**", "coverage/**", "data/**", "config/**"]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Protected document streams are cookie-authenticated and intentionally
      // bypass the public Next image optimizer.
      "@next/next/no-img-element": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  }
];

export default config;
