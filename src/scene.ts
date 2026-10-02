import { applyAttributes, boolean, number, resolveValue } from "./attributes.js";
import { localizedDataSources, evaluateExpression, type ExpressionContext } from "./expressions.js";
import type { Transition } from "./animation.js";

export function prepareScene(scene: Element, base: ExpressionContext, ambient: boolean, elapsed: number, states: Map<string, Transition>, ambientTransitionDurationMs = 1000): WeakMap<Element, ExpressionContext> {
  const contexts = new WeakMap<Element, ExpressionContext>();
  const pending = new Set<Element>(), done = new Set<Element>();
  const providers = new Map<string, Element>();
  for (const ref of scene.querySelectorAll("Reference")) {
    const name = ref.getAttribute("name");
    if (!name) continue;
    if (providers.has(name)) throw new Error(`Duplicate Reference: ${name}`);
    providers.set(name, ref);
  }
  const keys = new WeakMap<Element, string>();
  function assign(el: Element, key: string) { keys.set(el, key); el.setAttribute("data-wff-key", key); Array.from(el.children).forEach((c, i) => assign(c, `${key}/${i}`)); }
  assign(scene, "scene");
  function context(sources: Record<string, string | number>, rest: ExpressionContext): ExpressionContext {
    return { ...rest, sources: new Proxy(sources, { get(target, prop: string) {
      if (!prop.startsWith("REFERENCE.")) return target[prop];
      const ref = providers.get(prop.slice(10));
      if (!ref) return 0;
      const parent = ref.parentElement!;
      const fallback = resolveValue(ref.getAttribute("defaultValue") ?? "0", rest);
      if (!visible(parent)) return Number.isFinite(Number(fallback)) ? Number(fallback) : fallback;
      prepare(parent);
      if (number(parent, "alpha", 255) <= 0) return Number.isFinite(Number(fallback)) ? Number(fallback) : fallback;
      const value = parent.getAttribute(ref.getAttribute("source") ?? "") ?? String(fallback);
      return Number.isFinite(Number(value)) ? Number(value) : value;
    } }) };
  }
  const branchCache = new WeakMap<Element, Element | null>();
  function branch(el: Element): Element | null {
    if (branchCache.has(el)) return branchCache.get(el)!;
    prepare(el);
    const ctx = contexts.get(el)!;
    let selected: Element | null = null;
    if (el.tagName === "Condition") {
      for (const expression of el.querySelector(":scope > Expressions")?.children ?? []) {
        ctx.sources[expression.getAttribute("name") ?? ""] = evaluateExpression(expression.getAttribute("expression") ?? expression.textContent?.trim() ?? "0", ctx);
      }
      selected = Array.from(el.children).find(c => c.tagName === "Compare" && Boolean(evaluateExpression(c.getAttribute("expression") ?? "0", ctx))) ?? el.querySelector(":scope > Default");
    } else {
      const value = ctx.sources[`CONFIGURATION.${el.getAttribute("id")}`];
      const id = el.tagName === "BooleanConfiguration" ? value ? "TRUE" : "FALSE" : String(value);
      selected = Array.from(el.children).find(c => c.getAttribute("id") === id) ?? null;
    }
    branchCache.set(el, selected);
    return selected;
  }
  function visible(el: Element): boolean {
    if (el === scene) return true;
    if (el.tagName === "ComplicationSlot" || el.tagName === "Complication") return false;
    const parent = el.parentElement;
    if (!parent || !scene.contains(parent)) return false;
    if (!visible(parent)) return false;
    if (["Compare", "Default", "ListOption", "BooleanOption"].includes(el.tagName) && branch(parent) !== el) return false;
    prepare(parent);
    return number(parent, "alpha", 255) > 0;
  }
  function prepare(el: Element): void {
    if (done.has(el)) return;
    if (pending.has(el)) throw new Error(`Cyclic Reference dependency at ${keys.get(el)}`);
    pending.add(el);
    const parent = el.parentElement;
    if (parent && scene.contains(parent)) prepare(parent);
    const inherited = parent ? contexts.get(parent) ?? base : base;
    const localization = el.querySelector(":scope > Localization");
    const locales = localization?.getAttribute("locales")?.split(/\s+/).map(l => l.replace(/_/g, "-"));
    const zone = localization?.getAttribute("timeZone");
    const calendar = localization?.getAttribute("calendar")?.toLowerCase().replace(/_/g, "-").replace("gregorian", "gregory").replace("ethiopic-amete-alem", "ethioaa");
    const ctx = context({ ...inherited.sources }, { ...inherited,
      locale: locales?.find(l => l === inherited.locale) ?? locales?.[0] ?? inherited.locale,
      timeZone: zone && zone !== "SYNC_TO_DEVICE" ? zone : inherited.timeZone,
      calendar: calendar ?? inherited.calendar,
    });
    if (localization) {
      const localized = localizedDataSources(new Date(Number(inherited.sources.UTC_TIMESTAMP)), {}, Boolean(inherited.sources.IS_24_HOUR_MODE), ctx.locale, ctx.timeZone, ctx.calendar);
      for (const [name, value] of Object.entries(localized.sources)) ctx.sources[name] = value;
    }
    contexts.set(el, ctx);
    if (!["Transform", "Variant", "Gyro", "Reference", "Localization", "Parameter"].includes(el.tagName)) applyAttributes(el, ctx, ambient, elapsed, states, keys.get(el)!, ambientTransitionDurationMs);
    pending.delete(el); done.add(el);
  }
  function walk(el: Element): void {
    if (!visible(el) && el !== scene) return;
    prepare(el);
    if (["Condition", "ListConfiguration", "BooleanConfiguration"].includes(el.tagName)) {
      const selected = branch(el);
      for (const child of Array.from(el.children)) if (child !== selected) child.remove();
      if (selected) for (const child of selected.children) walk(child);
    } else if (!el.tagName.startsWith("Complication")) for (const child of el.children) walk(child);
  }
  walk(scene);
  return contexts;
}
