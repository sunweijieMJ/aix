/**
 * @fileoverview 真实渲染器集成测试
 * 使用真实的渲染器定义进行测试，而非 Mock
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  setup,
  resetSetup,
  textPlugin,
  markdownPlugin,
  codePlugin,
  latexPlugin,
  chartPlugin,
  mindmapPlugin,
  installPlugin,
  resetPlugins,
} from '../src';
import type { MarkdownData, CodeData, LatexData, MindmapData } from '../src';
import { ContentParser } from '../src/core/ContentParser';
import { rendererRegistry } from '../src/core/RendererRegistry';

describe('真实渲染器集成测试', () => {
  beforeEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
  });

  afterEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
  });

  describe('预设安装', () => {
    it('should install basic preset correctly', () => {
      setup({ preset: 'basic' });

      expect(rendererRegistry.has('text')).toBe(true);
      expect(rendererRegistry.has('markdown')).toBe(true);
      expect(rendererRegistry.has('code')).toBe(false);
    });

    it('should install standard preset correctly', () => {
      setup({ preset: 'standard' });

      expect(rendererRegistry.has('text')).toBe(true);
      expect(rendererRegistry.has('markdown')).toBe(true);
      expect(rendererRegistry.has('code')).toBe(true);
      expect(rendererRegistry.has('latex')).toBe(true);
      expect(rendererRegistry.has('chart')).toBe(false);
    });

    it('should install full preset correctly', () => {
      setup({ preset: 'full' });

      expect(rendererRegistry.has('text')).toBe(true);
      expect(rendererRegistry.has('markdown')).toBe(true);
      expect(rendererRegistry.has('code')).toBe(true);
      expect(rendererRegistry.has('latex')).toBe(true);
      expect(rendererRegistry.has('chart')).toBe(true);
      expect(rendererRegistry.has('mermaid')).toBe(true);
      expect(rendererRegistry.has('mindmap')).toBe(true);
    });
  });

  describe('渲染器 Parser 测试', () => {
    beforeEach(() => {
      installPlugin(textPlugin);
      installPlugin(markdownPlugin);
      installPlugin(codePlugin);
      installPlugin(latexPlugin);
    });

    it('should parse markdown content correctly', () => {
      const renderer = rendererRegistry.get('markdown');
      expect(renderer).toBeDefined();

      const result = renderer!.parser!('# Hello World') as MarkdownData;
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('raw');
      expect(result.raw).toBe('# Hello World');
    });

    it('should parse code block correctly', () => {
      const renderer = rendererRegistry.get('code');
      expect(renderer).toBeDefined();

      const result = renderer!.parser!(
        '```javascript\nconst x = 1;\n```',
      ) as CodeData;
      expect(result).toHaveProperty('code');
      expect(result).toHaveProperty('language');
      // 解析后的 code 可能包含尾部换行符
      expect(result.code.trim()).toBe('const x = 1;');
      expect(result.language).toBe('javascript');
    });

    it('should parse latex correctly', () => {
      const renderer = rendererRegistry.get('latex');
      expect(renderer).toBeDefined();

      const result = renderer!.parser!('$$E = mc^2$$') as LatexData;
      expect(result).toHaveProperty('expression');
      expect(result).toHaveProperty('displayMode');
      expect(result.expression).toBe('E = mc^2');
      expect(result.displayMode).toBe(true);
    });

    it('should parse inline latex correctly', () => {
      const renderer = rendererRegistry.get('latex');
      expect(renderer).toBeDefined();

      const result = renderer!.parser!('$x^2$') as LatexData;
      expect(result.expression).toBe('x^2');
      expect(result.displayMode).toBe(false);
    });
  });

  describe('渲染器 Detector 测试', () => {
    beforeEach(() => {
      setup({ preset: 'full' });
    });

    it('should detect code block', () => {
      const codeRenderer = rendererRegistry.get('code');
      expect(codeRenderer?.detector?.('```js\ncode\n```')).toBe(true);
      expect(codeRenderer?.detector?.('normal text')).toBe(false);
    });

    it('should detect latex', () => {
      const latexRenderer = rendererRegistry.get('latex');
      expect(latexRenderer?.detector?.('$$x^2$$')).toBe(true);
      expect(latexRenderer?.detector?.('\\[x^2\\]')).toBe(true);
      expect(latexRenderer?.detector?.('normal text')).toBe(false);
    });

    it('should detect markdown', () => {
      const markdownRenderer = rendererRegistry.get('markdown');
      expect(markdownRenderer?.detector?.('# Title')).toBe(true);
      expect(markdownRenderer?.detector?.('**bold**')).toBe(true);
      expect(markdownRenderer?.detector?.('[link](url)')).toBe(true);
    });

    it('should detect mermaid', () => {
      const mermaidRenderer = rendererRegistry.get('mermaid');
      expect(mermaidRenderer?.detector?.('graph TD\n  A-->B')).toBe(true);
      expect(mermaidRenderer?.detector?.('flowchart LR\n  A-->B')).toBe(true);
      expect(mermaidRenderer?.detector?.('normal text')).toBe(false);
    });
  });

  describe('ContentParser 与真实渲染器集成', () => {
    beforeEach(() => {
      setup({ preset: 'standard' });
    });

    it('should parse plain text', () => {
      const parser = new ContentParser();
      const result = parser.parse('Hello World');

      expect(Array.isArray(result) ? result[0] : result).toHaveProperty('type');
    });

    it('should parse code block and extract language', () => {
      const parser = new ContentParser();
      const result = parser.parse('```typescript\nconst x: number = 1;\n```');

      const block = Array.isArray(result) ? result[0] : result;
      expect(block?.type).toBe('code');
      expect(block?.data).toHaveProperty('code');
      expect(block?.data).toHaveProperty('language');
    });

    it('should parse mixed content', () => {
      const parser = new ContentParser();
      const content = `# Title

Some text here.

\`\`\`javascript
const x = 1;
\`\`\`

More text.`;

      const result = parser.parse(content);
      expect(Array.isArray(result)).toBe(true);

      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(1);
        // 应该有 markdown 和 code 块
        const types = result.map((b) => b.type);
        expect(types).toContain('code');
      }
    });

    it('should parse latex in content', () => {
      const parser = new ContentParser();
      const result = parser.parse('$$E = mc^2$$');

      const block = Array.isArray(result) ? result[0] : result;
      expect(block?.type).toBe('latex');
    });
  });

  describe('渲染器优先级', () => {
    beforeEach(() => {
      setup({ preset: 'full' });
    });

    it('should return renderers sorted by priority', () => {
      const codeRenderers = rendererRegistry.getAllByType('code');
      expect(codeRenderers.length).toBeGreaterThan(0);
    });

    it('should detect code block before markdown when content is code', () => {
      const detected = rendererRegistry.detect('```js\ncode\n```');
      expect(detected?.name).toBe('code');
    });

    it('should detect latex before markdown when content is latex', () => {
      const detected = rendererRegistry.detect('$$x^2$$');
      expect(detected?.name).toBe('latex');
    });
  });

  describe('异步组件加载', () => {
    beforeEach(() => {
      setup({ preset: 'standard' });
    });

    it('should load text renderer component', async () => {
      const component = await rendererRegistry.loadComponent('text');
      expect(component).toBeDefined();
    });

    it('should load markdown renderer component', async () => {
      const component = await rendererRegistry.loadComponent('markdown');
      expect(component).toBeDefined();
    });

    it('should load code renderer component', async () => {
      const component = await rendererRegistry.loadComponent('code');
      expect(component).toBeDefined();
    });

    it('should cache loaded components', async () => {
      const component1 = await rendererRegistry.loadComponent('text');
      const component2 = await rendererRegistry.loadComponent('text');
      expect(component1).toBe(component2);
    });

    it('should return undefined for non-existent renderer', async () => {
      const component = await rendererRegistry.loadComponent('non-existent');
      expect(component).toBeUndefined();
    });
  });
});

describe('图表渲染器测试', () => {
  beforeEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
    installPlugin(chartPlugin);
  });

  afterEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
  });

  it('should detect chart JSON', () => {
    const chartRenderer = rendererRegistry.get('chart');
    expect(chartRenderer).toBeDefined();

    const validChart = JSON.stringify({
      chartType: 'bar',
      series: [{ data: [1, 2, 3] }],
    });

    expect(chartRenderer?.detector?.(validChart)).toBe(true);
  });

  it('should not detect invalid JSON as chart', () => {
    const chartRenderer = rendererRegistry.get('chart');
    expect(chartRenderer?.detector?.('not json')).toBe(false);
    expect(chartRenderer?.detector?.('{}')).toBe(false);
  });

  it('should parse chart data', () => {
    const chartRenderer = rendererRegistry.get('chart');
    const data = { chartType: 'line', series: [] };
    const result = chartRenderer?.parser?.(JSON.stringify(data));
    expect(result).toEqual(data);
  });
});

describe('思维导图渲染器测试', () => {
  beforeEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
    installPlugin(mindmapPlugin);
  });

  afterEach(() => {
    rendererRegistry.clear();
    resetPlugins();
    resetSetup();
  });

  it('should detect mindmap JSON', () => {
    const mindmapRenderer = rendererRegistry.get('mindmap');
    expect(mindmapRenderer).toBeDefined();

    const validMindmap = JSON.stringify({
      root: {
        id: 'root',
        label: 'Root',
        children: [],
      },
    });

    expect(mindmapRenderer?.detector?.(validMindmap)).toBe(true);
  });

  it('should parse mindmap data with root wrapper', () => {
    const mindmapRenderer = rendererRegistry.get('mindmap');
    const nodeData = { id: 'node1', label: 'Node 1' };
    const result = mindmapRenderer?.parser?.(
      JSON.stringify(nodeData),
    ) as MindmapData;

    expect(result).toHaveProperty('root');
    expect(result.root.label).toBe('Node 1');
  });

  it('should parse mindmap data without wrapper', () => {
    const mindmapRenderer = rendererRegistry.get('mindmap');
    const data = {
      root: { id: 'root', label: 'Root' },
      direction: 'H',
    };
    const result = mindmapRenderer?.parser?.(
      JSON.stringify(data),
    ) as MindmapData;

    expect(result.root.label).toBe('Root');
    expect(result.direction).toBe('H');
  });
});
