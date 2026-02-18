/**
 * Storybook 自动发现模块单元测试
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverStories } from '../../../src/core/storybook/discovery';
import type { VisualTestConfig } from '../../../src/core/config/schema';
import { configSchema } from '../../../src/core/config/schema';

/** 创建带 storybook 配置的 VisualTestConfig */
function createConfig(
  overrides: Partial<VisualTestConfig['storybook']> = {},
): VisualTestConfig {
  return configSchema.parse({
    storybook: {
      enabled: true,
      ...overrides,
    },
    server: {
      url: 'http://localhost:6006',
    },
  });
}

/** 构造标准的 Storybook index.json 响应 */
function makeIndex(
  entries: Record<
    string,
    { id: string; title: string; name: string; type: string; tags?: string[] }
  >,
) {
  return { v: 5, entries };
}

const standardIndex = makeIndex({
  'components-button--primary': {
    id: 'components-button--primary',
    title: 'Components/Button',
    name: 'Primary',
    type: 'story',
  },
  'components-button--secondary': {
    id: 'components-button--secondary',
    title: 'Components/Button',
    name: 'Secondary',
    type: 'story',
  },
  'components-button--docs': {
    id: 'components-button--docs',
    title: 'Components/Button',
    name: 'Docs',
    type: 'docs',
  },
  'components-input--default': {
    id: 'components-input--default',
    title: 'Components/Input',
    name: 'Default',
    type: 'story',
  },
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('discoverStories', () => {
  it('should parse standard index.json and generate correct targets', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig();
    const targets = await discoverStories(config);

    // 2 个 target: Components/Button 和 Components/Input
    expect(targets).toHaveLength(2);

    const button = targets.find((t) => t.name === 'Components/Button');
    expect(button).toBeDefined();
    expect(button!.type).toBe('component');
    // 2 个 variant（排除了 docs）
    expect(button!.variants).toHaveLength(2);

    const primary = button!.variants.find((v) => v.name === 'Primary');
    expect(primary).toBeDefined();
    expect(primary!.url).toBe(
      'http://localhost:6006/iframe.html?id=components-button--primary&viewMode=story',
    );
    expect(primary!.baseline).toBe('storybook/Components-Button/Primary.png');
    expect(primary!.selector).toBe('#storybook-root');

    const input = targets.find((t) => t.name === 'Components/Input');
    expect(input).toBeDefined();
    expect(input!.variants).toHaveLength(1);
  });

  it('should only include type=story and ignore docs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig();
    const targets = await discoverStories(config);

    // 所有 variant 应都不包含 "Docs"
    for (const target of targets) {
      for (const variant of target.variants) {
        expect(variant.name).not.toBe('Docs');
      }
    }
  });

  it('should apply include filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig({ include: ['Components/Button/**'] });
    const targets = await discoverStories(config);

    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('Components/Button');
  });

  it('should apply exclude filter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig({ exclude: ['Components/Input/**'] });
    const targets = await discoverStories(config);

    expect(targets).toHaveLength(1);
    expect(targets[0]!.name).toBe('Components/Button');
  });

  it('should return empty array when no stories found', async () => {
    const emptyIndex = makeIndex({
      'intro--docs': {
        id: 'intro--docs',
        title: 'Introduction',
        name: 'Docs',
        type: 'docs',
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(emptyIndex), { status: 200 }),
    );

    const config = createConfig();
    const targets = await discoverStories(config);

    expect(targets).toHaveLength(0);
  });

  it('should throw meaningful error when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const config = createConfig();

    await expect(discoverStories(config)).rejects.toThrow(
      /Failed to fetch Storybook index.*ECONNREFUSED/,
    );
  });

  it('should throw meaningful error on non-OK response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const config = createConfig();

    await expect(discoverStories(config)).rejects.toThrow(
      /Storybook index request failed: 404/,
    );
  });

  it('should handle trailing slash in URL', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig({ url: 'http://localhost:6006/' });
    const targets = await discoverStories(config);

    // fetch 应该被调用时 URL 不含双斜杠
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://localhost:6006/index.json',
    );
    expect(targets.length).toBeGreaterThan(0);
  });

  it('should fallback to server.url when storybook.url is not set', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig(); // 未设置 storybook.url
    await discoverStories(config);

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://localhost:6006/index.json',
    );
  });

  it('should use custom defaultSelector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig({ defaultSelector: '.my-root' });
    const targets = await discoverStories(config);

    for (const target of targets) {
      for (const variant of target.variants) {
        expect(variant.selector).toBe('.my-root');
      }
    }
  });

  it('should use custom baselineDir', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(standardIndex), { status: 200 }),
    );

    const config = createConfig({ baselineDir: 'my-baselines' });
    const targets = await discoverStories(config);

    for (const target of targets) {
      for (const variant of target.variants) {
        expect(variant.baseline).toMatch(/^my-baselines\//);
      }
    }
  });
});
