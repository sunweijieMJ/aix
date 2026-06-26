import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';

/**
 * 回归：restoreTemplate pass 2 把 :attr="$t('key')" 还原成静态属性时，直接把 locale 文本
 * 原样插进双引号属性值，不转义。若译文含双引号（如 Click "OK"），输出 attr="Click "OK""
 * 引号失衡 → 破坏整个标签解析。带变量分支把文本包进反引号模板字面量塞进双引号属性，文本里
 * 的双引号/反引号同样破坏标记。脚本侧带变量分支会转义，属性侧完全没有，提取/还原不对称。
 * 修复：静态属性值做属性转义（&/"/<>→实体）；带变量分支转义反引号/${ 与外层双引号。
 */
const lib = new VueI18nLibraryImpl();
const restore = (src: string, map: Record<string, string>): string =>
  VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

describe('VueRestoreTransformer 属性还原转义', () => {
  it('静态属性译文含双引号 → 转义为 &quot;，不产出引号失衡的属性', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': 'Click "OK" now' });
    expect(out).toContain('&quot;'); // 双引号被转义
    expect(out).not.toContain('"OK"'); // 不残留会破坏属性的裸引号
    expect(out).not.toContain('$t');
  });

  it('静态属性译文含 & → 转义为 &amp;（与提取解码对称，可往返）', () => {
    const src = `<template>\n  <el-tag :label="$t('m.k')">x</el-tag>\n</template>\n`;
    const out = restore(src, { 'm.k': '保存 & 关闭' });
    expect(out).toContain('label="保存 &amp; 关闭"');
  });

  it('普通译文（无特殊字符）静态属性仍按原样还原', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
  });

  it('带变量属性译文含双引号 → 转义且保留 ${expr} 插值', () => {
    const src = `<template>\n  <el-input :placeholder="$t('m.p', { n: count })">x</el-input>\n</template>\n`;
    const out = restore(src, { 'm.p': 'Say "hi" {n}' });
    expect(out).toContain('${count}'); // 变量插值保留
    expect(out).toContain('&quot;'); // 双引号被转义，不破坏外层双引号属性
    expect(out).not.toContain('"hi"');
  });
});
