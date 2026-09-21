/**
 * DOM 提取器真浏览器测试
 *
 * 需要本机安装 Playwright Chromium；无法启动时整组跳过而非失败。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser, Page } from 'playwright';
import { extractRenderSpec, resolveRootSelector } from '../../../src/core/fidelity/dom-extractor';

const html = `
<!doctype html>
<html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; }
  .hero { position: relative; width: 600px; height: 300px; padding: 24px; box-sizing: border-box;
          display: flex; flex-direction: column; gap: 12px; background: rgb(255, 255, 255); }
  .hero__title { margin: 0; font-size: 28px; font-weight: 600; line-height: 40px; color: rgb(31, 35, 41); }
  .hero__cta { width: 120px; height: 40px; border: 1px solid rgb(0, 88, 38); border-radius: 8px;
               background: rgb(0, 88, 38); color: #fff; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
  .hidden { display: none; }
</style></head>
<body>
  <div id="app">
    <section class="hero" data-figma="12:34">
      <h1 class="hero__title">欢迎使用 <b>管理后台</b></h1>
      <p class="hidden">不可见</p>
      <button class="hero__cta" data-figma="12:40"><span>立即开始</span></button>
      <script>window.__x = 1</script>
    </section>
  </div>
</body></html>`;

let browser: Browser | null = null;
let page: Page;

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 800, height: 600 },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
    await page.setContent(html);
  } catch (error) {
    console.warn(
      `[dom-extractor.test] Chromium unavailable, skipping: ${(error as Error).message}`,
    );
    browser = null;
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('extractRenderSpec (chromium)', () => {
  it('resolves the root by data-figma before generic fallbacks', async ({ skip }) => {
    if (!browser) return skip();
    const sel = await resolveRootSelector(page, {
      rootFigmaId: '12:34',
      maxDepth: 10,
      maxNodes: 100,
    });
    expect(sel).toBe('[data-figma="12:34"]');
    const fallback = await resolveRootSelector(page, {
      rootFigmaId: '99:99',
      maxDepth: 10,
      maxNodes: 100,
    });
    expect(fallback).toBe('#app');
  });

  it('extracts bounds relative to root, computed styles and direct text', async ({ skip }) => {
    if (!browser) return skip();
    const out = await extractRenderSpec(page, {
      rootFigmaId: '12:34',
      maxDepth: 10,
      maxNodes: 100,
    });

    expect(out.truncated).toBe(false);
    const root = out.root;
    expect(root.figmaId).toBe('12:34');
    expect(root.bounds).toMatchObject({ x: 0, y: 0, width: 600, height: 300 });
    expect(root.styles.display).toBe('flex');
    expect(root.styles.padding).toEqual([24, 24, 24, 24]);
    expect(root.styles.rowGap).toBe(12);
    expect(root.styles.columnGap).toBe(12);
    expect(root.styles.backgroundColor?.hex).toBe('#ffffff');

    // 隐藏元素与 script 不出现
    const tags = root.children.map((c) => c.tag);
    expect(tags).toEqual(['h1', 'button']);

    const title = root.children[0]!;
    expect(title.text).toBe('欢迎使用'); // 只取直接文本
    expect(title.bounds.x).toBe(24);
    expect(title.styles.fontSize).toBe(28);
    expect(title.styles.fontWeight).toBe(600);
    expect(title.styles.lineHeight).toBe(40);
    expect(title.styles.color?.hex).toBe('#1f2329');
    expect(title.styles.padding).toBeNull(); // 非 flex 容器
    expect(title.selector).toMatch(/^\[data-figma="12:34"\] > h1\.hero__title/);

    const cta = root.children[1]!;
    expect(cta.figmaId).toBe('12:40');
    expect(cta.selector).toBe('[data-figma="12:40"]');
    expect(cta.bounds.width).toBe(120);
    expect(cta.styles.borderRadius).toEqual([8, 8, 8, 8]);
    expect(cta.styles.borderWidth).toBe(1);
    expect(cta.styles.borderColor?.hex).toBe('#005826');
    expect(cta.styles.backgroundColor?.hex).toBe('#005826');
    expect(cta.styles.boxShadow).not.toBe('none');
    expect(cta.children[0]!.text).toBe('立即开始');
  });

  it('resolves percentage radius, column-gap, single-side border and duplicate data-figma', async ({
    skip,
  }) => {
    if (!browser) return skip();
    const p = await browser!.newPage();
    await p.setContent(`<!doctype html><html><body style="margin:0"><div id="app"><div class="root" data-figma="r">
      <div class="avatar" style="width:40px;height:40px;border-radius:50%"></div>
      <div class="row" style="display:flex;column-gap:12px;row-gap:0;width:200px;height:20px"></div>
      <div class="divider" style="width:200px;height:2px;border-bottom:2px solid rgb(0, 0, 255)"></div>
      <ul style="margin:0;padding:0"><li class="el-item" data-figma="dup" style="height:10px">a</li><li class="el-item" data-figma="dup" style="height:10px">b</li></ul>
    </div></div></body></html>`);
    const out = await extractRenderSpec(p, { rootFigmaId: 'r', maxDepth: 10, maxNodes: 100 });

    const [avatar, row, divider, list] = out.root.children;
    expect(avatar!.styles.borderRadius).toEqual([20, 20, 20, 20]);
    expect(row!.styles.columnGap).toBe(12);
    expect(row!.styles.rowGap).toBe(0);
    expect(divider!.styles.borderWidth).toBe(2);
    expect(divider!.styles.borderWidths).toEqual([0, 0, 2, 0]);
    expect(divider!.styles.borderColor?.hex).toBe('#0000ff');

    expect(out.duplicateFigmaIds).toEqual(['dup']);
    // 重复的 data-figma 不能作为唯一选择器，退回路径形式且保留真实类名
    const items = list!.children;
    expect(items[0]!.selector).toMatch(/li\.el-item:nth-of-type\(1\)$/);
    expect(items[1]!.selector).toMatch(/li\.el-item:nth-of-type\(2\)$/);
    await p.close();
  });

  it('honours maxDepth and reports truncation', async ({ skip }) => {
    if (!browser) return skip();
    const out = await extractRenderSpec(page, { rootFigmaId: '12:34', maxDepth: 0, maxNodes: 100 });
    expect(out.root.children).toEqual([]);
    expect(out.truncated).toBe(true);
  });

  it('throws a helpful error when no root can be located', async ({ skip }) => {
    if (!browser) return skip();
    const blank = await browser!.newPage();
    await blank.setContent('<html><body></body></html>');
    await expect(extractRenderSpec(blank, { maxDepth: 5, maxNodes: 10 })).rejects.toThrow(
      /Cannot locate a rendered root element/,
    );
    await blank.close();
  });

  // 以下三例来自 vue-admin-template 真实项目实测暴露的问题
  it('lifts children of display:contents wrappers instead of dropping the subtree', async ({
    skip,
  }) => {
    if (!browser) return skip();
    const p = await browser!.newPage();
    await p.setContent(`<!doctype html><html><body style="margin:0">
      <div id="main-app" style="width:400px;height:200px">
        <div class="error-boundary" style="display:contents">
          <div class="page" style="width:400px;height:200px;display:flex">
            <h1 class="title" style="width:100px;height:30px;margin:0">404</h1>
          </div>
        </div>
      </div>
    </body></html>`);

    const out = await extractRenderSpec(p, {
      rootSelector: '#main-app',
      maxDepth: 10,
      maxNodes: 100,
    });

    // display:contents 自身不成节点，其子树被提升到根下，而不是整棵丢失
    expect(out.root.children.map((c) => c.tag)).toEqual(['div']);
    expect(out.root.children[0]!.selector).toContain('.page');
    expect(out.root.children[0]!.children[0]!.text).toBe('404');
    expect(out.nodeCount).toBe(3);
    await p.close();
  });

  it('skips the hidden svg sprite that plugins inject as the first body child', async ({
    skip,
  }) => {
    if (!browser) return skip();
    const p = await browser!.newPage();
    // vite-plugin-svg-icons 注入的 sprite：body 首个子元素，零尺寸且 aria-hidden
    await p.setContent(`<!doctype html><html><body style="margin:0">
      <svg aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><symbol id="i"></symbol></svg>
      <div id="main-app" style="width:400px;height:200px;background:#fff"></div>
    </body></html>`);

    const sel = await resolveRootSelector(p, { maxDepth: 10, maxNodes: 100 });
    expect(sel).toBe('#main-app');

    const out = await extractRenderSpec(p, { maxDepth: 10, maxNodes: 100 });
    expect(out.root.bounds).toMatchObject({ width: 400, height: 200 });
    await p.close();
  });

  it('reports a clear error when the given root itself renders no box', async ({ skip }) => {
    if (!browser) return skip();
    const p = await browser!.newPage();
    await p.setContent(
      '<!doctype html><html><body><div id="wrap" style="display:contents"></div></body></html>',
    );
    await expect(
      extractRenderSpec(p, { rootSelector: '#wrap', maxDepth: 5, maxNodes: 10 }),
    ).rejects.toThrow(/is not rendered as a single box/);
    await p.close();
  });
});
