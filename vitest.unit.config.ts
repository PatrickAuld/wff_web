import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/color.test.ts", "src/styles.test.ts", "src/expressions.test.ts", "src/conformance.unit.test.ts", "src/condition-names.unit.test.ts", "src/v5.unit.test.ts", "src/v5.text.unit.test.ts", "test/harness/reference.test.ts"] } });
