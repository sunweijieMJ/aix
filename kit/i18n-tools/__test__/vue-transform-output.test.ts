import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';
import type { VueI18nLibraryType } from '../src/strategies/vue/libraries';

/**
 * Vue transform 输出断言（此前 boundary-matrix.test.ts 仅断言"提取了什么"，从不验证
 * 生成的 $t 绑定文本）。重点补 round-trip 测不到的两条：
 *  - Options API `this.$t`（非 setup <script> 块 + isInThisBindableScope）
 *  - vue-i18next 命名空间发射 `$t('ns:key')`（generateTemplateReplacement: ns 前缀）
 * 外加模板/脚本各上下文的输出形状断言。
 */
describe('Vue transform 输出', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-tf-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(
    src: string,
    opts: { lib?: VueI18nLibraryType; namespace?: string } = {},
  ): Promise<string> {
    const adapter = new VueAdapter(
      '@/plugins/locale',
      opts.lib ?? 'vue-i18n',
      opts.namespace ? { namespace: opts.namespace } : {},
    );
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it('文本节点 → {{ $t(key) }}，原始中文被替换', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`);
    expect(out).toContain("{{ $t('k0') }}");
    expect(out).not.toContain('>提交<');
  });

  it('静态属性 → :attr="$t(key)"', async () => {
    const out = await transformVue(
      `<template>\n  <el-button title="确认">x</el-button>\n</template>\n`,
    );
    expect(out).toContain(':title="$t(\'k0\')"');
    expect(out).not.toContain('title="确认"');
  });

  it('script setup 字面量 → 裸 t(key) + 注入模块 import（非 useI18n hook）', async () => {
    // generate 对 <script setup> 走「模块 import」路径而非 useI18n hook
    // （见 VueRestoreTransformer 注释 / vue-setup-import-strategy.test.ts）
    const out = await transformVue(
      `<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
    );
    expect(out).toContain("t('k0')");
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toContain("'你好'");
  });

  it('Options API <script> 方法体 → this.$t(key)', async () => {
    const out = await transformVue(
      `<script>\nexport default {\n  methods: {\n    greet() {\n      return '你好';\n    },\n  },\n};\n</script>\n`,
    );
    expect(out).toContain("this.$t('k0')");
    expect(out).not.toContain("'你好'");
  });

  it('vue-i18next：命名空间前缀发射 $t(ns:key)', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`, {
      lib: 'vue-i18next',
      namespace: 'app',
    });
    expect(out).toContain("$t('app:k0')");
  });
});
