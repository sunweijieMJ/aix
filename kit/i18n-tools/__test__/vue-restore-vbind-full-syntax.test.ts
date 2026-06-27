import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';

/**
 * 回归：restoreTemplate pass 2 的属性绑定正则原以 `:([\w-]+)=` 为锚点，假定一律是简写
 * `:attr=`。遇到 Vue 官方同样合法的完整写法 `v-bind:title="$t('k')"` 时，正则只从中间的
 * `:title=` 匹配，把它替换为静态属性后残留 `v-bind` 前缀 → 拼出非法属性名 `v-bindtitle`。
 * 修复：锚点改 `(?:v-bind)?:`，完整写法下连同 `v-bind` 前缀一起替换。
 */
const lib = new VueI18nLibraryImpl();
const restore = (src: string, map: Record<string, string>): string =>
  VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

describe('VueRestoreTransformer — v-bind 完整语法还原', () => {
  it('完整写法 v-bind:title="$t()" → 还原为静态属性 title，不残留 v-bind', () => {
    const src = `<template>\n  <el-button v-bind:title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain('v-bindtitle');
    expect(out).not.toContain('v-bind:title');
    expect(out).not.toContain('$t');
  });

  it('完整写法带变量 v-bind:placeholder="$t(k,{...})" → 保留动态绑定与插值', () => {
    const src = `<template>\n  <el-input v-bind:placeholder="$t('m.p', { n: count })">x</el-input>\n</template>\n`;
    const out = restore(src, { 'm.p': '剩余 {n} 项' });
    expect(out).toContain('${count}');
    expect(out).not.toContain('v-bindplaceholder');
    expect(out).not.toContain('$t');
  });

  it('简写 :title="$t()" 仍正常还原（无回归）', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain('$t');
  });
});
