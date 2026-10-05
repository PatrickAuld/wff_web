import { calendarMetrics } from "./calendar.js";
import type { ExpressionContext } from "./expressions.js";

export function formatDate(pattern: string, timestamp: number, ctx: ExpressionContext, best = false): string {
  const date = new Date(timestamp);
  const base: Intl.DateTimeFormatOptions = { timeZone: ctx.timeZone, calendar: ctx.calendar };
  const locale = ctx.locale ?? "en-US";
  const part = (type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...base, ...options }).formatToParts(date).find(p => p.type === type)?.value ?? "";
  const numericPart = (type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions) => Number(new Intl.DateTimeFormat("en-US", { ...base, ...options }).formatToParts(date).find(p => p.type === type)?.value ?? 0);
  const hour = numericPart("hour", { hour: "numeric", hourCycle: "h23" });
  const minute = numericPart("minute", { minute: "numeric" });
  const second = numericPart("second", { second: "numeric" });
  const numeric = (value: number, n: number) => new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: n }).format(value);
  const wallParts = new Intl.DateTimeFormat("en-US", { ...base, calendar: "gregory", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(date);
  const field = (name: string) => Number(wallParts.find(p => p.type === name)?.value);
  const wall = new Date(Date.UTC(field("year"), field("month") - 1, field("day")));
  let dayOfYear = Math.floor((wall.getTime() - Date.UTC(field("year"), 0, 0)) / 86400000);
  if (ctx.calendar && ctx.calendar !== "gregory" && ctx.calendar !== "iso8601") dayOfYear = calendarMetrics(wall.getTime(), ctx.calendar).dayOfYear;
  const localeInfo = new Intl.Locale(locale) as unknown as Omit<Intl.Locale, "getWeekInfo" | "weekInfo"> & { getWeekInfo?: () => { firstDay: number; minimalDays?: number }; weekInfo?: { firstDay: number; minimalDays?: number } };
  const weekInfo = localeInfo.getWeekInfo?.() ?? localeInfo.weekInfo ?? { firstDay: 7, minimalDays: 1 };
  const firstDay = weekInfo.firstDay % 7;
  const region = localeInfo.maximize().region ?? "US";
  const minimalDays = weekInfo.minimalDays ?? ("AD AT BE BG CH CZ DE DK EE ES FI FR GB GR IE IS IT LI LT LU MC NL NO PL PT RU SE SK".split(" ").includes(region) ? 4 : 1);
  const weekStart = (year: number, month: number) => { const start = Date.UTC(year, month, 1), before = (new Date(start).getUTCDay() - firstDay + 7) % 7; return start - before * 86400000 + (7 - before < minimalDays ? 604800000 : 0); };
  let weekYear = field("year");
  if (wall.getTime() < weekStart(weekYear, 0)) weekYear--; else if (wall.getTime() >= weekStart(weekYear + 1, 0)) weekYear++;
  const weekInYear = 1 + Math.floor((wall.getTime() - weekStart(weekYear, 0)) / 604800000);
  const zoneOffset = part("timeZoneName", { timeZoneName: "longOffset" }).match(/GMT([+-])(\d\d):(\d\d)/);
  const offset = zoneOffset ? (zoneOffset[1] === "-" ? -1 : 1) * (Number(zoneOffset[2]) * 60 + Number(zoneOffset[3])) : 0;
  const offsetText = (colon: boolean) => `${offset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2,"0")}${colon ? ":" : ""}${String(Math.abs(offset) % 60).padStart(2,"0")}`;
  const tokens = pattern.match(/('[^']*(?:''[^']*)*'|[a-zA-Z]+|[^a-zA-Z']+)/g) ?? [];
  if (best) {
    const options: Intl.DateTimeFormatOptions = { ...base };
    if (/y/.test(pattern)) options.year = "numeric";
    if (/M|L/.test(pattern)) options.month = /MMMM|LLLL/.test(pattern) ? "long" : /MMM|LLL/.test(pattern) ? "short" : "numeric";
    if (/d/.test(pattern)) options.day = "numeric";
    if (/E|c/.test(pattern)) options.weekday = /EEEE/.test(pattern) ? "long" : "short";
    if (/h|H|K|k|j|J|C/.test(pattern)) { options.hour = "numeric"; if (!/j|J|C/.test(pattern)) options.hour12 = /h|K/.test(pattern); }
    if (/m/.test(pattern)) options.minute = "2-digit";
    if (/s/.test(pattern)) options.second = "2-digit";
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
  return tokens.map(t => {
    if (t === "''") return "'";
    if (t.startsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
    return t.replace(/([a-zA-Z])\1*/g, (token, char: string) => {
      const n = token.length;
      switch (char) {
        case "y": { const y = part("year", { year: n === 2 ? "2-digit" : "numeric" }); return /^\d+$/.test(y) ? y.padStart(n, "0") : y; }
        case "Y": return numeric(n === 2 ? weekYear % 100 : weekYear, n);
        case "u": case "r": return numeric(field("year"), n);
        case "U": return part("yearName" as Intl.DateTimeFormatPartTypes, { year: "numeric" }) || part("year", { year: "numeric" });
        case "M": case "L": return part("month", { month: n === 5 ? "narrow" : n >= 4 ? "long" : n === 3 ? "short" : n === 2 ? "2-digit" : "numeric" });
        case "d": return part("day", { day: n === 2 ? "2-digit" : "numeric" });
        case "E": return part("weekday", { weekday: n === 5 ? "narrow" : n === 4 ? "long" : "short" });
        case "e": case "c": return n <= 2 ? numeric((wall.getUTCDay() - firstDay + 7) % 7 + 1, n) : part("weekday", { weekday: n === 5 ? "narrow" : n === 4 ? "long" : "short" });
        case "D": return numeric(dayOfYear, n);
        case "F": return numeric(Math.ceil(field("day") / 7), n);
        case "w": return numeric(weekInYear, n);
        case "W": return numeric(Math.max(0, 1 + Math.floor((wall.getTime() - weekStart(field("year"), field("month") - 1)) / 604800000)), n);
        case "g": return numeric(Math.floor(wall.getTime() / 86400000) + 40587, n);
        case "Q": case "q": { const quarter = Math.ceil(field("month") / 3); return n <= 2 ? numeric(quarter, n) : n === 3 ? `Q${quarter}` : `${quarter}${["st","nd","rd","th"][quarter - 1]} quarter`; }
        case "j": case "J": case "C": return part("hour", { hour: n === 2 ? "2-digit" : "numeric" });
        case "H": return numeric(hour, n);
        case "h": return numeric(hour % 12 || 12, n);
        case "K": return numeric(hour % 12, n);
        case "k": return numeric(hour || 24, n);
        case "m": return numeric(minute, n);
        case "s": return numeric(second, n);
        case "S": return String(date.getMilliseconds()).padStart(3, "0").slice(0, n).padEnd(n, "0");
        case "A": return numeric(hour * 3600000 + minute * 60000 + second * 1000 + date.getMilliseconds(), n);
        case "B": case "b": return part("dayPeriod", { hour: "numeric", hour12: true, dayPeriod: n >= 4 ? "long" : "short" });
        case "a": return part("dayPeriod", { hour: "numeric", hour12: true });
        case "X": case "x": return char === "X" && offset === 0 ? "Z" : n === 1 && offset % 60 === 0 ? offsetText(false).slice(0, 3) : offsetText(n === 3 || n === 5);
        case "Z": return n === 4 ? "GMT" + offsetText(true) : n >= 5 && offset === 0 ? "Z" : offsetText(n >= 5);
        case "O": return "GMT" + offsetText(true);
        case "V": return n === 2 ? ctx.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone : part("timeZoneName", { timeZoneName: n >= 4 ? "longGeneric" : "shortGeneric" });
        case "z": case "v": return part("timeZoneName", { timeZoneName: n >= 4 ? "long" : "short" });
        case "G": return part("era", { era: n >= 4 ? "long" : "short", year: "numeric" });
        default: return token;
      }
    });
  }).join("");
}

export function formatNumber(pattern: string, value: number, locale = "en-US", currency?: string): string {
  let quoted = false, split = -1;
  for (let i = 0; i < pattern.length; i++) { if (pattern[i] === "'") { if (pattern[i + 1] === "'") i++; else quoted = !quoted; } else if (pattern[i] === ";" && !quoted) { split = i; break; } }
  const explicitNegative = value < 0 && split >= 0;
  const subpattern = explicitNegative ? pattern.slice(split + 1) : split >= 0 ? pattern.slice(0, split) : pattern;
  let mask = "", inside = false;
  for (let i = 0; i < subpattern.length; i++) {
    if (subpattern[i] === "'") { if (subpattern[i + 1] === "'") { mask += "  "; i++; } else { inside = !inside; mask += " "; } }
    else mask += inside ? " " : subpattern[i];
  }
  const match = mask.match(/[0#][0#,]*(?:\.[0#]*)?(?:E\+?0+)?/);
  if (!match) return String(value);
  const [mantissaPattern, exponentPattern] = match[0].split("E"), [integer, fraction = ""] = mantissaPattern.split(".");
  const percent = mask.includes("%"), perMille = mask.includes("‰");
  let scaled = Math.abs(value) * (percent ? 100 : perMille ? 1000 : 1), exponent = 0;
  const minInteger = Math.max(1, (integer.match(/0/g) ?? []).length), maxInteger = integer.replace(/,/g, "").length;
  if (exponentPattern && scaled > 0 && Number.isFinite(scaled)) {
    const magnitude = Math.floor(Math.log10(scaled));
    exponent = maxInteger > minInteger && maxInteger > 1 ? Math.floor(magnitude / maxInteger) * maxInteger : magnitude - minInteger + 1;
    scaled /= 10 ** exponent;
  }
  const opts: Intl.NumberFormatOptions & { roundingMode: string } = {
    useGrouping: integer.includes(","), minimumIntegerDigits: minInteger,
    minimumFractionDigits: (fraction.match(/0/g) ?? []).length, maximumFractionDigits: fraction.length,
    roundingMode: "halfEven",
  };
  let rendered = new Intl.NumberFormat(locale, opts).format(scaled);
  if (exponentPattern) rendered += "E" + (exponent < 0 ? "-" : exponentPattern.startsWith("+") ? "+" : "") + new Intl.NumberFormat(locale, {useGrouping:false,minimumIntegerDigits:exponentPattern.replace("+", "").length}).format(Math.abs(exponent));
  const region = new Intl.Locale(locale).maximize().region ?? "US";
  const currencies: Record<string, string> = { US:"USD", GB:"GBP", JP:"JPY", CN:"CNY", KR:"KRW", IN:"INR", CA:"CAD", AU:"AUD", NZ:"NZD", CH:"CHF", SE:"SEK", NO:"NOK", DK:"DKK", BR:"BRL", MX:"MXN", RU:"RUB", ZA:"ZAR", TW:"TWD", HK:"HKD", SG:"SGD", TH:"THB", ID:"IDR", AE:"AED", SA:"SAR", IL:"ILS", PL:"PLN", CZ:"CZK", HU:"HUF", TR:"TRY" };
  const code = currency ?? currencies[region] ?? ("AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK".split(" ").includes(region) ? "EUR" : "XXX");
  const currencySymbol = () => new Intl.NumberFormat(locale, { style: "currency", currency: code }).formatToParts(0).find(p => p.type === "currency")?.value ?? code;
  const affix = (text: string) => {
    let result = "", quote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "'") { if (text[i + 1] === "'") { result += "'"; i++; } else quote = !quote; }
      else if (!quote && c === "¤") { if (text[i+1] === "¤") { result += code; i++; } else result += currencySymbol(); }
      else result += c;
    }
    return result;
  };
  const at = match.index!;
  return (value < 0 && !explicitNegative ? "-" : "") + affix(subpattern.slice(0, at)) + rendered + affix(subpattern.slice(at + match[0].length));
}

export function formatTemplate(pattern: string, values: (string | number)[], ctx: ExpressionContext = { sources: {} }): string {
  let index = 0, previous = 0;
  const locale = ctx.locale ?? "en-US";
  return pattern.replace(/%(?:(\d+)\$)?([-+ 0,(#<]*)(\d+)?(?:\.(\d+))?([sSdDfFeEgGaAxXoOhHbcBn%]|[tT][a-zA-Z])/g,
    (_all, position, flags: string, width, precision, type: string) => {
      if (type === "%") return "%".padStart(Number(width ?? 0), " ");
      if (type === "n") return "\n";
      const at = flags.includes("<") ? previous : position ? Number(position) - 1 : index++;
      previous = at;
      const value = values[at] ?? "";
      const number = Number(value), absolute = Math.abs(number), digits = Number(precision ?? 6);
      let result: string, numeric = false;
      if (/^[tT]/.test(type)) {
        const token = type[1], formats: Record<string,string> = { H:"HH", I:"hh", k:"H", l:"h", M:"mm", S:"ss", L:"SSS", N:"SSSSSSSSS", p:"a", z:"Z", Z:"z", B:"MMMM", b:"MMM", h:"MMM", A:"EEEE", a:"EEE", C:"yy", Y:"yyyy", y:"yy", j:"DDD", m:"MM", d:"dd", e:"d", R:"HH:mm", T:"HH:mm:ss", r:"hh:mm:ss a", D:"MM/dd/yy", F:"yyyy-MM-dd", c:"EEE MMM dd HH:mm:ss z yyyy" };
        result = token === "Q" ? String(number) : token === "s" ? String(Math.floor(number / 1000)) : token === "C" ? String(Math.floor(Number(formatDate("yyyy", number, { ...ctx, locale:"en-US" })) / 100)).padStart(2,"0") : formatDate(formats[token] ?? token, number, ctx);
        if (token === "p") result = result.toLocaleLowerCase(locale);
      } else switch (type.toLowerCase()) {
        case "d": numeric = true; result = new Intl.NumberFormat(locale,{useGrouping:flags.includes(","),maximumFractionDigits:0}).format(Math.trunc(absolute)); break;
        case "f": numeric = true; result = new Intl.NumberFormat(locale,{useGrouping:flags.includes(","),minimumFractionDigits:digits,maximumFractionDigits:digits}).format(absolute); if (flags.includes("#") && digits === 0) result += "."; break;
        case "e": numeric = true; result = absolute.toExponential(digits).replace(/e([+-])(\d)$/, "e$10$2"); break;
        case "g": { numeric = true; const significant = Math.max(1,digits), exponent = absolute ? Math.floor(Math.log10(absolute)) : 0; result = exponent < -4 || exponent >= significant ? absolute.toExponential(significant-1).replace(/e([+-])(\d)$/, "e$10$2") : absolute.toFixed(Math.max(0, significant-exponent-1)); break; }
        case "a": {
          numeric = true;
          if (absolute === 0) result = "0x0.0p0";
          else if (!Number.isFinite(absolute)) result = String(absolute);
          else { const data = new DataView(new ArrayBuffer(8)); data.setFloat64(0,absolute); const bits = data.getBigUint64(0), rawExponent=Number((bits >> 52n) & 2047n), fraction=(bits & ((1n << 52n)-1n)).toString(16).padStart(13,"0").replace(/0+$/, "") || "0"; result = `0x${rawExponent ? 1 : 0}.${precision ? fraction.slice(0,digits).padEnd(digits,"0") : fraction}p${rawExponent ? rawExponent-1023 : -1022}`; } break;
        }
        case "x": case "o": numeric = true; result = Math.trunc(number < 0 ? number >>> 0 : number).toString(type.toLowerCase() === "x" ? 16 : 8); if (flags.includes("#")) result = (type.toLowerCase() === "x" ? "0x" : "0") + result; break;
        case "h": { let hash = typeof value === "number" ? Math.trunc(value) : 0; if (typeof value === "string") for (let i=0;i<value.length;i++) hash=(31*hash+value.charCodeAt(i))|0; result=(hash>>>0).toString(16); break; }
        case "b": result = String(Boolean(value)); break;
        case "c": result = typeof value === "number" ? String.fromCodePoint(value) : String(value).charAt(0); break;
        default: result = String(value); if (precision) result = result.slice(0, Number(precision));
      }
      if (numeric && !/[xo]/i.test(type)) {
        if (number < 0) result = flags.includes("(") ? `(${result})` : "-" + result;
        else if (flags.includes("+")) result = "+" + result;
        else if (flags.includes(" ")) result = " " + result;
      }
      if (type[0] === type[0].toUpperCase()) result = result.toLocaleUpperCase(locale);
      const count = Number(width ?? 0);
      if (flags.includes("-")) return result.padEnd(count, " ");
      if (flags.includes("0") && numeric && result.length < count) {
        const match = result.match(/^([-+ (]?)(0[xX])?(.*?)(\)?)$/)!;
        return match[1] + (match[2] ?? "") + match[3].padStart(count-match[1].length-(match[2]?.length ?? 0)-match[4].length,"0") + match[4];
      }
      return result.padStart(count, " ");
    });
}

/** TimeText supports ICU time tokens plus WFF tens/units suffixes. */
export function formatTime(pattern: string, timestamp: number, ctx: ExpressionContext, hourFormat = "SYNC_TO_DEVICE"): string {
  const use24 = hourFormat === "24" || (hourFormat === "SYNC_TO_DEVICE" && Boolean(ctx.sources.IS_24_HOUR_MODE));
  const markers: string[] = [];
  const converted = pattern.replace(/'[^']*(?:''[^']*)*'|[hH]+(?:_10|_1)?|[ms]+(?:_10|_1)?/g, token => {
    if (token.startsWith("'")) return token;
    const digit = token.match(/^(h+|H+|m+|s+)_(10|1)$/);
    const normalized = token.replace(/[hH]/g, use24 ? "H" : "h");
    if (!digit) return normalized;
    const value = Number(formatDate(normalized.split("_")[0], timestamp, { ...ctx, locale: "en-US" }));
    markers.push(String(digit[2] === "10" ? Math.floor(value / 10) : value % 10));
    return "'~" + (markers.length - 1) + "~'";
  });
  return formatDate(converted, timestamp, ctx).replace(/~(\d+)~/g, (_, i) => markers[Number(i)]);
}
