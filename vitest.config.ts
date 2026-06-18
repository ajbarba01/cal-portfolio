import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only throws in non-Next.js environments; stub it out for tests.
      // The server-action tests use DI (runOnboarding), never the Next.js runtime.
      "server-only": path.resolve(__dirname, "./src/test-stubs/server-only.ts"),
    },
  },
  test: {
    // Default env is node (integration tests hit the local Supabase stack and
    // load .env.test). DOM-dependent tests (React hooks/components) opt into
    // jsdom per-file via a `// @vitest-environment jsdom` docblock.
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    passWithNoTests: true,
    clearMocks: true,
    // setupFiles loads .env.test before any test runs so integration tests
    // can connect to the local Supabase stack without polluting .env.local.
    setupFiles: ["./src/test-setup.ts"],
  },
});
