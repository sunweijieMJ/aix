import { describe, it, expect } from 'vitest';
import { stripFigmaAttrs } from '../../../src/vite/strip-figma-attrs';

const ELEMENT = 1;
const ATTRIBUTE = 6;
const DIRECTIVE = 7;

describe('stripFigmaAttrs', () => {
  it('removes static data-figma and keeps other attributes', () => {
    const node = {
      type: ELEMENT,
      props: [
        { type: ATTRIBUTE, name: 'class' },
        { type: ATTRIBUTE, name: 'data-figma' },
        { type: ATTRIBUTE, name: 'data-testid' },
      ],
    };
    stripFigmaAttrs()(node);
    expect(node.props.map((p) => p.name)).toEqual(['class', 'data-testid']);
  });

  it('removes :data-figma binding but keeps other bindings', () => {
    const node = {
      type: ELEMENT,
      props: [
        { type: DIRECTIVE, name: 'bind', arg: { type: 4, content: 'data-figma', isStatic: true } },
        { type: DIRECTIVE, name: 'bind', arg: { type: 4, content: 'title', isStatic: true } },
        { type: DIRECTIVE, name: 'on', arg: { type: 4, content: 'click', isStatic: true } },
      ],
    };
    stripFigmaAttrs()(node);
    expect(node.props.map((p) => p.arg.content)).toEqual(['title', 'click']);
  });

  it('keeps dynamic-arg bindings (cannot know the attribute name)', () => {
    const node = {
      type: ELEMENT,
      props: [
        { type: DIRECTIVE, name: 'bind', arg: { type: 4, content: 'attrName', isStatic: false } },
      ],
    };
    stripFigmaAttrs()(node);
    expect(node.props).toHaveLength(1);
  });

  it('supports custom attribute names and ignores non-element nodes', () => {
    const node = { type: ELEMENT, props: [{ type: ATTRIBUTE, name: 'data-design' }] };
    stripFigmaAttrs({ attrs: ['data-design'] })(node);
    expect(node.props).toHaveLength(0);

    const text = { type: 2, content: 'hello' };
    expect(() => stripFigmaAttrs()(text)).not.toThrow();
  });
});
