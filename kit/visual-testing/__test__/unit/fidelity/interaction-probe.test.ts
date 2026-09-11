/**
 * 交互反馈探测：真浏览器测试
 *
 * 需要本机 Playwright Chromium；无法启动时整组跳过。
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Browser } from 'playwright';
import { probeInteraction, diffSnapshot } from '../../../src/core/fidelity/interaction-probe';
import type { StyleSnapshot } from '../../../src/core/fidelity/interaction-probe.browser';

let browser: Browser | null = null;

const html = `<!doctype html><html><head><style>
  body { margin: 0; }
  .root { width: 600px; padding: 20px; }
  .ok { background: #eee; border: 0; padding: 8px 16px; cursor: pointer; }
  .ok:hover { background: #ccc; }
  .dead { background: #eee; border: 0; padding: 8px 16px; cursor: pointer; }
  .link-ok { display: inline-block; padding: 8px; cursor: pointer; text-decoration: none; }
  .link-ok:hover { text-decoration: underline; }
  .no-cursor { background: #eee; border: 0; padding: 8px 16px; cursor: default; }
  .no-cursor:hover { background: #ddd; }
  .hidden { display: none; }
</style></head><body>
  <div class="root" id="root">
    <button class="ok">有反馈</button>
    <button class="dead">没反馈</button>
    <a class="link-ok" href="#x">链接</a>
    <button class="no-cursor">缺手型</button>
    <button class="hidden">隐藏的</button>
    <span>纯文本不算可交互</span>
  </div>
</body></html>`;

beforeAll(async () => {
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.warn(
      `[interaction-probe.test] Chromium unavailable, skipping: ${(error as Error).message}`,
    );
    browser = null;
  }
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('diffSnapshot', () => {
  const base = {
    backgroundColor: 'rgb(1, 1, 1)',
    backgroundImage: 'none',
    color: 'rgb(0, 0, 0)',
    borderColor: 'a b',
    borderWidth: '0px 0px',
    boxShadow: 'none',
    opacity: '1',
    transform: 'none',
    textDecorationLine: 'none',
    outlineStyle: 'none',
    filter: 'none',
  } satisfies StyleSnapshot;

  it('returns the changed property names', () => {
    expect(diffSnapshot(base, base)).toEqual([]);
    expect(diffSnapshot(base, { ...base, backgroundColor: 'rgb(2, 2, 2)' })).toEqual([
      'backgroundColor',
    ]);
    expect(diffSnapshot(base, { ...base, opacity: '0.5', transform: 'scale(1.1)' })).toEqual([
      'opacity',
      'transform',
    ]);
  });
});

describe('probeInteraction (chromium)', () => {
  it('detects elements without hover feedback and missing pointer cursor', async ({ skip }) => {
    if (!browser) return skip();
    const page = await (
      await browser.newContext({ viewport: { width: 800, height: 600 } })
    ).newPage();
    await page.setContent(html);

    const result = await probeInteraction(page, { rootSelector: '#root', maxElements: 40 });

    // 4 个可见可交互元素（隐藏的和纯文本不算）
    expect(result.total).toBe(4);
    expect(result.withFeedback).toBe(3);

    const noFeedback = result.findings.filter((f) => f.type === 'no-hover-feedback');
    expect(noFeedback).toHaveLength(1);
    expect(noFeedback[0]!.label).toBe('没反馈');
    // 报告里必须是清理后依然可用的选择器，不能是临时标记
    expect(noFeedback[0]!.selector).toContain('.dead');
    expect(noFeedback[0]!.selector).not.toContain('data-vt-probe');

    const noCursor = result.findings.filter((f) => f.type === 'missing-pointer-cursor');
    expect(noCursor).toHaveLength(1);
    expect(noCursor[0]!.label).toBe('缺手型');
    expect(noCursor[0]!.detail).toContain('cursor 为 default');

    // 临时标记必须清理干净，否则会污染后续截图与提取
    expect(await page.locator('[data-vt-probe]').count()).toBe(0);
    await page.close();
  }, 60_000);

  it('returns an empty result when the root has no interactive elements', async ({ skip }) => {
    if (!browser) return skip();
    const page = await (await browser.newContext()).newPage();
    await page.setContent('<div id="root"><p>只有文字</p></div>');
    const result = await probeInteraction(page, { rootSelector: '#root', maxElements: 10 });
    expect(result).toEqual({ total: 0, withFeedback: 0, findings: [] });
    await page.close();
  }, 60_000);

  it('does not double-count nested interactive elements', async ({ skip }) => {
    if (!browser) return skip();
    const page = await (await browser.newContext()).newPage();
    // button 内的 span 会继承 cursor: pointer，只应算最外层一个
    await page.setContent(
      '<div id="root"><button style="cursor:pointer"><span style="cursor:pointer">嵌套</span></button></div>',
    );
    const result = await probeInteraction(page, { rootSelector: '#root', maxElements: 10 });
    expect(result.total).toBe(1);
    await page.close();
  }, 60_000);
});
