import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';

const lib = new VueI18nLibraryImpl();

describe('VueRestoreTransformer cleanupPluginLocaleImport', () => {
  it('clears import { t } from tImport when restored', () => {
    const code = `<script setup lang="ts">
import { ref } from 'vue';
import { t } from '@/plugins/locale';
const msg = ref(t('k'));
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib, '@/plugins/locale');
    expect(out).not.toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/'你好'/);
  });

  it('strips only t from mixed named imports', () => {
    const code = `<script setup>
import { t, i18n } from '@/plugins/locale';
const msg = t('k');
console.log(i18n);
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib, '@/plugins/locale');
    expect(out).toMatch(/import\s*\{\s*i18n\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toMatch(/\bt\b\s*,/);
  });

  it('removes both useI18n leftover and module import', () => {
    const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const msg = t('k');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib, '@/plugins/locale');
    expect(out).not.toMatch(/import.*vue-i18n/);
    expect(out).not.toMatch(/useI18n\(\)/);
    expect(out).not.toMatch(/import\s*\{\s*t\s*\}/);
  });

  // 守卫：存在「locale 查不到、未被还原」的存活 t() 调用时，不得删除 import（否则未定义 t）
  it('keeps import { t } when an unresolvable t() call survives', () => {
    const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
const a = t('missing');
</script>`;
    // localeMap 不含 'missing' → 该调用无法还原，原样保留
    const out = VueRestoreTransformer.restoreVueFile(code, {}, lib, '@/plugins/locale');
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/t\('missing'\)/);
  });

  it('keeps import when one call resolves and another survives', () => {
    const code = `<script setup lang="ts">
import { t } from '@/plugins/locale';
const a = t('k');
const b = t('missing');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib, '@/plugins/locale');
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toContain('你好'); // 可还原的已替换
    expect(out).toMatch(/t\('missing'\)/); // 存活调用保留
  });

  it('keeps t in mixed named import when a t() call survives', () => {
    const code = `<script setup lang="ts">
import { t, i18n } from '@/plugins/locale';
const a = t('missing');
console.log(i18n);
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, {}, lib, '@/plugins/locale');
    // t 与 i18n 都应保留
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).toMatch(/import\s*\{[^}]*\bi18n\b[^}]*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });
});
