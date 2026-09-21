/**
 * 文档站活演示冒烟：用真实浏览器逐页检查演示有没有挂载。
 *
 * 构建通过不代表演示能跑——`<ClientOnly>` 里的内容不进 SSR 产物，
 * 组件在浏览器里初始化失败时页面照样是空的（曾因 CodeMirror 分块问题整页无编辑器）。
 * 这里按「源码里写了几个 demo-block，页面上就要渲染出几个」来断言，并收集页面报错与 404。
 */
import { spawn, type ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { chromium, type Browser } from 'playwright';

/** 演示容器的 class，与 docs/.vitepress/theme/style/custom.css 对应 */
const DEMO_CLASS = 'demo-block';

/** 页面加载后额外等待的时间，留给 CodeMirror / pdf.js 这类需要初始化的组件 */
const SETTLE_MS = 3000;

export interface SmokeOptions {
  /** 仓库根 */
  root: string;
  /** 站点根地址，如 http://localhost:4173/docs/ */
  baseUrl: string;
  /** 进度输出 */
  log?: (line: string) => void;
}

export interface PageResult {
  page: string;
  expected: number;
  actual: number;
  errors: string[];
  missing: string[];
}

/** 忽略的控制台噪音：外链媒体在无网环境下的加载失败不该让冒烟变红 */
const IGNORED_ERROR_RE = /Failed to load resource|net::ERR_|ERR_CONNECTION|media resource/i;

/**
 * 逐页检查，返回每页的结果。调用方决定如何呈现与退出码。
 */
export async function smokeDemos(options: SmokeOptions): Promise<PageResult[]> {
  const log = options.log ?? (() => {});
  const files = (await glob('docs/components/*.md', { cwd: options.root }))
    .map((file) => path.basename(file, '.md'))
    .filter((name) => name !== 'index')
    .sort();

  const browser = await chromium.launch();
  try {
    const results: PageResult[] = [];
    for (const name of files) {
      const source = await fs.readFile(
        path.join(options.root, 'docs/components', `${name}.md`),
        'utf-8',
      );
      const expected = countDemoBlocks(source);
      results.push(await checkPage(browser, options.baseUrl, name, expected, log));
    }
    return results;
  } finally {
    await browser.close();
  }
}

/** 源码里 demo-block 的个数（围栏代码块里的示例不算） */
function countDemoBlocks(source: string): number {
  let fence: string | null = null;
  let count = 0;
  for (const line of source.split('\n')) {
    const marker = /^(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      continue;
    }
    if (!fence && new RegExp(`class="[^"]*\\b${DEMO_CLASS}\\b`).test(line)) count++;
  }
  return count;
}

async function checkPage(
  browser: Browser,
  baseUrl: string,
  name: string,
  expected: number,
  log: (line: string) => void,
): Promise<PageResult> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  const missing: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!IGNORED_ERROR_RE.test(text)) errors.push(text.slice(0, 200));
  });
  page.on('response', (response) => {
    // 站内资源 404 说明构建产物缺文件（动态导入纯 CSS 就这么翻过车）
    if (response.status() === 404 && response.url().startsWith(baseUrl)) {
      missing.push(response.url().replace(baseUrl, ''));
    }
  });

  try {
    // 视频等媒体会让网络永不空闲，只等 load 再固定等待一段时间
    await page.goto(`${baseUrl}components/${name}.html`, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(SETTLE_MS);
    const actual = await page.locator(`.${DEMO_CLASS}`).count();
    log(
      `${actual >= expected && errors.length === 0 ? '✅' : '❌'} ${name}：${actual}/${expected}`,
    );
    return {
      page: name,
      expected,
      actual,
      errors: [...new Set(errors)],
      missing: [...new Set(missing)],
    };
  } finally {
    await context.close();
  }
}

/**
 * vitepress preview 就绪时打印的行。站点地址只认它：
 * base 随 DEPLOY_TARGET 在 `/docs/` 与 `/aix/docs/` 之间变，端口也可能不是传进去的那个，
 * 而且自己拼地址再去 fetch 的话，端口被别人占着时会连到别人家的站点上，冒烟结果全是假的
 */
const SERVED_AT_RE = /Built site served at (http:\/\/\S+)/;

/** 去掉 ANSI 转义，便于匹配就绪行 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/** 启动 vitepress preview，返回进程与地址 */
export async function startPreview(
  root: string,
  port: number,
): Promise<{ child: ChildProcess; baseUrl: string }> {
  const child = spawn('pnpm', ['exec', 'vitepress', 'preview', 'docs', '--port', String(port)], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // 装在对象里是为了让 TS 保住声明类型：局部 let 会被初始值收窄成 null，
  // 回调里的赋值不进控制流分析，后面的判空会被当成死代码
  const state = {
    // 端口被占、产物缺失这类启动失败只体现在子进程的输出里，丢掉就没法诊断
    output: '',
    servedAt: null as string | null,
    died: null as string | null,
  };

  const absorb = (chunk: unknown) => {
    state.output += String(chunk);
    state.servedAt ??= SERVED_AT_RE.exec(stripAnsi(state.output))?.[1] ?? null;
  };
  child.stdout?.on('data', absorb);
  child.stderr?.on('data', absorb);

  // 进程死了还接着轮询的话，最后只会报一个与真实原因无关的超时
  child.on('error', (error) => {
    state.died ??= `spawn 失败：${error.message}`;
  });
  child.on('exit', (code, signal) => {
    state.died ??= `进程退出 code=${code} signal=${signal}`;
  });

  for (let i = 0; i < 60; i++) {
    if (state.died) throw new Error(`预览服务启动失败：${state.died}\n${state.output.trim()}`);
    if (state.servedAt) {
      const baseUrl = state.servedAt.endsWith('/') ? state.servedAt : `${state.servedAt}/`;
      const response = await fetch(baseUrl).catch(() => null);
      if (response?.ok) return { child, baseUrl };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error(`预览服务 30 秒内没有起来\n${state.output.trim()}`);
}
