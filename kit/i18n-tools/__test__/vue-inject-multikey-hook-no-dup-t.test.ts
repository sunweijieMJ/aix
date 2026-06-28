import { describe, it, expect } from 'vitest';
import { createVueI18nLibrary } from '../src/strategies/vue/libraries';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { VueComponentInjector } from '../src/strategies/vue/VueComponentInjector';
import { VueTransformer } from '../src/strategies/vue/VueTransformer';
import type { ExtractedString } from '../src/utils/types';

/**
 * 回归：增量接入场景——<script setup> 已有用户手写的多键 useI18n() 解构
 * （`const { t, locale } = useI18n()`），仍有中文待提取。
 *
 * 之前 handleGlobalImports 已用 hasLocalHookTBinding 跳过模块 import 注入，但其后的
 * VueComponentInjector.inject() / needsHook() 仅用 getHookDeclarationCheckRegex
 * （只匹配恰好 `{ t }`）判定，识别不出 `{ t, locale }`，于是又注入一遍
 * `const { t } = useI18n()` → `Identifier 't' has already been declared`，SFC 无法编译。
 *
 * 注意：必须走 VueTransformer.transform 全链路才能复现——只单测 handleGlobalImports
 * 会绕过出 bug 的 inject() 段（既有 audit-fixes-vue-dup-t-multikey-hook 的盲点）。
 */
describe('Vue inject：已有多键 useI18n 解构时 inject 不再注入重复 t（全链路）', () => {
  const build = () => {
    const lib = createVueI18nLibrary('vue-i18n');
    const im = new VueImportManager('@/plugins/locale', lib);
    const injector = new VueComponentInjector(lib, im);
    return new VueTransformer(lib, im, injector);
  };

  const countHookDecls = (code: string): number => (code.match(/=\s*useI18n\(\)/g) || []).length;

  it('vue-i18n：用户手写 const { t, locale } = useI18n()，转换后全文件仅一处 useI18n() 声明', () => {
    const file = 'X.vue';
    const src = `<template><div>{{ msg }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const msg = '标题';
void locale;
</script>`;

    const strings = [
      {
        original: '标题',
        semanticId: 'app.title',
        filePath: file,
        line: 5,
        column: 13,
        context: 'script',
        componentType: 'setup',
      },
    ] as unknown as ExtractedString[];

    const out = build().transform(file, strings, src);

    // 不得产生第二处 useI18n() 声明
    expect(countHookDecls(out)).toBe(1);
    // 用户原有多键解构保留
    expect(out).toContain('const { t, locale } = useI18n()');
    // 不得额外注入恰好 { t } 形态
    expect(out).not.toContain('const { t } = useI18n();\n\nconst { t, locale }');
    // 中文已被替换为 t() 调用
    expect(out).toContain("t('app.title')");
  });

  it('vue-i18next：用户手写 const { t, i18n } = useTranslation()，不重复注入', () => {
    const lib = createVueI18nLibrary('vue-i18next');
    const im = new VueImportManager('@/plugins/locale', lib);
    const injector = new VueComponentInjector(lib, im);
    const transformer = new VueTransformer(lib, im, injector);

    const file = 'Y.vue';
    const src = `<template><div>{{ msg }}</div></template>
<script setup lang="ts">
import { useTranslation } from 'vue-i18next';
const { t, i18n } = useTranslation();
const msg = '标题';
void i18n;
</script>`;

    const strings = [
      {
        original: '标题',
        semanticId: 'app.title',
        filePath: file,
        line: 5,
        column: 13,
        context: 'script',
        componentType: 'setup',
      },
    ] as unknown as ExtractedString[];

    const out = transformer.transform(file, strings, src);

    expect((out.match(/=\s*useTranslation\(/g) || []).length).toBe(1);
    expect(out).toContain('const { t, i18n } = useTranslation()');
  });
});
