import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: { runtime: "automatic" }
  },
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url).pathname
    }
  }
});
