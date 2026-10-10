import { describe, expect, it } from 'vitest';
import { prepareScene } from './scene.js';
import { renderCondition } from './conditions.js';
import { element } from '../test/helpers/elements.js';
import { applyAttributes } from './attributes.js';

describe('named WFF conditions', () => {
  it('preserves default opacity outside ambient mode', () => {
    for (const ambient of [false, true]) {
      const group = element('Group', {}, [element('Variant', { mode: 'AMBIENT', target: 'alpha', value: '0' })]);
      applyAttributes(group.asElement(), { sources: {} }, ambient, 0, new Map(), 'group', 0);
      expect(group.getAttribute('alpha')).toBe(ambient ? '0' : '255');
    }
  });
  it.each([0, 1])('selects the correct branch for named result %i', async value => {
    const make = () => {
      const compare = element('Compare', { expression: 'moving' }, [element('Group', { name: 'flight' })]);
      const fallback = element('Default', {}, [element('Group', { name: 'rest' })]);
      const condition = element('Condition', {}, [
        element('Expressions', {}, [element('Expression', { name: 'moving', expression: '[SECOND]>=58' })]),
        compare, fallback,
      ]);
      return { condition, compare, fallback };
    };
    const ctx = { sources: { SECOND: value ? 59 : 30 } };
    const sceneCase = make();
    prepareScene(element('Scene', {}, [sceneCase.condition]).asElement(), ctx, false, 0, new Map());
    expect(sceneCase.condition.children).toEqual([value ? sceneCase.compare : sceneCase.fallback]);
    const fallbackCase = make();
    const rendered: string[] = [];
    await renderCondition({} as CanvasRenderingContext2D, fallbackCase.condition.asElement(), async (_canvas, child) => {
      rendered.push(child.getAttribute('name') ?? '');
    }, { expressionCtx: ctx, ambient: false, assets: new Map(), elapsedMs: 0 });
    expect(rendered).toEqual([value ? 'flight' : 'rest']);
  });
});
