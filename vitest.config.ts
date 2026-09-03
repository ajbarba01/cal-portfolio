import { defineConfig } from "vitest/config";
import path from "path";

const shared = {
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only throws in non-Next.js environments; stub it out for tests.
      // The server-action tests use DI (runOnboarding), never the Next.js runtime.
      "server-only": path.resolve(__dirname, "./src/test-stubs/server-only.ts"),
    },
  },
};

export default defineConfig({
  ...shared,
  test: {
    globals: true,
    clearMocks: true,
    passWithNoTests: true,
    // setupFiles loads .env.test (when present) so integration tests can reach
    // the local Supabase stack without polluting .env.local.
    setupFiles: ["./src/test-setup.ts"],
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          // Default env is node. DOM-dependent tests opt into jsdom per-file via
          // a `// @vitest-environment jsdom` docblock.
          environment: "node",
          globals: true,
          clearMocks: true,
          setupFiles: ["./src/test-setup.ts"],
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
            "scripts/**/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
          // Component suites drive real forms through user-event; under a full
          // parallel run they can exceed the 5s default without being broken.
          testTimeout: 15000,
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          // Hits the local Supabase stack; suites share one database, so run
          // files sequentially and allow slow fixtures.
          environment: "node",
          globals: true,
          clearMocks: true,
          setupFiles: ["./src/test-setup.ts"],
          include: ["src/**/*.integration.test.ts"],
          fileParallelism: false,
          hookTimeout: 30000,
          testTimeout: 30000,
        },
      },
    ],
  },
});
