import { describe, it, expect } from 'vitest';
import { mindmapRenderer, isMindmapJson } from '../src/renderers/mindmap';

describe('MindmapRenderer', () => {
  describe('mindmapRenderer definition', () => {
    it('should have correct name and type', () => {
      expect(mindmapRenderer.name).toBe('mindmap');
      expect(mindmapRenderer.type).toBe('mindmap');
    });

    it('should have correct priority', () => {
      expect(mindmapRenderer.priority).toBe(16);
    });

    it('should not support streaming', () => {
      expect(mindmapRenderer.streaming).toBe(false);
    });

    it('should have description', () => {
      expect(mindmapRenderer.description).toBe('思维导图渲染器 (G6)');
    });
  });

  describe('parser', () => {
    it('should parse JSON data with root', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '测试',
          children: [{ id: 'child1', label: '子节点1' }],
        },
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root.label).toBe('测试');
      expect(result?.root.children).toHaveLength(1);
    });

    it('should wrap node data as MindmapData', () => {
      const raw = JSON.stringify({
        id: 'node1',
        label: '根节点',
        children: [],
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root.label).toBe('根节点');
    });

    it('should parse with direction option', () => {
      const raw = JSON.stringify({
        root: { id: 'root', label: '测试' },
        direction: 'TB',
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.direction).toBe('TB');
    });

    it('should parse with theme option', () => {
      const raw = JSON.stringify({
        root: { id: 'root', label: '测试' },
        theme: 'colorful',
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.theme).toBe('colorful');
    });

    it('should parse text format (indented list)', () => {
      const raw = `根节点
  子节点1
    孙节点1
  子节点2`;
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root.label).toBe('根节点');
      expect(result?.root.children).toHaveLength(2);
      expect(result?.root.children?.[0]?.label).toBe('子节点1');
      expect(result?.root.children?.[0]?.children).toHaveLength(1);
      expect(result?.root.children?.[1]?.label).toBe('子节点2');
    });

    it('should handle empty text', () => {
      const result = mindmapRenderer.parser?.('');

      expect(result?.root.label).toBe('空');
    });

    it('should parse custom styles', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '测试',
          style: {
            fill: '#ff0000',
            fontSize: 16,
          },
        },
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root.style?.fill).toBe('#ff0000');
      expect(result?.root.style?.fontSize).toBe(16);
    });
  });

  describe('detector (isMindmapJson)', () => {
    it('should detect __type: mindmap', () => {
      const raw = JSON.stringify({
        __type: 'mindmap',
        root: { id: 'root', label: 'test' },
      });
      expect(isMindmapJson(raw)).toBe(true);
    });

    it('should detect root with label', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '测试',
        },
      });
      expect(isMindmapJson(raw)).toBe(true);
    });

    it('should detect nested structure', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '根',
          children: [{ id: 'c1', label: '子节点' }],
        },
      });
      expect(isMindmapJson(raw)).toBe(true);
    });

    it('should not detect plain text', () => {
      expect(isMindmapJson('Hello world')).toBe(false);
    });

    it('should not detect invalid JSON', () => {
      expect(isMindmapJson('{ invalid json }')).toBe(false);
    });

    it('should not detect JSON without root.label', () => {
      const raw = JSON.stringify({
        root: { id: 'root' },
      });
      expect(isMindmapJson(raw)).toBe(false);
    });

    it('should not detect array JSON', () => {
      const raw = JSON.stringify([1, 2, 3]);
      expect(isMindmapJson(raw)).toBe(false);
    });

    it('should not detect chart JSON', () => {
      const raw = JSON.stringify({
        chartType: 'line',
        series: [],
      });
      expect(isMindmapJson(raw)).toBe(false);
    });
  });

  describe('loader', () => {
    it('should have a loader function', () => {
      expect(mindmapRenderer.loader).toBeDefined();
      expect(typeof mindmapRenderer.loader).toBe('function');
    });
  });
});

describe('Mindmap Data Structures', () => {
  describe('MindmapNode', () => {
    it('should support basic node structure', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '根节点',
        },
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root).toHaveProperty('id');
      expect(result?.root).toHaveProperty('label');
    });

    it('should support collapsed property', () => {
      const raw = JSON.stringify({
        root: {
          id: 'root',
          label: '根节点',
          collapsed: true,
        },
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.root.collapsed).toBe(true);
    });
  });

  describe('MindmapData options', () => {
    it('should support all direction options', () => {
      const directions = ['H', 'V', 'LR', 'RL', 'TB', 'BT'];

      directions.forEach((direction) => {
        const raw = JSON.stringify({
          root: { id: 'root', label: 'test' },
          direction,
        });
        const result = mindmapRenderer.parser?.(raw);
        expect(result?.direction).toBe(direction);
      });
    });

    it('should support all theme options', () => {
      const themes = ['default', 'colorful', 'primary', 'dark'];

      themes.forEach((theme) => {
        const raw = JSON.stringify({
          root: { id: 'root', label: 'test' },
          theme,
        });
        const result = mindmapRenderer.parser?.(raw);
        expect(result?.theme).toBe(theme);
      });
    });

    it('should support interactive option', () => {
      const raw = JSON.stringify({
        root: { id: 'root', label: 'test' },
        interactive: false,
      });
      const result = mindmapRenderer.parser?.(raw);

      expect(result?.interactive).toBe(false);
    });
  });
});

describe('Text to Mindmap Parser', () => {
  it('should parse single line', () => {
    const result = mindmapRenderer.parser?.('单行文本');

    expect(result?.root.label).toBe('单行文本');
    expect(result?.root.children).toEqual([]);
  });

  it('should parse multiple levels', () => {
    const raw = `根
  一级-1
    二级-1
    二级-2
  一级-2`;
    const result = mindmapRenderer.parser?.(raw);

    expect(result?.root.label).toBe('根');
    expect(result?.root.children).toHaveLength(2);
    expect(result?.root.children?.[0]?.children).toHaveLength(2);
    expect(result?.root.children?.[1]?.children).toHaveLength(0);
  });

  it('should handle tabs as indentation', () => {
    const raw = `根\n\t子节点`;
    const result = mindmapRenderer.parser?.(raw);

    expect(result?.root.label).toBe('根');
    expect(result?.root.children).toHaveLength(1);
    expect(result?.root.children?.[0]?.label).toBe('子节点');
  });

  it('should trim whitespace from labels', () => {
    const raw = `  根节点  \n    子节点  `;
    const result = mindmapRenderer.parser?.(raw);

    expect(result?.root.label).toBe('根节点');
    expect(result?.root.children?.[0]?.label).toBe('子节点');
  });

  it('should generate unique ids', () => {
    const raw = `根\n  子1\n  子2\n  子3`;
    const result = mindmapRenderer.parser?.(raw);

    const ids = [
      result?.root.id,
      result?.root.children?.[0]?.id,
      result?.root.children?.[1]?.id,
      result?.root.children?.[2]?.id,
    ];

    // All ids should be unique
    expect(new Set(ids).size).toBe(ids.length);
  });
});
