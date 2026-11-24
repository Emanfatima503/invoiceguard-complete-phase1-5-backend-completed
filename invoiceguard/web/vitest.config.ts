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
      // `server-only` throws outside a React Server Components bundler, so
      // Vitest (plain Node) cannot import any module that pulls it in.
      // Alias it to an inert stub for tests only; production is unaffected.
      "server-only": path.join(srcDir, "lib/__tests__/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
