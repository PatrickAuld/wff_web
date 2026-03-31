/**
 * WFF Variant support
 *
 * Variant elements allow attribute overrides based on render mode.
 * Currently supports mode="AMBIENT" which overrides the parent element's
 * target attribute when ambient rendering is active.
 */

/**
 * Apply Variant children to their parent element's attributes.
 * This mutates the element's attributes in place, which is safe since the
 * DOM is only used for a single render pass.
 */
export function applyVariants(el: Element, ambient: boolean): void {
  for (const child of el.children) {
    if (child.tagName === "Variant") {
      const mode = child.getAttribute("mode");
      if (mode === "AMBIENT" && ambient) {
        const target = child.getAttribute("target");
        const value = child.getAttribute("value");
        if (target !== null && value !== null) {
          el.setAttribute(target, value);
        }
      }
    }
  }
}
