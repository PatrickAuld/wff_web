import { boolean } from "./attributes.js";

export interface ConfigurationOption {
  id: string;
  childSettingIds: string[];
  complicationSlotIds: number[];
}
export interface UserSetting {
  id: string;
  value: string | number | boolean;
  active: boolean;
  options: ConfigurationOption[];
}
export interface ConfigurationState {
  values: Record<string, string | number | boolean>;
  settings: UserSetting[];
  activeComplicationSlotIds: number[];
}
const ids = (value: string | null): string[] => value?.trim().split(/[\s,]+/).filter(Boolean) ?? [];

export function prepareConfigurations(doc: Document, overrides: Record<string, string | number | boolean> = {}, flavorId?: string): ConfigurationState {
  const values: ConfigurationState["values"] = {};
  const settings: UserSetting[] = [];
  const user = doc.querySelector("UserConfigurations");
  const flavors = user?.querySelector(":scope > Flavors");
  const selectedFlavor = flavorId ?? flavors?.getAttribute("defaultFlavor") ?? flavors?.getAttribute("defaultValue");
  const flavor = Array.from(flavors?.children ?? []).find(f => f.getAttribute("id") === selectedFlavor);
  if (flavorId && !flavor) throw new Error(`Unknown flavor: ${flavorId}`);
  const preset: Record<string, string> = {};
  for (const conf of flavor?.querySelectorAll(":scope > Configuration") ?? []) preset[conf.getAttribute("id") ?? ""] = conf.getAttribute("optionId") ?? "";
  for (const child of user?.children ?? []) {
    if (!["BooleanConfiguration", "ColorConfiguration", "ListConfiguration", "PhotosConfiguration"].includes(child.tagName)) continue;
    const id = child.getAttribute("id"); if (!id) continue;
    if (settings.some(s => s.id === id)) throw new Error(`Duplicate setting: ${id}`);
    const selected = overrides[id] ?? preset[id] ?? child.getAttribute("defaultValue");
    const options: ConfigurationOption[] = [];
    if (child.tagName === "BooleanConfiguration") values[id] = boolean(String(selected ?? "TRUE")) ? 1 : 0;
    else if (child.tagName === "ColorConfiguration" || child.tagName === "ListConfiguration") {
      const optionTag = child.tagName === "ColorConfiguration" ? "ColorOption" : "ListOption";
      const entries = Array.from(child.children).filter(c => c.tagName === optionTag);
      const option = entries.find(c => c.getAttribute("id") === String(selected)) ?? (selected == null ? entries[0] : undefined);
      if (!option && entries.length) throw new Error(`Unknown option ${selected} for ${id}`);
      values[id] = option?.getAttribute("id") ?? String(selected ?? "0");
      if (child.tagName === "ColorConfiguration") ids(option?.getAttribute("colors") ?? null).forEach((color, i) => { values[`${id}.${i}`] = color; });
      for (const entry of entries) options.push({
        id: entry.getAttribute("id") ?? "",
        childSettingIds: ids(entry.getAttribute("childSettingIds")),
        complicationSlotIds: ids(entry.getAttribute("complicationSlotIds")).map(slot => {
          if (!/^\d+$/.test(slot) || !Number.isSafeInteger(Number(slot))) throw new Error(`Invalid complication slot ID: ${slot}`);
          return Number(slot);
        }),
      });
    } else values[id] = id;
    settings.push({ id, value: values[id], active: false, options });
  }
  for (const [key, value] of Object.entries(overrides)) if (!(key in values)) values[key] = value;
  const byId = new Map(settings.map(s => [s.id, s]));
  const children = (setting: UserSetting) => Array.from(new Set(setting.options.flatMap(o => o.childSettingIds)));
  const nested = new Set(settings.flatMap(children));
  function validate(setting: UserSetting, path: string[]): void {
    if (path.includes(setting.id)) throw new Error(`Cyclic setting hierarchy: ${[...path, setting.id].join(" -> ")}`);
    if (path.length > 2) throw new Error("Setting hierarchy exceeds Parent -> Child -> Grandchild");
    for (const id of children(setting)) {
      const child = byId.get(id);
      if (!child) throw new Error(`Unknown child setting: ${id}`);
      validate(child, [...path, setting.id]);
    }
  }
  for (const setting of settings) validate(setting, []);
  function activate(setting: UserSetting): void {
    if (setting.active) return;
    setting.active = true;
    const option = setting.options.find(o => o.id === String(setting.value));
    for (const id of option?.childSettingIds ?? []) activate(byId.get(id)!);
  }
  settings.filter(s => !nested.has(s.id)).forEach(activate);
  const linked = new Set(settings.flatMap(s => s.options.flatMap(o => o.complicationSlotIds)));
  const enabled = new Set(settings.filter(s => s.active).flatMap(s => s.options.find(o => o.id === String(s.value))?.complicationSlotIds ?? []));
  const slots = Array.from(doc.querySelectorAll("Scene ComplicationSlot")).map(s => Number(s.getAttribute("slotId"))).filter(id => !linked.has(id) || enabled.has(id));
  return { values, settings, activeComplicationSlotIds: Array.from(new Set(slots)) };
}
