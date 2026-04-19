/**
 * WFF Expression Engine
 *
 * Tokenizer, parser, and evaluator for WFF arithmetic expressions.
 * Supports data source references like [HOUR_0_23], built-in functions,
 * standard arithmetic, comparison, logical, bitwise, and ternary operators.
 */

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenType =
  | "number"
  | "string"
  | "source"
  | "ident"
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "=="
  | "!="
  | "<"
  | "<="
  | ">"
  | ">="
  | "&&"
  | "||"
  | "!"
  | "~"
  | "|"
  | "&"
  | "?"
  | ":"
  | "("
  | ")"
  | ",";

interface Token {
  type: TokenType;
  value: string | number;
}

// ---------------------------------------------------------------------------
// AST node types
// ---------------------------------------------------------------------------

type ASTNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "source"; name: string }
  | { type: "binary"; op: string; left: ASTNode; right: ASTNode }
  | { type: "unary"; op: string; operand: ASTNode }
  | {
      type: "ternary";
      condition: ASTNode;
      consequent: ASTNode;
      alternate: ASTNode;
    }
  | { type: "call"; name: string; args: ASTNode[] };

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ExpressionContext {
  sources: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // Source reference [SOURCE_NAME]
    if (input[i] === "[") {
      const end = input.indexOf("]", i);
      if (end === -1) throw new Error(`Unterminated source reference at ${i}`);
      tokens.push({ type: "source", value: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }

    // String literal
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let str = "";
      i++;
      while (i < input.length && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < input.length) {
          i++;
          str += input[i];
        } else {
          str += input[i];
        }
        i++;
      }
      i++; // consume closing quote
      tokens.push({ type: "string", value: str });
      continue;
    }

    // Number literal
    if (/[0-9]/.test(input[i]) || (input[i] === "." && /[0-9]/.test(input[i + 1] ?? ""))) {
      let num = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }

    // Two-character operators
    const two = input.slice(i, i + 2);
    if (two === "==" || two === "!=" || two === "<=" || two === ">=" || two === "&&" || two === "||") {
      tokens.push({ type: two as TokenType, value: two });
      i += 2;
      continue;
    }

    // Single-character operators and punctuation
    const ch = input[i];
    if ("+-*/%<>!~|&?:(),".includes(ch)) {
      tokens.push({ type: ch as TokenType, value: ch });
      i++;
      continue;
    }

    // Identifier or function name
    if (/[a-zA-Z_]/.test(input[i])) {
      let ident = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        ident += input[i];
        i++;
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    throw new Error(`Unexpected character '${input[i]}' at position ${i}`);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private consume(): Token {
    const tok = this.tokens[this.pos];
    if (!tok) throw new Error("Unexpected end of expression");
    this.pos++;
    return tok;
  }

  private expect(type: TokenType): Token {
    const tok = this.consume();
    if (tok.type !== type) {
      throw new Error(`Expected token '${type}', got '${tok.type}'`);
    }
    return tok;
  }

  parse(): ASTNode {
    const node = this.parseTernary();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token '${this.tokens[this.pos].value}' at position ${this.pos}`);
    }
    return node;
  }

  // Ternary: condition ? consequent : alternate
  private parseTernary(): ASTNode {
    const condition = this.parseOr();
    if (this.peek()?.type === "?") {
      this.consume(); // ?
      const consequent = this.parseTernary();
      this.expect(":");
      const alternate = this.parseTernary();
      return { type: "ternary", condition, consequent, alternate };
    }
    return condition;
  }

  // Logical OR
  private parseOr(): ASTNode {
    let left = this.parseAnd();
    while (this.peek()?.type === "||") {
      const op = this.consume().type as string;
      const right = this.parseAnd();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Logical AND
  private parseAnd(): ASTNode {
    let left = this.parseBitwiseOr();
    while (this.peek()?.type === "&&") {
      const op = this.consume().type as string;
      const right = this.parseBitwiseOr();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Bitwise OR
  private parseBitwiseOr(): ASTNode {
    let left = this.parseBitwiseAnd();
    while (this.peek()?.type === "|") {
      const op = this.consume().type as string;
      const right = this.parseBitwiseAnd();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Bitwise AND
  private parseBitwiseAnd(): ASTNode {
    let left = this.parseEquality();
    while (this.peek()?.type === "&") {
      const op = this.consume().type as string;
      const right = this.parseEquality();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Equality: == !=
  private parseEquality(): ASTNode {
    let left = this.parseComparison();
    while (this.peek()?.type === "==" || this.peek()?.type === "!=") {
      const op = this.consume().type as string;
      const right = this.parseComparison();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Comparison: < <= > >=
  private parseComparison(): ASTNode {
    let left = this.parseAddition();
    while (
      this.peek()?.type === "<" ||
      this.peek()?.type === "<=" ||
      this.peek()?.type === ">" ||
      this.peek()?.type === ">="
    ) {
      const op = this.consume().type as string;
      const right = this.parseAddition();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Addition: + -
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.peek()?.type === "+" || this.peek()?.type === "-") {
      const op = this.consume().type as string;
      const right = this.parseMultiplication();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Multiplication: * / %
  private parseMultiplication(): ASTNode {
    let left = this.parseUnary();
    while (
      this.peek()?.type === "*" ||
      this.peek()?.type === "/" ||
      this.peek()?.type === "%"
    ) {
      const op = this.consume().type as string;
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  // Unary: ! - ~
  private parseUnary(): ASTNode {
    const tok = this.peek();
    if (tok?.type === "!" || tok?.type === "-" || tok?.type === "~") {
      this.consume();
      const operand = this.parseUnary();
      return { type: "unary", op: tok.type as string, operand };
    }
    return this.parsePrimary();
  }

  // Primary: number, string, source ref, function call, parenthesized
  private parsePrimary(): ASTNode {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of expression");

    if (tok.type === "number") {
      this.consume();
      return { type: "number", value: tok.value as number };
    }

    if (tok.type === "string") {
      this.consume();
      return { type: "string", value: tok.value as string };
    }

    if (tok.type === "source") {
      this.consume();
      return { type: "source", name: tok.value as string };
    }

    if (tok.type === "ident") {
      this.consume();
      const name = tok.value as string;
      // Check if this is a function call
      if (this.peek()?.type === "(") {
        this.consume(); // (
        const args: ASTNode[] = [];
        if (this.peek()?.type !== ")") {
          args.push(this.parseTernary());
          while (this.peek()?.type === ",") {
            this.consume(); // ,
            args.push(this.parseTernary());
          }
        }
        this.expect(")");
        return { type: "call", name, args };
      }
      // Plain identifier treated as a string literal (e.g. enum values)
      return { type: "string", value: name };
    }

    if (tok.type === "(") {
      this.consume(); // (
      const node = this.parseTernary();
      this.expect(")");
      return node;
    }

    throw new Error(`Unexpected token '${tok.value}' (${tok.type})`);
  }
}

// ---------------------------------------------------------------------------
// Built-in functions
// ---------------------------------------------------------------------------

type BuiltinFn = (args: (number | string)[]) => number | string;

function numArg(args: (number | string)[], i: number, fname: string): number {
  const v = args[i];
  if (typeof v !== "number") throw new Error(`${fname}: argument ${i} must be a number, got ${v}`);
  return v;
}

const BUILTINS: Record<string, BuiltinFn> = {
  round: (a) => Math.round(numArg(a, 0, "round")),
  floor: (a) => Math.floor(numArg(a, 0, "floor")),
  ceil: (a) => Math.ceil(numArg(a, 0, "ceil")),
  fract: (a) => { const x = numArg(a, 0, "fract"); return x - Math.floor(x); },
  abs: (a) => Math.abs(numArg(a, 0, "abs")),
  sqrt: (a) => Math.sqrt(numArg(a, 0, "sqrt")),
  pow: (a) => Math.pow(numArg(a, 0, "pow"), numArg(a, 1, "pow")),
  sin: (a) => Math.sin(numArg(a, 0, "sin")),
  cos: (a) => Math.cos(numArg(a, 0, "cos")),
  tan: (a) => Math.tan(numArg(a, 0, "tan")),
  asin: (a) => Math.asin(numArg(a, 0, "asin")),
  acos: (a) => Math.acos(numArg(a, 0, "acos")),
  atan: (a) => Math.atan(numArg(a, 0, "atan")),
  deg: (a) => numArg(a, 0, "deg") * (180 / Math.PI),
  rad: (a) => numArg(a, 0, "rad") * (Math.PI / 180),
  clamp: (a) => {
    const x = numArg(a, 0, "clamp");
    const min = numArg(a, 1, "clamp");
    const max = numArg(a, 2, "clamp");
    return Math.min(Math.max(x, min), max);
  },
  log: (a) => Math.log(numArg(a, 0, "log")),
  log2: (a) => Math.log2(numArg(a, 0, "log2")),
  log10: (a) => Math.log10(numArg(a, 0, "log10")),
  exp: (a) => Math.exp(numArg(a, 0, "exp")),
  numberFormat: (a) => {
    const value = numArg(a, 0, "numberFormat");
    const minIntDigits = numArg(a, 1, "numberFormat");
    return String(Math.trunc(value)).padStart(minIntDigits, "0");
  },
  subText: (a) => {
    const str = String(a[0]);
    const start = numArg(a, 1, "subText");
    const end = numArg(a, 2, "subText");
    return str.slice(start, end);
  },
  textLength: (a) => String(a[0]).length,
  icuText: (a) => String(a[0]), // return the pattern as-is
};

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function evalNode(node: ASTNode, ctx: ExpressionContext): number | string {
  switch (node.type) {
    case "number":
      return node.value;

    case "string":
      return node.value;

    case "source": {
      const val = ctx.sources[node.name];
      if (val === undefined) {
        // Unknown sources default to 0
        return 0;
      }
      return val;
    }

    case "unary": {
      const operand = evalNode(node.operand, ctx);
      switch (node.op) {
        case "!":
          return Number(!operand) as number;
        case "-":
          return -(operand as number);
        case "~":
          return ~(operand as number);
        default:
          throw new Error(`Unknown unary operator: ${node.op}`);
      }
    }

    case "binary": {
      const left = evalNode(node.left, ctx);
      const right = evalNode(node.right, ctx);
      switch (node.op) {
        case "+":
          // String concatenation if either side is a string
          if (typeof left === "string" || typeof right === "string") {
            return String(left) + String(right);
          }
          return (left as number) + (right as number);
        case "-":
          return (left as number) - (right as number);
        case "*":
          return (left as number) * (right as number);
        case "/":
          return (left as number) / (right as number);
        case "%":
          return (left as number) % (right as number);
        case "==":
          return left == right ? 1 : 0;
        case "!=":
          return left != right ? 1 : 0;
        case "<":
          return (left as number) < (right as number) ? 1 : 0;
        case "<=":
          return (left as number) <= (right as number) ? 1 : 0;
        case ">":
          return (left as number) > (right as number) ? 1 : 0;
        case ">=":
          return (left as number) >= (right as number) ? 1 : 0;
        case "&&":
          return left && right ? 1 : 0;
        case "||":
          return (left || right) ? 1 : 0;
        case "|":
          return (left as number) | (right as number);
        case "&":
          return (left as number) & (right as number);
        default:
          throw new Error(`Unknown binary operator: ${node.op}`);
      }
    }

    case "ternary": {
      const cond = evalNode(node.condition, ctx);
      return cond ? evalNode(node.consequent, ctx) : evalNode(node.alternate, ctx);
    }

    case "call": {
      const fn = BUILTINS[node.name];
      if (!fn) throw new Error(`Unknown function: ${node.name}`);
      const args = node.args.map((a) => evalNode(a, ctx));
      return fn(args);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate an expression string against a context.
 */
export function evaluateExpression(
  expr: string,
  context: ExpressionContext
): number | string {
  const tokens = tokenize(expr);
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return evalNode(ast, context);
}

// ---------------------------------------------------------------------------
// Data source helpers
// ---------------------------------------------------------------------------

function zeroPad(value: number): string {
  return String(value).padStart(2, "0");
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Build data source context from a Date and optional configuration.
 */
export function buildDataSources(
  time: Date,
  config?: Record<string, string | number | boolean>,
  is24Hour?: boolean
): ExpressionContext {
  const millisecond = time.getMilliseconds(); // 0-999
  const second = time.getSeconds(); // 0-59
  const minute = time.getMinutes(); // 0-59
  const hour0_23 = time.getHours(); // 0-23
  const hour0_11 = hour0_23 % 12; // 0-11
  const hour1_12 = hour0_11 === 0 ? 12 : hour0_11; // 1-12
  const hour1_24 = hour0_23 === 0 ? 24 : hour0_23; // 1-24
  const day = time.getDate(); // 1-31
  // getDay() returns 0=Sunday..6=Saturday; Java Calendar: 1=Sunday..7=Saturday
  const dayOfWeek = time.getDay() + 1; // 1-7
  const dayOfYear = getDayOfYear(time); // 1-366
  const month = time.getMonth() + 1; // 1-12
  const year = time.getFullYear();
  const ampmState = hour0_23 >= 12 ? 1 : 0;
  const is24HourMode = is24Hour !== false ? 1 : 0;
  const utcTimestamp = time.getTime();
  const secondsSinceEpoch = Math.floor(utcTimestamp / 1000);
  const daysInMonth = new Date(year, time.getMonth() + 1, 0).getDate();

  // Combined float sources
  const secondMillisecond = second + millisecond / 1000; // 0.0–59.999
  const minuteSecond = minute + second / 60; // 0.0–59.98̄
  const hour0_11Minute = hour0_11 + minute / 60; // 0.0–11.98̄
  const hour1_12Minute = hour1_12 + minute / 60; // 1.0–12.98̄
  const hour0_23Minute = hour0_23 + minute / 60; // 0.0–23.98̄
  const hour1_24Minute = hour1_24 + minute / 60; // 1.0–24.98̄
  const secondsInDay = hour0_23 * 3600 + minute * 60 + second; // 0–86399
  const day0_30 = day - 1; // 0-30
  const dayHour = day + hour0_23 / 24; // 1.0–31.95̄
  const day0_30Hour = day0_30 + hour0_23 / 24; // 0.0–30.95̄
  const month0_11 = month - 1; // 0-11
  const monthDay = month + day0_30 / daysInMonth; // 1.0–12.9x
  const month0_11Day = month0_11 + day0_30 / daysInMonth; // 0.0–11.9x
  const yearMonth = year + month0_11 / 12; // e.g. 2024.0–2024.91̄
  const yearMonthDay = year + (month0_11 + day0_30 / daysInMonth) / 12;
  const weekInMonth = Math.ceil(day / 7); // 0-5
  const weekInYear = Math.ceil(dayOfYear / 7); // 1-53

  // Day-of-week strings
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthNamesShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  // Timezone info
  const tzOffsetMinutes = -time.getTimezoneOffset(); // JS gives negated offset
  const tzOffsetHours = Math.trunc(tzOffsetMinutes / 60);
  const tzOffsetRemMin = Math.abs(tzOffsetMinutes % 60);
  const tzOffsetStr = `${tzOffsetHours >= 0 ? "+" : ""}${tzOffsetHours}${tzOffsetRemMin ? ":" + zeroPad(tzOffsetRemMin) : ""}`;
  const tzName = Intl.DateTimeFormat(undefined, { timeZoneName: "long" }).formatToParts(time)
    .find(p => p.type === "timeZoneName")?.value ?? "";
  const tzAbb = Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(time)
    .find(p => p.type === "timeZoneName")?.value ?? "";
  const tzId = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";

  const sources: Record<string, number | string> = {
    // Milliseconds
    UTC_TIMESTAMP: utcTimestamp,
    MILLISECOND: millisecond,

    // Seconds
    SECOND: second,
    SECOND_Z: zeroPad(second),
    SECOND_TENS_DIGIT: Math.floor(second / 10),
    SECOND_UNITS_DIGIT: second % 10,
    SECOND_MILLISECOND: secondMillisecond,
    SECONDS_IN_DAY: secondsInDay,
    SECONDS_SINCE_EPOCH: secondsSinceEpoch,

    // Minutes
    MINUTE: minute,
    MINUTE_Z: zeroPad(minute),
    MINUTE_TENS_DIGIT: Math.floor(minute / 10),
    MINUTE_UNITS_DIGIT: minute % 10,
    MINUTE_SECOND: minuteSecond,
    MINUTES_SINCE_EPOCH: Math.floor(secondsSinceEpoch / 60),

    // Hours (12-hour 0-11)
    HOUR_0_11: hour0_11,
    HOUR_0_11_Z: zeroPad(hour0_11),
    HOUR_0_11_MINUTE: hour0_11Minute,

    // Hours (12-hour 1-12)
    HOUR_1_12: hour1_12,
    HOUR_1_12_Z: zeroPad(hour1_12),
    HOUR_1_12_MINUTE: hour1_12Minute,

    // Hours (24-hour 0-23)
    HOUR_0_23: hour0_23,
    HOUR_0_23_Z: zeroPad(hour0_23),
    HOUR_0_23_MINUTE: hour0_23Minute,
    HOUR_0_23_TENS_DIGIT: Math.floor(hour0_23 / 10),
    HOUR_0_23_UNITS_DIGIT: hour0_23 % 10,

    // Hours (24-hour 1-24)
    HOUR_1_24: hour1_24,
    HOUR_1_24_Z: zeroPad(hour1_24),
    HOUR_1_24_MINUTE: hour1_24Minute,

    // Hour digit extraction (depends on IS_24_HOUR_MODE)
    HOUR_TENS_DIGIT: is24HourMode
      ? Math.floor(hour0_23 / 10)
      : Math.floor(hour1_12 / 10),
    HOUR_UNITS_DIGIT: is24HourMode
      ? hour0_23 % 10
      : hour1_12 % 10,
    HOURS_SINCE_EPOCH: Math.floor(secondsSinceEpoch / 3600),

    // Hour digit extraction for specific formats
    HOUR_1_12_TENS_DIGIT: Math.floor(hour1_12 / 10),
    HOUR_1_12_UNITS_DIGIT: hour1_12 % 10,
    HOUR_0_11_TENS_DIGIT: Math.floor(hour0_11 / 10),
    HOUR_0_11_UNITS_DIGIT: hour0_11 % 10,
    HOUR_1_24_TENS_DIGIT: Math.floor(hour1_24 / 10),
    HOUR_1_24_UNITS_DIGIT: hour1_24 % 10,

    // Days
    DAY: day,
    DAY_Z: zeroPad(day),
    DAY_HOUR: dayHour,
    DAY_0_30: day0_30,
    DAY_0_30_HOUR: day0_30Hour,
    DAY_OF_YEAR: dayOfYear,
    DAY_OF_WEEK: dayOfWeek,
    DAY_OF_WEEK_F: dayNames[time.getDay()],
    DAY_OF_WEEK_S: dayNamesShort[time.getDay()],
    FIRST_DAY_OF_WEEK: 1, // default to Sunday; no browser API for locale first day

    // Months
    MONTH: month,
    MONTH_Z: zeroPad(month),
    MONTH_F: monthNames[time.getMonth()],
    MONTH_S: monthNamesShort[time.getMonth()],
    DAYS_IN_MONTH: daysInMonth,
    MONTH_DAY: monthDay,
    MONTH_0_11: month0_11,
    MONTH_0_11_DAY: month0_11Day,

    // Years
    YEAR: year,
    YEAR_S: year % 100,
    YEAR_MONTH: yearMonth,
    YEAR_MONTH_DAY: yearMonthDay,

    // Weeks
    WEEK_IN_MONTH: weekInMonth,
    WEEK_IN_YEAR: weekInYear,

    // AM/PM and mode
    AMPM_STATE: ampmState,
    IS_24_HOUR_MODE: is24HourMode,

    // Daylight saving time
    IS_DAYLIGHT_SAVING_TIME: isDST(time) ? 1 : 0,

    // Timezone
    TIMEZONE: tzName,
    TIMEZONE_ABB: tzAbb,
    TIMEZONE_ID: tzId,
    TIMEZONE_OFFSET: tzOffsetStr,
    TIMEZONE_OFFSET_MINUTES: tzOffsetMinutes,
    TIMEZONE_OFFSET_DST: tzOffsetStr, // JS Date already includes DST
    TIMEZONE_OFFSET_MINUTES_DST: tzOffsetMinutes, // JS Date already includes DST
  };

  // Configuration sources
  if (config) {
    for (const [key, value] of Object.entries(config)) {
      sources[`CONFIGURATION.${key}`] = typeof value === "boolean" ? (value ? 1 : 0) : value;
    }
  }

  return { sources };
}

function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(date.getFullYear(), 6, 1).getTimezoneOffset();
  const stdOffset = Math.max(jan, jul);
  return date.getTimezoneOffset() < stdOffset;
}
