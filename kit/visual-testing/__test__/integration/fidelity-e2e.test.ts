/**
 * Fidelity 端到端冒烟：mock Figma REST + 真 Chromium 渲染本地 HTML
 *
 * 验证整条链路：节点树归一化 → DOM 提取 → 匹配 → diff → 像素 → 裁图 → md/json 报告。
 * 需要本机 Playwright Chromium；不可用时整组跳过。
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { FidelityOrchestrator } from '../../src/core/fidelity/orchestrator';
import { FigmaClient } from '../../src/core/figma/client';
import { configSchema } from '../../src/core/config/schema';
import { heroFixture } from '../fixtures/figma-hero';

let tmpDir: string;
let chromiumOk = false;

/** 1200x400 白底 PNG，充当 Figma 位图 */
function makeDesignPng(): Buffer {
  const png = new PNG({ width: 1200, height: 400 });
  png.data.fill(255);
  return PNG.sync.write(png);
}

function mockFetch(): typeof fetch {
  const designPng = makeDesignPng();
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/meta')) {
      return new Response(
        JSON.stringify({ file: { name: 'Hero File', version: '7', last_touched_at: 'x' } }),
        { status: 200 },
      );
    }
    if (url.includes('/nodes')) {
      return new Response(
        JSON.stringify({
          name: 'Hero File',
          version: '7',
          lastModified: 'x',
          nodes: { '12:34': { document: heroFixture } },
        }),
        { status: 200 },
      );
    }
    if (url.includes('/images/')) {
      return new Response(
        JSON.stringify({ err: null, images: { '12:34': 'https://s3.local/design.png' } }),
        { status: 200 },
      );
    }
    if (url.includes('design.png')) {
      return new Response(new Uint8Array(designPng), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

// 与 heroFixture 对应的实现：标题字号故意偏小（24 vs 28）、CTA 圆角偏小（4 vs 8）、Icon 缺失
const html = `<!doctype html><html><head><style>
  body { margin: 0; font-family: Arial, sans-serif; }
  .hero { width: 1200px; height: 400px; padding: 48px; box-sizing: border-box; display: flex; flex-direction: column; gap: 16px; background: #fff; }
  .hero__title { margin: 0; font-size: 24px; font-weight: 600; line-height: 40px; color: rgb(31, 35, 41); width: 300px; height: 40px; }
  .hero__subtitle { margin: 0; font-size: 16px; color: rgb(100, 106, 115); width: 200px; height: 24px; }
  .hero__cta { width: 120px; height: 40px; border: 0; border-radius: 4px; background: rgb(0, 88, 38); color: #fff; font-size: 14px; font-weight: 500;
               display: flex; align-items: center; justify-content: space-between; padding: 0 16px; box-shadow: 0 2px 4px rgba(0,0,0,.1); }
</style></head><body>
  <div id="app">
    <section class="hero" data-figma="12:34">
      <h1 class="hero__title">欢迎使用 管理后台</h1>
      <p class="hero__subtitle">一站式数据管理</p>
      <button class="hero__cta" data-figma="12:40"><span>立即开始</span></button>
    </section>
  </div>
</body></html>`;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vt-fidelity-'));
  await fs.writeFile(path.join(tmpDir, 'hero.html'), html, 'utf-8');
  await fs.writeFile(
    path.join(tmpDir, 'theme.css'),
    ':root{--aix-colorText: rgb(31 35 41); --aix-colorPrimary: rgb(0 88 38);}',
    'utf-8',
  );
  try {
    const { chromium } = await import('playwright');
    const b = await chromium.launch({ headless: true });
    await b.close();
    chromiumOk = true;
  } catch (error) {
    console.warn(`[fidelity-e2e] Chromium unavailable, skipping: ${(error as Error).message}`);
  }
}, 60_000);

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('fidelity end-to-end', () => {
  it('produces structured diffs, missing nodes, crops and reports', async ({ skip }) => {
    if (!chromiumOk) return skip();

    const config = configSchema.parse({
      directories: {
        baselines: path.join(tmpDir, '.vt/baselines'),
        actuals: path.join(tmpDir, '.vt/actuals'),
        diffs: path.join(tmpDir, '.vt/diffs'),
        reports: path.join(tmpDir, '.vt/reports'),
      },
      screenshot: { stability: { waitForNetworkIdle: false, extraDelay: 0 } },
      fidelity: {
        tokens: { cssFile: path.join(tmpDir, 'theme.css'), prefix: '--aix-' },
        output: { dir: path.join(tmpDir, 'fidelity') },
      },
      logging: { level: 'error' },
    });

    const client = new FigmaClient({ accessToken: 'test', fetchImpl: mockFetch() });
    const orchestrator = new FidelityOrchestrator(config, { figmaClient: client });

    const { result, reports, outDir } = await orchestrator.run({
      figma: 'KEY:12:34',
      url: `file://${path.join(tmpDir, 'hero.html')}`,
    });

    // 元数据
    expect(result.meta.figma).toMatchObject({
      fileKey: 'KEY',
      nodeId: '12:34',
      version: '7',
      name: 'Hero',
    });
    expect(result.meta.viewport).toEqual({ width: 1200, height: 400 });

    // 匹配：根与 CTA 走 attr，Title/Subtitle/Label 走 text，Icon missing
    const byId = new Map(result.matches.map((m) => [m.design.id, m]));
    expect(byId.get('12:34')!.method).toBe('attr');
    expect(byId.get('12:40')!.method).toBe('attr');
    expect(byId.get('12:36')!.method).toBe('text');
    expect(byId.get('12:36')!.render!.selector).toContain('h1');
    expect(byId.get('12:41')!.method).toBe('text');
    expect(byId.get('12:50')!.render).toBeNull();

    // diff：标题字号 major；CTA 圆角 minor；字体族失配为 minor
    const titleDiffs = byId.get('12:36')!.diffs;
    expect(titleDiffs.find((d) => d.property === 'fontSize')).toMatchObject({
      expected: '28px',
      actual: '24px',
      severity: 'major',
    });
    expect(titleDiffs.find((d) => d.property === 'fontFamily')?.severity).toBe('minor');
    expect(titleDiffs.find((d) => d.property === 'color')).toBeUndefined();

    const ctaDiffs = byId.get('12:40')!.diffs;
    expect(ctaDiffs.find((d) => d.property === 'borderRadius')).toMatchObject({
      severity: 'minor',
      delta: 4,
    });
    expect(ctaDiffs.find((d) => d.property === 'backgroundColor')).toBeUndefined();

    // 汇总：Icon 是叶子，缺失按 minor 权重
    expect(result.summary.missing).toBe(1);
    expect(result.summary.missingLeaf).toBe(1);
    expect(result.summary.major).toBeGreaterThanOrEqual(1);
    expect(result.summary.total).toBe(6);

    // 像素与裁图：设计图纯白 vs 实现有文字，必有差异区域与裁片
    expect(result.pixel.mismatchPercentage).toBeGreaterThan(0);
    expect(result.pixel.regions.length).toBeGreaterThan(0);
    const firstCrop = result.pixel.regions[0]!.cropDesign!;
    await expect(fs.access(firstCrop)).resolves.toBeUndefined();

    // 报告文件
    expect(reports.md).toBe(path.join(outDir, 'fidelity.md'));
    const md = await fs.readFile(reports.md!, 'utf-8');
    expect(md).toContain('# Fidelity Report: Hero (12:34)');
    expect(md).toContain('### 未找到对应元素（图标/图片）：Icon');
    expect(md).toContain('fontSize: 期望 28px，实际 24px');
    const json = JSON.parse(await fs.readFile(reports.json!, 'utf-8')) as {
      summary: { total: number };
    };
    expect(json.summary.total).toBe(6);

    // Figma 节点树与位图已按版本缓存
    const cacheDir = path.join(tmpDir, '.vt/cache/figma/KEY');
    const cached = await fs.readdir(cacheDir);
    expect(cached).toContain('12-34.nodes.json');
    expect(cached).toContain('12-34@1x.png');
  }, 60_000);
});
