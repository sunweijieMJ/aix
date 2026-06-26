import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { VueI18nextLibrary } from '../src/strategies/vue/libraries/vue-i18next';
import type { VueI18nLibrary } from '../src/strategies/vue/libraries';

/**
 * Vue 模板还原引擎测试（此前零覆盖：restore-cleanup-import.test.ts 全是 <script setup>
 * import 清理，VueRestoreTransformer.restoreTemplate 的三个 pass 一行没测）。
 *
 * 镜像 React 端 react-restore-jsx-mixed.test.ts，覆盖模板四种还原上下文 + 命名空间剥离
 * + 不可还原守卫。直接调静态 restoreVueFile（与 restore-cleanup-import.test.ts 同风格）。
 */
const vi18n = new VueI18nLibraryImpl();
const restore = (src: string, map: Record<string, string>, lib: VueI18nLibrary = vi18n): string =>
  VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

describe('VueRestoreTransformer 模板还原', () => {
  it('pass1：{{ $t(key) }} 文本插值 → 还原回文本节点中文', () => {
    const src = `<template>\n  <div>{{ $t('m.submit') }}</div>\n</template>\n`;
    const out = restore(src, { 'm.submit': '提交' });
    expect(out).toContain('<div>提交</div>');
    expect(out).not.toContain('$t');
  });

  it('pass2：:attr="$t(key)" 属性绑定 → 还原回静态属性', () => {
    const src = `<template>\n  <el-button :title="$t('m.confirm')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.confirm': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain(':title');
    expect(out).not.toContain('$t');
  });

  it("pass2：单引号外层 :attr='$t(key)' 也能还原（不产出非法语法）", () => {
    const src = `<template>\n  <el-tag :label='$t('m.k')'>x</el-tag>\n</template>\n`;
    const out = restore(src, { 'm.k': '标签' });
    expect(out).toContain('label="标签"');
    expect(out).not.toContain('$t');
    // 不得产出 :label=''标签'' 这种无效语法
    expect(out).not.toMatch(/''/);
  });

  it('pass3：三元内层 $t 调用 → 各自还原为字符串字面量（保留三元结构）', () => {
    const src = `<template>\n  <div>{{ ok ? $t('a') : $t('b') }}</div>\n</template>\n`;
    const out = restore(src, { a: '成功', b: '失败' });
    expect(out).toContain("ok ? '成功' : '失败'");
    expect(out).not.toContain('$t');
  });

  it('带变量：{{ $t(key, { name: expr }) }} → 文本插值 {{ expr }}', () => {
    const src = `<template>\n  <div>{{ $t('w.hello', { name: userName }) }}</div>\n</template>\n`;
    const out = restore(src, { 'w.hello': '欢迎 {name}' });
    expect(out).toContain('欢迎 {{ userName }}');
    expect(out).not.toContain('$t');
  });

  it('vue-i18next：$t(ns:key) 命名空间前缀在还原时被剥离', () => {
    const src = `<template>\n  <div>{{ $t('app:greeting') }}</div>\n</template>\n`;
    // locale 中只存无命名空间的 key
    const out = restore(src, { greeting: '你好' }, new VueI18nextLibrary());
    expect(out).toContain('<div>你好</div>');
    expect(out).not.toContain('$t');
  });

  it('守卫：locale 查不到的 key → $t 调用原样保留，不误删', () => {
    const src = `<template>\n  <div>{{ $t('missing.key') }}</div>\n</template>\n`;
    const out = restore(src, { other: '别的' });
    expect(out).toContain("$t('missing.key')");
  });

  it("PUA 防重入：locale 文本里碰巧含 t('x') 字面量不被二次替换", () => {
    const src = `<template>\n  <div>{{ $t('doc.tip') }}</div>\n</template>\n`;
    // 还原文本本身含形似 i18n 调用的字面串
    const out = restore(src, { 'doc.tip': "调用 t('foo') 函数", foo: '不应命中' });
    expect(out).toContain("调用 t('foo') 函数");
    expect(out).not.toContain('不应命中');
  });
});
