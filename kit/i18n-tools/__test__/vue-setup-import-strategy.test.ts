import { describe, it, expect } from 'vitest';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import type { ExtractedString } from '../src/utils/types';

/**
 * 单 <script setup> 场景的 t 注入策略：
 *
 * 已统一为「模块顶层 import { t } from tImport」一条路径，不再走 useI18n hook。
 * 详见 VueImportManager.handleGlobalImports 的 setup 分支注释。
 *
 * 关键校验点：
 *   1. 无论是否含编译宏，都注入 `import { t } from tImport`
 *   2. 上一轮残留的 hook 注入（无参形态）会被前置清理，不会与新 import 双声明
 *   3. 用户手写的 `useI18n({ useScope: 'local', messages })` 等高级用法不被误删
 */
describe('VueImportManager — script setup t 注入策略（统一模块 import）', () => {
  const TIMPORT = '@/i18n';
  const newMgr = () => new VueImportManager(TIMPORT, new VueI18nLibraryImpl());

  /** 构造一条 script 上下文的 ExtractedString，用于触发 handleGlobalImports 工作流。 */
  const scriptString: ExtractedString = {
    original: '',
    semanticId: 'k',
    filePath: 'fake.vue',
    line: 1,
    column: 1,
    context: 'script',
    componentType: 'setup',
  };

  it('单 setup 无编译宏 → 注入模块 import，不再注入 useI18n hook', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineProps default 调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineEmits validator 内调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
defineEmits({
  change: (v) => v !== t('default'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('withDefaults 默认值对象内调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup lang="ts">
interface Props { title?: string }
withDefaults(defineProps<Props>(), {
  title: () => t('pages.x.title'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('上一轮 hook 残留 + 本轮无编译宏 → 清理 hook，注入模块 import（防双声明）', () => {
    // 这是真实 bug 复现：旧策略下两条路径切换不对称导致 t 被声明两次。
    // 统一策略后，hook 残留无条件被前置清理，只剩模块 import。
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
    // t 在整个文件中应只被声明一次（来自模块 import）；不应同时存在 `const { t } = useI18n()`
    const moduleImports = out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/g);
    expect(moduleImports?.length).toBe(1);
    const hookDecls = out.match(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/g);
    expect(hookDecls).toBeNull();
  });

  it('上一轮模块 import 已存在 + 本轮无编译宏 → 幂等，不重复 import', () => {
    const code = `<template><div /></template>
<script setup>
import { t } from '@/i18n';
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 不应出现两条 import { t } from '@/i18n'
    const importMatches = out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/g);
    expect(importMatches?.length).toBe(1);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });

  it('上一轮 hook 残留 + 本轮含编译宏 → 清理 hook，注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });

  it('用户手写 useI18n({ useScope: "local" }) → import 保留，不误删', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t: localT } = useI18n({ useScope: 'local', messages: {} });
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 注入工具的模块 import
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    // 用户手写的 useI18n({...}) 与其 import 必须保留
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
    expect(out).toContain("useI18n({ useScope: 'local'");
  });

  it('双块共存（<script> + <script setup>）→ 写到非-setup 顶层，setup 块 hook 残留也清理', () => {
    const code = `<script>
export default { name: 'X' };
</script>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('foo');
</script>
<template><div /></template>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 模块 import 写到非-setup 块
    expect(out).toMatch(
      /<script>[\s\S]*import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"][\s\S]*<\/script>/,
    );
    // setup 块的 hook 残留被清掉
    expect(out).not.toContain('const { t } = useI18n();');
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });
});
