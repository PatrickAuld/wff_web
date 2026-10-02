export class TestElement {
  textContent = "";
  parentElement: TestElement | null = null;
  children: TestElement[];
  values: Record<string, string>;
  constructor(public tagName: string, attributes: Record<string, string | number> = {}, children: TestElement[] = []) {
    this.values = Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
    this.children = children; for (const child of children) child.parentElement = this;
  }
  get attributes() { return Object.entries(this.values).map(([name, value]) => ({ name, value })); }
  getAttribute(name: string) { return this.values[name] ?? null; }
  setAttribute(name: string, value: string) { this.values[name] = value; }
  hasAttribute(name: string) { return name in this.values; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this); }
  contains(el: TestElement): boolean { return this === el || this.children.some(child => child.contains(el)); }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] ?? null; }
  querySelectorAll(selector: string): TestElement[] {
    if (selector.startsWith(":scope > ")) return this.children.filter(c => c.tagName === selector.slice(9));
    return this.children.flatMap(c => [...(c.tagName === selector ? [c] : []), ...c.querySelectorAll(selector)]);
  }
  asElement(): Element { return this as unknown as Element; }
}
export function element(tag: string, attributes: Record<string, string | number> = {}, children: TestElement[] = []) { return new TestElement(tag, attributes, children); }
