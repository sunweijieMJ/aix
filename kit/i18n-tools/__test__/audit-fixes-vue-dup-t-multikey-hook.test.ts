import { describe, it, expect } from 'vitest';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { createVueI18nLibrary } from '../src/strategies/vue/libraries';
import type { ExtractedString } from '../src/utils/types';

/**
 * 回归（三轮审计 #1，high，产物无法编译）：清理正则 getHookDeclarationCleanupRegex
 * 仅匹配「恰好 { t }」的 `const { t } = useI18n()`。用户手写的多键解构
 * `const { t, locale } = useI18n()`（增量接入极常见）不被匹配 → 残留；随后 setupOnly
 * 路径又注入模块级 `import { t } from tImport`，同一 SFC 模块作用域出现两个 t 声明
 * → `Identifier 't' has already been declared`，SFC 编译失败。
 *
 * 修复：addPluginLocaleImportToScript 注入前检测目标块是否已有从 hook 解构出的本地
 * t（含多键形态），有则跳过注入（t 已可用）。
 */
describe('Vue import：已有多键 useI18n 解构时不重复注入 t（审计三轮 #1）', () => {
  const makeStrings = (): ExtractedString[] => [
    {
      original: '标题',
      semanticId: 'app.title',
      filePath: 'X.vue',
      line: 1,
      column: 1,
      context: 'script',
      componentType: 'setup',
    },
  ];

  const im = (): VueImportManager =>
    new VueImportManager('@/plugins/locale', createVueI18nLibrary('vue-i18n'));

  it('用户手写 const { t, locale } = useI18n()：不再额外注入 import { t }，无双声明', () => {
    const code = `<template><div>{{ t('app.title') }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const title = t('app.title');
void locale;
</script>`;

    const out = im().handleGlobalImports(code, makeStrings(), 'X.vue');

    // 不得注入模块级 import { t }（会与解构出的 t 冲突）
    expect(out).not.toContain("import { t } from '@/plugins/locale'");
    // 用户原有解构保留
    expect(out).toContain('const { t, locale } = useI18n()');
    // 全文件只出现一处 t 声明（解构），不存在第二处
    const tBindings =
      (out.match(/\bconst\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useI18n\(\)/g) || []).length +
      (out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'@\/plugins\/locale'/g) || []).length;
    expect(tBindings).toBe(1);
  });

  it('控制用例：工具自注入的恰好 const { t } = useI18n() 仍正常迁移为模块 import', () => {
    const code = `<template><div>{{ t('app.title') }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const title = t('app.title');
</script>`;

    const out = im().handleGlobalImports(code, makeStrings(), 'X.vue');

    // 恰好 { t } 形态被清理并迁移到模块 import（既有行为不被本修复破坏）
    expect(out).toContain("import { t } from '@/plugins/locale'");
    expect(out).not.toContain('const { t } = useI18n()');
  });
});
