/** Calendar boundaries are measured in wall dates, independent of host DST. */
interface CalendarMetrics { year: number; month: number; day: number; dayOfYear: number; daysInMonth: number; yearStart: number; nextYearStart: number; monthStart: number }
const metricsCache = new Map<string, CalendarMetrics>();
export function calendarMetrics(wallDate: number, calendar: string): CalendarMetrics {
  const key = `${calendar}:${wallDate}`;
  const cached = metricsCache.get(key); if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", calendar, year: "numeric", month: "numeric", day: "numeric", era: "short" });
  function fields(date: number) {
    const parts = formatter.formatToParts(new Date(date));
    const value = (type: string) => parts.find(p => p.type === type)?.value ?? "";
    const monthText = value("month"), yearText = value("relatedYear") || value("year");
    const hebrew = ["Tishri", "Heshvan", "Kislev", "Tevet", "Shevat", "Adar I", "Adar", "Nisan", "Iyar", "Sivan", "Tamuz", "Av", "Elul"];
    const month = calendar === "hebrew" ? hebrew.indexOf(monthText) + 1 : parseInt(monthText);
    return { year: Number(yearText), yearKey: `${value("era")}:${yearText}`, month, monthText, day: Number(value("day")) };
  }
  const today = fields(wallDate), dayMs = 86400000;
  let yearStart = wallDate, nextYearStart = wallDate + dayMs, monthStart = wallDate, monthEnd = wallDate + dayMs;
  for (let n = 0; n < 400 && fields(yearStart - dayMs).yearKey === today.yearKey; n++) yearStart -= dayMs;
  for (let n = 0; n < 400 && fields(nextYearStart).yearKey === today.yearKey; n++) nextYearStart += dayMs;
  const sameMonth = (date: number) => { const f = fields(date); return f.yearKey === today.yearKey && f.monthText === today.monthText; };
  for (let n = 0; n < 35 && sameMonth(monthStart - dayMs); n++) monthStart -= dayMs;
  for (let n = 0; n < 35 && sameMonth(monthEnd); n++) monthEnd += dayMs;
  const result = { year: today.year, month: today.month, day: today.day, dayOfYear: 1 + (wallDate - yearStart) / dayMs, daysInMonth: (monthEnd - monthStart) / dayMs, yearStart, nextYearStart, monthStart };
  if (metricsCache.size >= 256) metricsCache.clear(); metricsCache.set(key, result);
  return result;
}
