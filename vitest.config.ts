import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./src/__tests__/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
