import { describe, it, expect, beforeEach } from 'vitest';
import { ContentParser } from '../src/core/ContentParser';
import {
  rendererRegistry,
  registerRenderer,
} from '../src/core/RendererRegistry';

describe('ContentParser', () => {
  let parser: ContentParser;

  beforeEach(() => {
    rendererRegistry.clear();
    parser = new ContentParser();

    // 注册基本渲染器
    registerRenderer({
      name: 'text',
      type: 'text',
      component: {},
      priority: 0,
    });
    registerRenderer({
      name: 'markdown',
      type: 'markdown',
      component: {},
      priority: 10,
    });
    registerRenderer({
      name: 'code',
      type: 'code',
      component: {},
      priority: 20,
    });
    registerRenderer({
      name: 'latex',
      type: 'latex',
      component: {},
      priority: 30,
      detector: (content: string) => /^\s*\$\$[\s\S]+\$\$\s*$/.test(content),
    });
  });

  describe('parse', () => {
    it('should parse plain text', () => {
      const result = parser.parse('Hello, world!');

      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0]?.raw).toBe('Hello, world!');
      } else {
        expect(result.raw).toBe('Hello, world!');
      }
    });

    it('should parse empty content', () => {
      const result = parser.parse('');

      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0]?.type).toBe('text');
      } else {
        expect(result.type).toBe('text');
        expect(result.raw).toBe('');
      }
    });

    it('should parse whitespace-only content', () => {
      const result = parser.parse('   \n\t  ');

      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0]?.type).toBe('text');
      } else {
        expect(result.type).toBe('text');
      }
    });

    it('should generate unique IDs for blocks', () => {
      const result1 = parser.parse('Hello');
      const result2 = parser.parse('World');

      const id1 = Array.isArray(result1) ? result1[0]?.id : result1.id;
      const id2 = Array.isArray(result2) ? result2[0]?.id : result2.id;

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
    });
  });

  describe('code block parsing', () => {
    it('should parse single code block', () => {
      const content = '```javascript\nconst x = 1;\n```';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0]?.type).toBe('code');
      } else {
        expect(result.type).toBe('code');
      }
    });

    it('should parse code block with content before and after', () => {
      const content = 'Before\n\n```js\ncode\n```\n\nAfter';
      const result = parser.parse(content);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const codeBlock = result.find((b) => b.type === 'code');
        expect(codeBlock).toBeDefined();
      }
    });

    it('should parse multiple code blocks', () => {
      const content = '```js\ncode1\n```\n\n```python\ncode2\n```';
      const result = parser.parse(content);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const codeBlocks = result.filter((b) => b.type === 'code');
        expect(codeBlocks).toHaveLength(2);
      }
    });

    it('should handle code block without language', () => {
      const content = '```\nplain code\n```';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result[0]?.type).toBe('code');
      } else {
        expect(result.type).toBe('code');
      }
    });

    it('should handle code block with tilde fence', () => {
      const content = '~~~python\nprint("hello")\n~~~';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        const codeBlock = result.find((b) => b.type === 'code');
        expect(codeBlock).toBeDefined();
      } else {
        expect(result.type).toBe('code');
      }
    });

    it('should handle nested code fences', () => {
      const content = '````markdown\n```js\ncode\n```\n````';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        const codeBlocks = result.filter((b) => b.type === 'code');
        expect(codeBlocks).toHaveLength(1);
      } else {
        expect(result.type).toBe('code');
      }
    });

    it('should handle unclosed code block (streaming scenario)', () => {
      const content = '```javascript\nconst x = 1;';
      const result = parser.parse(content);

      // Should still parse as code block
      if (Array.isArray(result)) {
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]?.type).toBe('code');
      } else {
        expect(result.type).toBe('code');
      }
    });
  });

  describe('LaTeX parsing', () => {
    it('should parse standalone LaTeX block', () => {
      const content = '$$\nx^2 + y^2 = z^2\n$$';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result).toHaveLength(1);
        expect(result[0]?.type).toBe('latex');
      } else {
        expect(result.type).toBe('latex');
      }
    });

    it('should parse LaTeX with surrounding content', () => {
      const content = 'Formula:\n\n$$\nE = mc^2\n$$\n\nExplanation';
      const result = parser.parse(content);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        const latexBlock = result.find((b) => b.type === 'latex');
        expect(latexBlock).toBeDefined();
      }
    });

    it('should parse inline LaTeX as text/markdown', () => {
      const content = 'The formula $x^2$ is simple';
      const result = parser.parse(content);

      // Inline LaTeX should not be extracted as separate latex block
      if (Array.isArray(result)) {
        const latexBlock = result.find((b) => b.type === 'latex');
        expect(latexBlock).toBeUndefined();
      } else {
        expect(result.type).not.toBe('latex');
      }
    });
  });

  describe('mixed content parsing', () => {
    it('should parse markdown with code blocks', () => {
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
        expect(result.find((b) => b.type === 'code')).toBeDefined();
      }
    });

    it('should parse complex mixed content', () => {
      const content = `# Math and Code

Here's an equation:

$$
E = mc^2
$$

And some code:

\`\`\`python
print("hello")
\`\`\`

The end.`;

      const result = parser.parse(content);

      expect(Array.isArray(result)).toBe(true);
      if (Array.isArray(result)) {
        expect(result.find((b) => b.type === 'code')).toBeDefined();
        expect(result.find((b) => b.type === 'latex')).toBeDefined();
      }
    });
  });

  describe('parseAs', () => {
    it('should force parse as specific type', () => {
      const result = parser.parseAs('some content', 'code');

      expect(result.type).toBe('code');
      expect(result.raw).toBe('some content');
    });
  });

  describe('parseWith', () => {
    it('should parse with specific renderer', () => {
      const result = parser.parseWith('some content', 'text');

      expect(result).toBeDefined();
      expect(result?.type).toBe('text');
    });

    it('should return undefined for non-existent renderer', () => {
      const result = parser.parseWith('content', 'non-existent');

      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters', () => {
      const content = 'Hello <world> & "quotes"';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result[0]?.raw).toContain('<world>');
      } else {
        expect(result.raw).toContain('<world>');
      }
    });

    it('should handle unicode characters', () => {
      const content = '你好世界 🎉 émoji';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result[0]?.raw).toBe(content);
      } else {
        expect(result.raw).toBe(content);
      }
    });

    it('should handle very long content', () => {
      const content = 'x'.repeat(100000);
      const result = parser.parse(content);

      expect(result).toBeDefined();
    });

    it('should handle backticks in regular text', () => {
      const content = 'Use `code` for inline code';
      const result = parser.parse(content);

      // Inline code should not be extracted as code block
      if (Array.isArray(result)) {
        expect(
          result.every((b) => b.type !== 'code' || b.raw.includes('```')),
        ).toBe(true);
      }
    });

    it('should handle mermaid code blocks', () => {
      const content = '```mermaid\ngraph TD\n  A-->B\n```';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result[0]?.type).toBe('mermaid');
      } else {
        expect(result.type).toBe('mermaid');
      }
    });

    it('should handle chart code blocks', () => {
      const content = '```chart\n{"chartType":"bar"}\n```';
      const result = parser.parse(content);

      if (Array.isArray(result)) {
        expect(result[0]?.type).toBe('chart');
      } else {
        expect(result.type).toBe('chart');
      }
    });
  });

  describe('type detection', () => {
    it('should use custom detector when available', () => {
      registerRenderer({
        name: 'custom',
        type: 'custom' as any,
        component: {},
        priority: 100,
        detector: (content: string) => content.startsWith('CUSTOM:'),
      });

      const result = parser.parse('CUSTOM: test content');

      if (Array.isArray(result)) {
        expect(result[0]?.type).toBe('custom');
      } else {
        expect(result.type).toBe('custom');
      }
    });

    it('should fall back to lower priority detector', () => {
      registerRenderer({
        name: 'custom',
        type: 'custom' as any,
        component: {},
        priority: 100,
        detector: (content: string) => content.startsWith('CUSTOM:'),
      });

      const result = parser.parse('Regular content');

      if (Array.isArray(result)) {
        expect(result[0]?.type).not.toBe('custom');
      } else {
        expect(result.type).not.toBe('custom');
      }
    });
  });
});
