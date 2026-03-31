import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 300_000,
    passWithNoTests: true,
    sequence: { concurrent: false },
    // Exclude visual tests from the default `pnpm test` run.
    // Run visual tests explicitly with `pnpm test:visual`
    exclude: ["test/visual/**", "node_modules/**", ".worktrees/**"],
  },
});
