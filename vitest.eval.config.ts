import { defineConfig } from "vitest/config";
import path from "path";
import fs from "fs";

// Load GEMINI_API_KEY / GEMINI_MODEL from .env.local / .env (Next.js
// convention) so `npm run eval` works without manually exporting the key.
for (const file of [".env.local", ".env"]) {
  const p = path.resolve(__dirname, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["evals/**/*.eval.ts"],
    // Live model calls are slow; give each case room.
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Eval cases share golden games but must not race the model API.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "./src/__tests__/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
