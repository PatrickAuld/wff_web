import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/color.test.ts", "src/styles.test.ts", "src/expressions.test.ts", "src/conformance.unit.test.ts", "test/harness/reference.test.ts"] } });
