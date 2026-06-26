import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';

const lib = new VueI18nLibraryImpl();

/**
 * 守卫：restore 清理「t 的来源」（hook 声明 `const { t } = useI18n()` + useI18n 导入；
 * 或 standalone 的 `import { t } from <tImport>`）时，若仍有未被还原的存活 t() 调用
 * （locale 缺 key / 动态 key），不得删除来源，否则产出未定义标识符（TS2304）。
 *
 * 此前 SFC 仅守卫了模块 import，hook 声明无条件删；standalone 路径 import 与 hook 声明
 * 都无条件删。本组用例锁定两条路径在「部分还原」下的对称行为。
 */
describe('VueRestoreTransformer t 来源删除守卫（部分还原）', () => {
  // --- SFC：hook 提供 t ---
  it('SFC：存活 t() 调用时保留 useI18n hook 声明与导入', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
const b = t('missing');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib);
    expect(out).toContain('你好'); // 命中的已还原
    expect(out).toMatch(/t\('missing'\)/); // 存活调用保留
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/); // hook 声明保留
    expect(out).toMatch(/import\s*\{\s*useI18n\s*\}\s*from\s*['"]vue-i18n['"]/); // 来源导入保留
  });

  it('SFC：全部还原后无残留 t() → 仍清理 hook 声明与导入（不回归）', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useI18n\(\)/);
    expect(out).not.toMatch(/const\s*\{\s*t\s*\}/);
    expect(out).not.toMatch(/import.*vue-i18n/);
  });

  // --- standalone .ts：自定义 tImport ---
  it('standalone：存活 t() 调用时保留 import { t }', () => {
    const code = `import { t } from '@/plugins/locale';
const a = t('k');
const b = t('missing');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(
      code,
      { k: '你好' },
      lib,
      '@/plugins/locale',
    );
    expect(out).toContain('你好');
    expect(out).toMatch(/t\('missing'\)/);
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });

  it('standalone：全部还原后删除死 import { t }（不回归）', () => {
    const code = `import { t } from '@/plugins/locale';
const a = t('k');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(
      code,
      { k: '你好' },
      lib,
      '@/plugins/locale',
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/import\s*\{\s*t\s*\}/);
  });

  // --- standalone .ts：hook 提供 t ---
  it('standalone：存活 t() 调用时保留 useI18n hook 声明与导入', () => {
    const code = `import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
const b = t('missing');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(code, { k: '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).toMatch(/t\('missing'\)/);
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    expect(out).toMatch(/import\s*\{\s*useI18n\s*\}\s*from\s*['"]vue-i18n['"]/);
  });
});
