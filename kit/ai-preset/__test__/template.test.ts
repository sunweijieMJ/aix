import { describe, expect, it } from 'vitest';
import { collectVariables, renderTemplate } from '../src/core/template.js';
import type { RuleSource } from '../src/types.js';

describe('renderTemplate', () => {
  it('替换简单变量', () => {
    const result = renderTemplate(
      '.{{componentPrefix}}-button { color: red; }',
      { componentPrefix: 'aix' },
    );
    expect(result).toBe('.aix-button { color: red; }');
  });

  it('无模板语法时直接返回', () => {
    const content = '普通内容没有模板语法';
    expect(renderTemplate(content, {})).toBe(content);
  });

  it('未定义变量返回空字符串', () => {
    const result = renderTemplate('前缀: {{prefix}}', {});
    expect(result).toBe('前缀: ');
  });

  it('不对内容做 HTML escape', () => {
    const result = renderTemplate('{{content}}', {
      content: '<div class="test">&amp;</div>',
    });
    expect(result).toContain('<div');
    expect(result).toContain('&amp;');
  });
});

describe('collectVariables', () => {
  const makeSource = (
    layer: 'base' | 'framework' | 'domain',
    variables: Record<string, { default: string; description: string }>,
  ): RuleSource => ({
    meta: {
      id: `${layer}/test`,
      title: 'test',
      description: '',
      layer,
      priority: 0,
      platforms: [],
      tags: [],
      version: '1.0.0',
      variables,
    },
    content: '',
    filePath: '',
  });

  it('收集变量默认值', () => {
    const sources = [
      makeSource('base', {
        prefix: { default: 'app', description: '前缀' },
      }),
    ];
    const vars = collectVariables(sources);
    expect(vars.prefix).toBe('app');
  });

  it('后加载的覆盖先加载的', () => {
    const sources = [
      makeSource('base', {
        prefix: { default: 'app', description: '基础前缀' },
      }),
      makeSource('framework', {
        prefix: { default: 'vue', description: '框架前缀' },
      }),
    ];
    const vars = collectVariables(sources);
    expect(vars.prefix).toBe('vue');
  });

  it('用户 override 最优先', () => {
    const sources = [
      makeSource('framework', {
        prefix: { default: 'vue', description: '框架前缀' },
      }),
    ];
    const vars = collectVariables(sources, { prefix: 'aix' });
    expect(vars.prefix).toBe('aix');
  });
});
