import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';

/**
 * 回归 #2：@vue/compiler-dom 以 whitespace:'condense' 解析，跨行纯文本节点的 content
 * 被压成单空格，而 loc.source 保留换行缩进 → 提取存入的 original 含 `\n`。
 * VueTransformer.replaceInTemplate 是严格逐行 indexOf，含 `\n` 的 original 永远无法
 * 命中任何单行（±5 行兜底亦逐行）→ locale 写了 key，但源码中文从未被替换：
 * 残留中文 + 孤儿 key，破坏 extract⇄transform 不变量。
 */
describe('Vue 多行纯文本节点替换（回归 #2）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-ml-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(src: string): Promise<string> {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it('跨行文本被替换为 {{ $t(key) }}，源码不残留中文', async () => {
    const out = await transformVue(`<template>\n  <div>这是\n  一段文字</div>\n</template>\n`);
    expect(out).toContain("$t('k0')");
    expect(out).not.toContain('这是');
    expect(out).not.toContain('一段文字');
  });

  it('单行文本仍正常替换（保护既有行为）', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`);
    expect(out).toContain("{{ $t('k0') }}");
    expect(out).not.toContain('>提交<');
  });
});
