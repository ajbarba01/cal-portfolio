/**
 * Stub for the `server-only` package in the Vitest environment.
 * The real package throws when imported outside of Next.js to prevent client bundles
 * from including server code. Tests run under Vitest (Node), not Next.js, so the
 * guard would always fire. This stub is a no-op; it does not weaken production safety
 * because the stub is only active when the `server-only` alias is applied in vitest.config.ts.
 */
export {};
