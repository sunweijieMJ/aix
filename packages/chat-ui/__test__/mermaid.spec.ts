import { describe, it, expect } from 'vitest';
import { mermaidRenderer } from '../src/renderers/mermaid';

describe('MermaidRenderer', () => {
  describe('mermaidRenderer definition', () => {
    it('should have correct name and type', () => {
      expect(mermaidRenderer.name).toBe('mermaid');
      expect(mermaidRenderer.type).toBe('mermaid');
    });

    it('should have correct priority', () => {
      expect(mermaidRenderer.priority).toBe(15);
    });

    it('should not support streaming', () => {
      expect(mermaidRenderer.streaming).toBe(false);
    });
  });

  describe('parser', () => {
    it('should parse mermaid code block', () => {
      const raw = '```mermaid\ngraph TD\n  A-->B\n```';
      const result = mermaidRenderer.parser?.(raw);

      expect(result).toEqual({ code: 'graph TD\n  A-->B\n' });
    });

    it('should parse raw mermaid code without fences', () => {
      const raw = 'graph TD\n  A-->B';
      const result = mermaidRenderer.parser?.(raw);

      expect(result).toEqual({ code: 'graph TD\n  A-->B' });
    });

    it('should handle flowchart syntax', () => {
      const raw = 'flowchart LR\n  A-->B-->C';
      const result = mermaidRenderer.parser?.(raw);

      expect(result).toEqual({ code: 'flowchart LR\n  A-->B-->C' });
    });

    it('should handle sequence diagram', () => {
      const raw = 'sequenceDiagram\n  A->>B: Hello';
      const result = mermaidRenderer.parser?.(raw);

      expect(result).toEqual({ code: 'sequenceDiagram\n  A->>B: Hello' });
    });
  });

  describe('detector', () => {
    it('should detect mermaid code block', () => {
      const raw = '```mermaid\ngraph TD\n  A-->B\n```';
      expect(mermaidRenderer.detector?.(raw)).toBe(true);
    });

    it('should detect graph syntax', () => {
      expect(mermaidRenderer.detector?.('graph TD\n  A-->B')).toBe(true);
      expect(mermaidRenderer.detector?.('graph LR\n  A-->B')).toBe(true);
    });

    it('should detect flowchart syntax', () => {
      expect(mermaidRenderer.detector?.('flowchart TD\n  A-->B')).toBe(true);
      expect(mermaidRenderer.detector?.('flowchart LR\n  A-->B')).toBe(true);
    });

    it('should detect sequenceDiagram', () => {
      expect(
        mermaidRenderer.detector?.('sequenceDiagram\n  A->>B: Hello'),
      ).toBe(true);
    });

    it('should detect classDiagram', () => {
      expect(mermaidRenderer.detector?.('classDiagram\n  class Animal')).toBe(
        true,
      );
    });

    it('should detect stateDiagram', () => {
      expect(mermaidRenderer.detector?.('stateDiagram\n  [*] --> A')).toBe(
        true,
      );
    });

    it('should detect erDiagram', () => {
      expect(mermaidRenderer.detector?.('erDiagram\n  A ||--o{ B')).toBe(true);
    });

    it('should detect gantt', () => {
      expect(mermaidRenderer.detector?.('gantt\n  title A Gantt')).toBe(true);
    });

    it('should detect pie', () => {
      expect(mermaidRenderer.detector?.('pie title Test\n  "A": 50')).toBe(
        true,
      );
    });

    it('should detect journey', () => {
      expect(mermaidRenderer.detector?.('journey\n  title User Journey')).toBe(
        true,
      );
    });

    it('should detect gitGraph', () => {
      expect(mermaidRenderer.detector?.('gitGraph\n  commit')).toBe(true);
    });

    it('should not detect plain text', () => {
      expect(mermaidRenderer.detector?.('Hello world')).toBe(false);
      expect(mermaidRenderer.detector?.('This is not a graph')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(mermaidRenderer.detector?.('GRAPH TD\n  A-->B')).toBe(true);
      expect(mermaidRenderer.detector?.('FlowChart LR\n  A-->B')).toBe(true);
    });
  });

  describe('loader', () => {
    it('should have a loader function', () => {
      expect(mermaidRenderer.loader).toBeDefined();
      expect(typeof mermaidRenderer.loader).toBe('function');
    });
  });
});

describe('Mermaid Utils', () => {
  describe('parseMermaidData', () => {
    it('should parse string data', async () => {
      const { parseMermaidData } = await import('../src/utils/parseData');

      const result = parseMermaidData('graph TD\n  A-->B');
      expect(result).toBe('graph TD\n  A-->B');
    });

    it('should parse object data', async () => {
      const { parseMermaidData } = await import('../src/utils/parseData');

      const result = parseMermaidData({ code: 'graph TD\n  A-->B' });
      expect(result).toBe('graph TD\n  A-->B');
    });

    it('should handle empty data', async () => {
      const { parseMermaidData } = await import('../src/utils/parseData');

      const result = parseMermaidData('');
      expect(result).toBe('');
    });
  });
});

describe('Mermaid Content Detection', () => {
  it('should detect mermaid in content', async () => {
    const { isMermaid } = await import('../src/utils/detect');

    expect(isMermaid('graph TD\n  A-->B')).toBe(true);
    expect(isMermaid('flowchart LR\n  A-->B')).toBe(true);
    expect(isMermaid('sequenceDiagram\n  A->>B: Test')).toBe(true);
    expect(isMermaid('classDiagram\n  class A')).toBe(true);
    expect(isMermaid('stateDiagram\n  [*] --> A')).toBe(true);
    expect(isMermaid('erDiagram\n  A ||--o{ B')).toBe(true);
    expect(isMermaid('gantt\n  title Test')).toBe(true);
    expect(isMermaid('pie title Test\n  "A": 50')).toBe(true);
    expect(isMermaid('journey\n  title Test')).toBe(true);
    expect(isMermaid('gitGraph\n  commit')).toBe(true);
  });

  it('should not detect non-mermaid content', async () => {
    const { isMermaid } = await import('../src/utils/detect');

    expect(isMermaid('Hello world')).toBe(false);
    expect(isMermaid('# Title\n\nParagraph')).toBe(false);
    expect(isMermaid('```js\ncode\n```')).toBe(false);
  });
});
