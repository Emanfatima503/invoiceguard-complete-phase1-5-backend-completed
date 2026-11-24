import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the `@` alias to ./src, mirroring the tsconfig paths mapping
// ("@/*": ["./src/*"]).
const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
