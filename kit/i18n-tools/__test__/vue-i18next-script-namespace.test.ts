import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';

/**
 * 回归：vue-i18next 配置 namespace 时，generateTemplateReplacement 给 template $t() 加了
 * `namespace:key` 前缀，但 generateScriptReplacement 从不读 library.namespace，script 串
 * （script setup / Options API）产出裸 `t('key')` / `this.$t('key')`。当 namespace ≠ i18next
 * defaultNS 时，每个 script 提取串运行时解析失败（显示原始 key/fallback），而等价 template 串正常。
 *
 * 修复：generateScriptReplacement 与 template 对称地加 namespace 前缀。
 */
describe('Vue transform — vue-i18next namespace 前缀在 script 上下文同样生效', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-i18next-ns-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(src: string, namespace?: string): Promise<string> {
    const adapter = new VueAdapter(
      '@/plugins/locale',
      'vue-i18next',
      namespace ? { namespace } : {},
    );
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it("script setup 字面量 → t('<ns>:key')（与 template $t 对称带前缀）", async () => {
    const out = await transformVue(
      `<template>\n  <div>提交</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
      'common',
    );
    // template 历来带前缀
    expect(out).toMatch(/\$t\('common:k\d'\)/);
    // 修复点：script 也带前缀，不再是裸 t('k')
    expect(out).toMatch(/[^$]t\('common:k\d'\)/);
    expect(out).not.toMatch(/[^:]t\('k\d'\)/);
    expect(out).not.toContain("'你好'");
  });

  it("Options API 方法体 → this.$t('<ns>:key')", async () => {
    const out = await transformVue(
      `<script>\nexport default {\n  methods: {\n    greet() {\n      return '你好';\n    },\n  },\n};\n</script>\n`,
      'common',
    );
    expect(out).toMatch(/this\.\$t\('common:k\d'\)/);
    expect(out).not.toContain("'你好'");
  });

  it('未配置 namespace → script 保持裸 key（无前缀回归保护）', async () => {
    const out = await transformVue(
      `<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
    );
    expect(out).toMatch(/t\('k\d'\)/);
    expect(out).not.toContain(':k0');
  });
});
