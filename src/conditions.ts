/**
 * WFF Condition element rendering
 *
 * The Condition element selectively renders children based on expression
 * evaluation. It walks Compare branches in order and renders the first
 * truthy one, falling back to Default if none match.
 */

import { evaluateExpression, type ExpressionContext } from "./expressions.js";
import type { RenderContext } from "./shapes.js";

/**
 * Render a Condition element by evaluating its Compare branches.
 *
 * Structure:
 *   <Condition>
 *     <Expressions>
 *       <Expression name="foo" expression="[HOUR_0_23]"/>
 *     </Expressions>
 *     <Compare expression="[foo] < 12">...</Compare>
 *     <Compare expression="[foo] >= 12">...</Compare>
 *     <Default>...</Default>
 *   </Condition>
 */
export async function renderCondition(
  ctx: CanvasRenderingContext2D,
  el: Element,
  renderChild: (ctx: CanvasRenderingContext2D, el: Element, renderCtx: RenderContext) => Promise<void>,
  renderCtx: RenderContext
): Promise<void> {
  // 1. Evaluate named expressions from the Expressions container
  const namedResults: Record<string, number | string> = {};
  const expressionsEl = el.querySelector(":scope > Expressions");
  if (expressionsEl) {
    for (const exprEl of expressionsEl.children) {
      if (exprEl.tagName === "Expression") {
        const name = exprEl.getAttribute("name") ?? "";
        const expr = exprEl.getAttribute("expression") ?? "0";
        // Each expression can reference previously computed named results
        const augCtx: ExpressionContext = {
          sources: { ...renderCtx.expressionCtx.sources, ...namedResults },
        };
        namedResults[name] = evaluateExpression(expr, augCtx);
      }
    }
  }

  // 2. Build augmented context with named results available for Compare expressions
  const augCtx: ExpressionContext = {
    sources: { ...renderCtx.expressionCtx.sources, ...namedResults },
  };
  const augRenderCtx: RenderContext = { ...renderCtx, expressionCtx: augCtx };

  // 3. Walk Compare children in order, render first truthy match
  for (const child of el.children) {
    if (child.tagName === "Compare") {
      const expr = child.getAttribute("expression") ?? "0";
      const result = evaluateExpression(expr, augCtx);
      if (result) {
        for (const grandchild of child.children) {
          await renderChild(ctx, grandchild, augRenderCtx);
        }
        return;
      }
    }
  }

  // 4. No Compare matched — render Default if present
  for (const child of el.children) {
    if (child.tagName === "Default") {
      for (const grandchild of child.children) {
        await renderChild(ctx, grandchild, augRenderCtx);
      }
      return;
    }
  }
}
