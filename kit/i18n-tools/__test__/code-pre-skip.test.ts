import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { VueAdapter } from '../src/adapters/VueAdapter';

/**
 * <code> / <pre> 内容是逐字代码 / 预格式文本，不应被提取（含整棵子树）。
 * 兄弟节点的正常中文照常提取。覆盖 Vue 模板与 React JSX。
 * 复现来源：apps/client demo 里 `<code>&lt;script setup&gt;</code>` 被提取成孤儿 key。
 */
describe('<code> / <pre> 内容不提取', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-pre-skip-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function originals(adapter: ReactAdapter | VueAdapter, name: string, code: string) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, code);
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    return strings.map((s) => s.original);
  }

  it('React：<code> 内容跳过，句中中文照常提取', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const out = await originals(
      adapter,
      'r.tsx',
      `export default function P() {\n  return <p>校验 <code>&lt;script setup&gt;</code> 用法</p>;\n}\n`,
    );
    expect(out).toContain('校验');
    expect(out).toContain('用法');
    expect(out.some((o) => o.includes('script setup'))).toBe(false);
  });

  it('React：<pre> 整段跳过，兄弟中文保留', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const out = await originals(
      adapter,
      'r2.tsx',
      `export default function P() {\n  return (\n    <div>\n      <pre>const x = '示例代码';</pre>\n      <span>说明文字</span>\n    </div>\n  );\n}\n`,
    );
    expect(out).toContain('说明文字');
    expect(out.some((o) => o.includes('示例代码'))).toBe(false);
  });

  it('Vue：<code> 内容跳过，兄弟中文照常提取', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n');
    const out = await originals(
      adapter,
      'v.vue',
      `<template>\n  <p>查看 <code>&lt;script setup&gt;</code> 写法<span>标题</span></p>\n</template>\n`,
    );
    expect(out).toContain('查看');
    expect(out).toContain('写法');
    expect(out).toContain('标题');
    expect(out.some((o) => o.includes('script setup'))).toBe(false);
  });
});
