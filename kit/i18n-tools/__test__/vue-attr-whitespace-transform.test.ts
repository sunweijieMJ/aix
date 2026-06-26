import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';

/**
 * 回归（#4 簇）：静态属性值首尾带空白时，transform 不得产出非法标记。
 *
 * 根因（修复前）：extractFromAttributes 存 original=attr.value.content.trim()（如 `确认`），
 * 而源码是 `title=" 确认"`。静态属性正则 `=["']确认["']` 要求引号紧贴文本 → padding 时失配
 * → 旧逻辑 fall through 到裸文本搜索，把 `:title="$t(...)"` 插进引号内部，产出
 * `title=" :title="$t('k0')""`（引号失衡的非法标记），且 key 照常生成、失败静默。
 *
 * 修复：静态属性正则容忍首尾空白 + `:` 前缀分支绝不 fall through 到裸文本搜索。
 */
describe('Vue 静态属性首尾空白 → transform 产出合法绑定', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-attr-ws-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = async (source: string): Promise<string> => {
    const file = path.join(dir, 'A.vue');
    fs.writeFileSync(file, source);
    const adapter = new VueAdapter('@/locale', 'vue-i18n');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(file, strings, source);
  };

  it('前导空格 title=" 确认"：转成合法 :title="$t(...)"，不破坏引号', async () => {
    const out = await run(`<template>\n  <a title=" 确认">x</a>\n</template>\n`);
    // 合法：:title="$t('k...')"
    expect(out, `输出：\n${out}`).toMatch(/:title="\$t\('k\d+'\)"/);
    // 反例：决不能把 :title 插进引号内部产生嵌套属性 / 失衡引号
    expect(out).not.toMatch(/title="\s*:title=/);
    expect(out).not.toContain('$t(\'k0\')""');
  });

  it('Tab 缩进 title="\\t确认"：同样合法转换', async () => {
    const out = await run(`<template>\n  <a title="\t确认">x</a>\n</template>\n`);
    expect(out, `输出：\n${out}`).toMatch(/:title="\$t\('k\d+'\)"/);
    expect(out).not.toMatch(/title="[\s\S]*:title=/);
  });

  it('无 padding title="确认"：原有行为不回归', async () => {
    const out = await run(`<template>\n  <a title="确认">x</a>\n</template>\n`);
    expect(out).toMatch(/:title="\$t\('k\d+'\)"/);
  });
});
