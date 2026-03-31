import { describe, it, expect } from "vitest";
import { evaluateExpression, buildDataSources } from "./expressions.js";

// Helper: empty context for pure arithmetic
const emptyCtx = { sources: {} };

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

describe("arithmetic expressions", () => {
  it("evaluates integer addition", () => {
    expect(evaluateExpression("2 + 3", emptyCtx)).toBe(5);
  });

  it("evaluates subtraction", () => {
    expect(evaluateExpression("10 - 4", emptyCtx)).toBe(6);
  });

  it("evaluates multiplication with precedence over addition", () => {
    expect(evaluateExpression("10 - 4 * 2", emptyCtx)).toBe(2);
  });

  it("respects parentheses", () => {
    expect(evaluateExpression("(1 + 2) * 3", emptyCtx)).toBe(9);
  });

  it("evaluates modulo", () => {
    expect(evaluateExpression("10 % 3", emptyCtx)).toBe(1);
  });

  it("evaluates float literals", () => {
    expect(evaluateExpression("3.14", emptyCtx)).toBeCloseTo(3.14);
  });

  it("evaluates division", () => {
    expect(evaluateExpression("10 / 4", emptyCtx)).toBe(2.5);
  });

  it("evaluates unary minus", () => {
    expect(evaluateExpression("-5", emptyCtx)).toBe(-5);
  });

  it("evaluates unary minus in expression", () => {
    expect(evaluateExpression("3 + -2", emptyCtx)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

describe("comparison expressions", () => {
  it("evaluates greater than (true)", () => {
    expect(evaluateExpression("5 > 3", emptyCtx)).toBe(1);
  });

  it("evaluates greater than (false)", () => {
    expect(evaluateExpression("3 > 5", emptyCtx)).toBe(0);
  });

  it("evaluates equality (true)", () => {
    expect(evaluateExpression("2 == 2", emptyCtx)).toBe(1);
  });

  it("evaluates equality (false)", () => {
    expect(evaluateExpression("2 == 3", emptyCtx)).toBe(0);
  });

  it("evaluates inequality (true)", () => {
    expect(evaluateExpression("3 != 4", emptyCtx)).toBe(1);
  });

  it("evaluates inequality (false)", () => {
    expect(evaluateExpression("4 != 4", emptyCtx)).toBe(0);
  });

  it("evaluates less than", () => {
    expect(evaluateExpression("2 < 5", emptyCtx)).toBe(1);
  });

  it("evaluates less than or equal", () => {
    expect(evaluateExpression("5 <= 5", emptyCtx)).toBe(1);
    expect(evaluateExpression("6 <= 5", emptyCtx)).toBe(0);
  });

  it("evaluates greater than or equal", () => {
    expect(evaluateExpression("5 >= 5", emptyCtx)).toBe(1);
    expect(evaluateExpression("4 >= 5", emptyCtx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Logical
// ---------------------------------------------------------------------------

describe("logical expressions", () => {
  it("evaluates logical AND (truthy)", () => {
    expect(evaluateExpression("1 && 1", emptyCtx)).toBe(1);
  });

  it("evaluates logical AND (falsy)", () => {
    expect(evaluateExpression("1 && 0", emptyCtx)).toBe(0);
  });

  it("evaluates logical OR (truthy)", () => {
    expect(evaluateExpression("0 || 1", emptyCtx)).toBeTruthy();
  });

  it("evaluates logical OR (falsy)", () => {
    expect(evaluateExpression("0 || 0", emptyCtx)).toBeFalsy();
  });

  it("evaluates logical NOT (false → 1)", () => {
    expect(evaluateExpression("!0", emptyCtx)).toBe(1);
  });

  it("evaluates logical NOT (true → 0)", () => {
    expect(evaluateExpression("!1", emptyCtx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bitwise
// ---------------------------------------------------------------------------

describe("bitwise expressions", () => {
  it("evaluates bitwise OR", () => {
    expect(evaluateExpression("5 | 3", emptyCtx)).toBe(7);
  });

  it("evaluates bitwise AND", () => {
    expect(evaluateExpression("5 & 3", emptyCtx)).toBe(1);
  });

  it("evaluates bitwise NOT", () => {
    expect(evaluateExpression("~0", emptyCtx)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Ternary
// ---------------------------------------------------------------------------

describe("ternary expressions", () => {
  it("evaluates true branch", () => {
    expect(evaluateExpression("1 ? 10 : 20", emptyCtx)).toBe(10);
  });

  it("evaluates false branch", () => {
    expect(evaluateExpression("0 ? 10 : 20", emptyCtx)).toBe(20);
  });

  it("evaluates nested ternary", () => {
    expect(evaluateExpression("1 ? 0 ? 5 : 6 : 7", emptyCtx)).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Source resolution
// ---------------------------------------------------------------------------

describe("source references", () => {
  it("resolves [HOUR_0_23] from time context", () => {
    const ctx = buildDataSources(new Date("2024-01-15T14:30:45"));
    expect(evaluateExpression("[HOUR_0_23]", ctx)).toBe(14);
  });

  it("resolves [MINUTE] from time context", () => {
    const ctx = buildDataSources(new Date("2024-01-15T14:30:45"));
    expect(evaluateExpression("[MINUTE]", ctx)).toBe(30);
  });

  it("returns 0 for unknown source", () => {
    expect(evaluateExpression("[UNKNOWN_SOURCE]", emptyCtx)).toBe(0);
  });

  it("resolves [CONFIGURATION.theme]", () => {
    const ctx = buildDataSources(new Date(), { theme: "dark" });
    expect(evaluateExpression("[CONFIGURATION.theme]", ctx)).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// buildDataSources
// ---------------------------------------------------------------------------

describe("buildDataSources", () => {
  // 2024-01-15 is a Monday; time 14:30:45
  const date = new Date("2024-01-15T14:30:45");

  it("returns correct HOUR_0_23", () => {
    expect(buildDataSources(date).sources.HOUR_0_23).toBe(14);
  });

  it("returns correct MINUTE", () => {
    expect(buildDataSources(date).sources.MINUTE).toBe(30);
  });

  it("returns correct SECOND", () => {
    expect(buildDataSources(date).sources.SECOND).toBe(45);
  });

  it("returns correct HOUR_1_12", () => {
    expect(buildDataSources(date).sources.HOUR_1_12).toBe(2); // 14 % 12 = 2
  });

  it("returns correct HOUR_0_11", () => {
    expect(buildDataSources(date).sources.HOUR_0_11).toBe(2);
  });

  it("returns correct HOUR_1_24", () => {
    expect(buildDataSources(date).sources.HOUR_1_24).toBe(14);
  });

  it("returns AMPM_STATE=1 for PM", () => {
    expect(buildDataSources(date).sources.AMPM_STATE).toBe(1);
  });

  it("returns AMPM_STATE=0 for AM", () => {
    const am = new Date("2024-01-15T09:00:00");
    expect(buildDataSources(am).sources.AMPM_STATE).toBe(0);
  });

  it("returns correct DAY", () => {
    expect(buildDataSources(date).sources.DAY).toBe(15);
  });

  it("returns correct MONTH", () => {
    expect(buildDataSources(date).sources.MONTH).toBe(1);
  });

  it("returns correct YEAR", () => {
    expect(buildDataSources(date).sources.YEAR).toBe(2024);
  });

  it("returns DAY_OF_WEEK=2 for Monday", () => {
    // 2024-01-15 is a Monday → Java Calendar convention: 2
    expect(buildDataSources(date).sources.DAY_OF_WEEK).toBe(2);
  });

  it("returns DAY_OF_YEAR=15 for Jan 15", () => {
    expect(buildDataSources(date).sources.DAY_OF_YEAR).toBe(15);
  });

  it("returns zero-padded HOUR_0_23_Z", () => {
    const midnight = new Date("2024-01-15T05:30:00");
    expect(buildDataSources(midnight).sources.HOUR_0_23_Z).toBe("05");
  });

  it("returns HOUR_0_23_Z without leading zero when >= 10", () => {
    expect(buildDataSources(date).sources.HOUR_0_23_Z).toBe("14");
  });

  it("returns zero-padded SECOND_Z", () => {
    const t = new Date("2024-01-15T14:30:05");
    expect(buildDataSources(t).sources.SECOND_Z).toBe("05");
  });

  it("returns zero-padded MINUTE_Z", () => {
    const t = new Date("2024-01-15T14:03:45");
    expect(buildDataSources(t).sources.MINUTE_Z).toBe("03");
  });

  it("returns digit extraction HOUR_0_23_TENS_DIGIT", () => {
    expect(buildDataSources(date).sources.HOUR_0_23_TENS_DIGIT).toBe(1);
  });

  it("returns digit extraction HOUR_0_23_UNITS_DIGIT", () => {
    expect(buildDataSources(date).sources.HOUR_0_23_UNITS_DIGIT).toBe(4);
  });

  it("returns digit extraction MINUTE_TENS_DIGIT", () => {
    expect(buildDataSources(date).sources.MINUTE_TENS_DIGIT).toBe(3);
  });

  it("returns digit extraction MINUTE_UNITS_DIGIT", () => {
    expect(buildDataSources(date).sources.MINUTE_UNITS_DIGIT).toBe(0);
  });

  it("returns digit extraction SECOND_TENS_DIGIT", () => {
    expect(buildDataSources(date).sources.SECOND_TENS_DIGIT).toBe(4);
  });

  it("returns digit extraction SECOND_UNITS_DIGIT", () => {
    expect(buildDataSources(date).sources.SECOND_UNITS_DIGIT).toBe(5);
  });

  it("IS_24_HOUR_MODE defaults to 1", () => {
    expect(buildDataSources(date).sources.IS_24_HOUR_MODE).toBe(1);
  });

  it("IS_24_HOUR_MODE is 0 when is24Hour=false", () => {
    expect(buildDataSources(date, {}, false).sources.IS_24_HOUR_MODE).toBe(0);
  });

  it("includes UTC_TIMESTAMP", () => {
    const ts = buildDataSources(date).sources.UTC_TIMESTAMP as number;
    expect(typeof ts).toBe("number");
    expect(ts).toBeGreaterThan(0);
  });

  it("resolves config keys as CONFIGURATION.<id>", () => {
    const ctx = buildDataSources(date, { theme: "dark", brightness: 5 });
    expect(ctx.sources["CONFIGURATION.theme"]).toBe("dark");
    expect(ctx.sources["CONFIGURATION.brightness"]).toBe(5);
  });

  it("converts boolean config values to 0/1", () => {
    const ctx = buildDataSources(date, { enabled: true, disabled: false });
    expect(ctx.sources["CONFIGURATION.enabled"]).toBe(1);
    expect(ctx.sources["CONFIGURATION.disabled"]).toBe(0);
  });

  it("handles midnight correctly for HOUR_1_24", () => {
    const midnight = new Date("2024-01-15T00:00:00");
    expect(buildDataSources(midnight).sources.HOUR_1_24).toBe(24);
  });

  it("handles noon correctly for HOUR_1_12", () => {
    const noon = new Date("2024-01-15T12:00:00");
    expect(buildDataSources(noon).sources.HOUR_1_12).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Built-in functions
// ---------------------------------------------------------------------------

describe("built-in functions", () => {
  it("round(3.7) → 4", () => {
    expect(evaluateExpression("round(3.7)", emptyCtx)).toBe(4);
  });

  it("round(3.2) → 3", () => {
    expect(evaluateExpression("round(3.2)", emptyCtx)).toBe(3);
  });

  it("floor(3.7) → 3", () => {
    expect(evaluateExpression("floor(3.7)", emptyCtx)).toBe(3);
  });

  it("ceil(3.2) → 4", () => {
    expect(evaluateExpression("ceil(3.2)", emptyCtx)).toBe(4);
  });

  it("abs(-5) → 5", () => {
    expect(evaluateExpression("abs(-5)", emptyCtx)).toBe(5);
  });

  it("abs(5) → 5", () => {
    expect(evaluateExpression("abs(5)", emptyCtx)).toBe(5);
  });

  it("sqrt(9) → 3", () => {
    expect(evaluateExpression("sqrt(9)", emptyCtx)).toBe(3);
  });

  it("pow(2,3) → 8", () => {
    expect(evaluateExpression("pow(2,3)", emptyCtx)).toBe(8);
  });

  it("clamp(10,0,5) → 5", () => {
    expect(evaluateExpression("clamp(10,0,5)", emptyCtx)).toBe(5);
  });

  it("clamp(-1,0,5) → 0", () => {
    expect(evaluateExpression("clamp(-1,0,5)", emptyCtx)).toBe(0);
  });

  it("clamp(3,0,5) → 3", () => {
    expect(evaluateExpression("clamp(3,0,5)", emptyCtx)).toBe(3);
  });

  it("fract(3.75) → 0.75", () => {
    expect(evaluateExpression("fract(3.75)", emptyCtx)).toBeCloseTo(0.75);
  });

  it("sin(0) → 0", () => {
    expect(evaluateExpression("sin(0)", emptyCtx)).toBeCloseTo(0);
  });

  it("cos(0) → 1", () => {
    expect(evaluateExpression("cos(0)", emptyCtx)).toBeCloseTo(1);
  });

  it("deg converts radians to degrees", () => {
    expect(evaluateExpression("deg(3.141592653589793)", emptyCtx)).toBeCloseTo(180);
  });

  it("rad converts degrees to radians", () => {
    expect(evaluateExpression("rad(180)", emptyCtx)).toBeCloseTo(Math.PI);
  });

  it("log(1) → 0", () => {
    expect(evaluateExpression("log(1)", emptyCtx)).toBeCloseTo(0);
  });

  it("log2(8) → 3", () => {
    expect(evaluateExpression("log2(8)", emptyCtx)).toBeCloseTo(3);
  });

  it("log10(1000) → 3", () => {
    expect(evaluateExpression("log10(1000)", emptyCtx)).toBeCloseTo(3);
  });

  it("exp(0) → 1", () => {
    expect(evaluateExpression("exp(0)", emptyCtx)).toBeCloseTo(1);
  });

  it("numberFormat(5, 3) → '005'", () => {
    expect(evaluateExpression("numberFormat(5, 3)", emptyCtx)).toBe("005");
  });

  it("numberFormat(123, 3) → '123'", () => {
    expect(evaluateExpression("numberFormat(123, 3)", emptyCtx)).toBe("123");
  });

  it("subText works", () => {
    expect(evaluateExpression("subText('hello', 1, 3)", emptyCtx)).toBe("el");
  });

  it("textLength works", () => {
    expect(evaluateExpression("textLength('hello')", emptyCtx)).toBe(5);
  });

  it("icuText returns pattern as-is", () => {
    expect(evaluateExpression("icuText('EEE')", emptyCtx)).toBe("EEE");
  });
});

// ---------------------------------------------------------------------------
// Complex expressions
// ---------------------------------------------------------------------------

describe("complex expressions", () => {
  it("clock angle formula: [HOUR_0_23] * 30 + [MINUTE] / 2", () => {
    // 14:30 → 14*30 + 30/2 = 420 + 15 = 435
    const ctx = buildDataSources(new Date("2024-01-15T14:30:00"));
    expect(evaluateExpression("[HOUR_0_23] * 30 + [MINUTE] / 2", ctx)).toBe(435);
  });

  it("minute hand angle: [MINUTE] * 6", () => {
    // 30 minutes → 180 degrees
    const ctx = buildDataSources(new Date("2024-01-15T14:30:00"));
    expect(evaluateExpression("[MINUTE] * 6", ctx)).toBe(180);
  });

  it("conditional expression with time sources", () => {
    // If PM, show 1, else 0
    const ctx = buildDataSources(new Date("2024-01-15T14:30:00"));
    expect(evaluateExpression("[AMPM_STATE] == 1 ? 1 : 0", ctx)).toBe(1);
  });

  it("chained arithmetic with multiple sources", () => {
    const ctx = buildDataSources(new Date("2024-01-15T14:30:45"));
    // SECOND_TENS_DIGIT * 10 + SECOND_UNITS_DIGIT == SECOND
    const result = evaluateExpression(
      "[SECOND_TENS_DIGIT] * 10 + [SECOND_UNITS_DIGIT]",
      ctx
    );
    expect(result).toBe(45);
  });

  it("nested function calls", () => {
    expect(evaluateExpression("round(sqrt(16))", emptyCtx)).toBe(4);
  });

  it("expression with comparison and arithmetic", () => {
    expect(evaluateExpression("(2 + 3) * 4 > 15", emptyCtx)).toBe(1);
  });
});
