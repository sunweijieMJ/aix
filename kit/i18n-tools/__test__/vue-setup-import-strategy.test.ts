import { describe, it, expect } from 'vitest';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import type { ExtractedString } from '../src/utils/types';

/**
 * 单 <script setup> 场景的 t 注入策略选择：
 * - 默认走 useI18n hook 注入（vue-i18n 官方推荐风格）
 * - 例外：编译宏（defineProps 等）参数子树引用 t() → 改走模块 import，
 *   避免 setup 局部 t 触发 vue/valid-define-* 报错
 */
describe('VueImportManager — script setup t 注入策略', () => {
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

  it('单 setup 无编译宏 → 注入 useI18n hook（保持默认风格）', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
    expect(out).toContain('const { t } = useI18n();');
    expect(out).not.toContain(`from '${TIMPORT}'`);
  });

  it('defineProps default 调 t() → 走模块 import，不注入 hook', () => {
    const code = `<template><div /></template>
<script setup>
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain(`from '${TIMPORT}'`);
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineEmits validator 内调 t() → 走模块 import', () => {
    const code = `<template><div /></template>
<script setup>
defineEmits({
  change: (v) => v !== t('default'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain(`from '${TIMPORT}'`);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('withDefaults 默认值对象内调 t() → 走模块 import', () => {
    const code = `<template><div /></template>
<script setup lang="ts">
interface Props { title?: string }
withDefaults(defineProps<Props>(), {
  title: () => t('pages.x.title'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain(`from '${TIMPORT}'`);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineProps 参数无 t() → 仍走 hook 路径（不误判）', () => {
    const code = `<template><div /></template>
<script setup>
const props = defineProps({
  title: { type: String, default: '' },
});
const label = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
    expect(out).toContain('const { t } = useI18n();');
    expect(out).not.toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  it('存量已有 useI18n hook + 新增编译宏 default 调 t → 迁移：清理 hook + 注入 import', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toContain(`from '${TIMPORT}'`);
    expect(out).not.toContain('const { t } = useI18n();');
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });

  it('用户在 setup 内手写 useI18n({ useScope: "local" }) → import 保留，不误删', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t: localT } = useI18n({ useScope: 'local', messages: {} });
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 编译宏命中 → 注入模块 import
    expect(out).toContain(`from '${TIMPORT}'`);
    // 工具注入的标准 const { t } = useI18n() 不存在，无需清理
    // 用户手写的 useI18n({...}) 调用与 import 必须保留
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
    expect(out).toContain("useI18n({ useScope: 'local'");
  });

  it('obj.t() / this.$t() 不应触发误判', () => {
    const code = `<template><div /></template>
<script setup>
const i18n = { t: (k) => k };
const props = defineProps({
  title: { type: String, default: i18n.t('pages.x.title') },
});
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // defineProps 子树里只有 i18n.t() 而无裸 t() → 仍走 hook 路径
    expect(out).toContain('const { t } = useI18n();');
    expect(out).not.toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });
});
