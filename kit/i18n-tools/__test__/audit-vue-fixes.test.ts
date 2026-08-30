import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { buildLocaleMessage } from '../src/utils/message-shape';
import { convertUnicodeToChineseInCode } from '../src/utils/string-escape';
import type { ExtractedString } from '../src/utils/types';

/**
 * 审计确认问题的回归用例（Vue 侧 + 共享 utils）。
 *
 * 每个用例都对应一个「实测能复现」的坏行为：整文件中止转换、运行时 this 为 undefined、
 * 删掉 <pre> 里的用户内容、引号打穿、locale 值丢字符。
 */
describe('审计修复回归（Vue / 共享 AST 层）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-audit-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const adapterOf = (): VueAdapter => new VueAdapter('@/plugins/locale', 'vue-i18n');

  /** extract → 编号 → transform 全链路，返回转换后源码与提取结果。 */
  async function generate(
    src: string,
  ): Promise<{ out: string; extracted: ExtractedString[]; localeMap: Record<string, string> }> {
    const adapter = adapterOf();
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const extracted = await adapter.getTextExtractor().extractFromFile(fp);
    extracted.forEach((s, i) => (s.semanticId = `k${i}`));
    const localeMap: Record<string, string> = {};
    for (const e of extracted) {
      localeMap[e.semanticId] = buildLocaleMessage(e, adapter.getLibrary());
    }
    const out = adapter.getTransformer().transform(fp, extracted, src);
    return { out, extracted, localeMap };
  }

  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, new VueI18nLibraryImpl(), '@/plugins/locale');

  // ── 1. script 模板字符串定位 ─────────────────────────────────────────────
  describe('P1 script 模板字符串按结构比对定位', () => {
    it('`${ count }` 插值内带空格时照常替换（此前整文件中止）', async () => {
      const { out, localeMap } = await generate(
        `<script setup>\nconst count = 1;\nconst msg = \`共 \${ count } 项\`;\n</script>\n`,
      );
      expect(out).toContain("t('k0', { count: count })");
      expect(out).not.toContain('共 ${');
      expect(localeMap.k0).toBe('共 {count} 项');
    });

    it('字面段含 `\\\\` 转义的模板串照常替换（此前 cooked 文本被二次解码而失配）', async () => {
      const { out, localeMap } = await generate(
        `<script setup>\nconst dir = 'x';\nconst p = \`路径C:\\\\to\\\\\${dir}中文\`;\n</script>\n`,
      );
      expect(out).toContain("t('k0', { dir: dir })");
      expect(out).not.toContain('路径C:');
      // locale 值是 cooked 形态：源码里的 `\\` 是一个反斜杠字符
      expect(localeMap.k0).toBe('路径C:\\to\\{dir}中文');
    });

    it('转换端复核与定位同源：多空格模板串不会「定位到却复核不过」', async () => {
      const { out } = await generate(
        `<script setup>\nconst a = 1, b = 2;\nconst m = \`第\${  a  }章 第\${b}节\`;\n</script>\n`,
      );
      // 单字母标识符是低信号名，占位符退到 value/value1（见 getVariableNameFromExpression）
      expect(out).toContain("t('k0', { value: a, value1: b })");
    });
  });

  // ── 2. Options API setup() 内不得注入 this.$t ────────────────────────────
  describe('P1 setup() 内不绑定 this', () => {
    it('export default { setup() {} } 内走裸 t()，methods 内仍走 this.$t', async () => {
      const { out } = await generate(
        `<script>\nexport default {\n  setup() {\n    const msg = '你好';\n    return { msg };\n  },\n  methods: {\n    greet() {\n      return '早上好';\n    },\n  },\n};\n</script>\n`,
      );
      expect(out).toContain("const msg = t('k0')");
      expect(out).not.toContain("this.$t('k0')");
      expect(out).toContain("this.$t('k1')");
      // 裸 t 需要模块级 import 兜底
      expect(out).toContain("import { t } from '@/plugins/locale'");
    });

    it('defineComponent({ setup() {} }) 同样走裸 t()', async () => {
      const { out } = await generate(
        `<script>\nimport { defineComponent } from 'vue';\nexport default defineComponent({\n  setup() {\n    return { msg: '你好' };\n  },\n});\n</script>\n`,
      );
      expect(out).toContain("t('k0')");
      expect(out).not.toContain('this.$t');
    });

    it('setup: function () {} 形态同样走裸 t()', async () => {
      const { out } = await generate(
        `<script>\nexport default {\n  setup: function () {\n    return { msg: '你好' };\n  },\n};\n</script>\n`,
      );
      expect(out).toContain("t('k0')");
      expect(out).not.toContain('this.$t');
    });

    it('不误伤：用户自己类里名为 setup 的方法仍走 this.$t', async () => {
      const { out } = await generate(
        `<script>\nclass Runner {\n  setup() {\n    return '你好';\n  }\n}\nexport default { components: {}, mounted() { new Runner(); } };\n</script>\n`,
      );
      expect(out).toContain("this.$t('k0')");
    });
  });

  // ── 3. restore / generate 的清理不得越出 script 块 ───────────────────────
  describe('P1 清理限定在 script 块内', () => {
    const preSfc = [
      '<template>',
      '  <pre>',
      "import { t } from '@/plugins/locale'",
      'const { t } = useI18n()',
      '  </pre>',
      '</template>',
      '<script setup>',
      "import { t } from '@/plugins/locale';",
      "const msg = t('k0');",
      '</script>',
      '',
    ].join('\n');

    it('restore 不删 <pre> 内的 import / hook 声明字样', () => {
      const out = restore(preSfc, { k0: '你好' });
      // 用户内容原样保留
      expect(out).toContain("<pre>\nimport { t } from '@/plugins/locale'\nconst { t } = useI18n()");
      // script 块内的注入被清理
      expect(out).toContain("const msg = '你好'");
      expect(out.split("import { t } from '@/plugins/locale'").length - 1).toBe(1);
    });

    it('restore 清理 hook 声明时也不动 <pre>（useI18n 库导入同理）', () => {
      const src = [
        '<template>',
        '  <pre>const { t } = useI18n()</pre>',
        '</template>',
        '<script setup>',
        "import { useI18n } from 'vue-i18n';",
        'const { t } = useI18n();',
        "const msg = t('k0');",
        '</script>',
        '',
      ].join('\n');
      const out = restore(src, { k0: '你好' });
      expect(out).toContain('<pre>const { t } = useI18n()</pre>');
      expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
      expect(out).toContain("const msg = '你好'");
    });

    it('generate 的占位 declare 清理不动 <pre> 内同形文本', async () => {
      const src = [
        '<template>',
        '  <pre>declare const t: (k: string) => string;',
        'void t;</pre>',
        '</template>',
        '<script setup>',
        'declare const t: (k: string) => string;',
        'void t;',
        "const msg = '你好';",
        '</script>',
        '',
      ].join('\n');
      const { out } = await generate(src);
      expect(out).toContain('<pre>declare const t: (k: string) => string;\nvoid t;</pre>');
      // script 块内的占位声明被清掉，只剩 <pre> 里那一份
      expect(out.split('void t;').length - 1).toBe(1);
      expect(out).toContain("const msg = t('k0')");
    });
  });

  // ── 4. 单引号属性值的引号选择（双向）────────────────────────────────────
  describe('P2 属性外层引号感知', () => {
    it('generate：外层单引号属性内的 key 用双引号，不打穿', async () => {
      const { out } = await generate(
        `<template>\n  <span :title='flag ? "中文" : "b"'></span>\n</template>\n`,
      );
      expect(out).toContain(`:title='flag ? $t("k0") : "b"'`);
      expect(out).not.toContain(`$t('k0')`);
    });

    it('generate：外层双引号属性维持单引号 key（无回归）', async () => {
      const { out } = await generate(
        `<template>\n  <span :title="flag ? '中文' : 'b'"></span>\n</template>\n`,
      );
      expect(out).toContain(`:title="flag ? $t('k0') : 'b'"`);
    });

    it('restore：外层单引号属性内的 $t 还原为双引号字符串', () => {
      const src = `<template>\n  <span :title='cond ? $t("k0") : "x"'></span>\n</template>\n`;
      const out = restore(src, { k0: '文本' });
      expect(out).toContain(`:title='cond ? "文本" : "x"'`);
      expect(out).not.toContain("'文本'");
    });

    it('restore：外层双引号属性内仍还原为单引号字符串（无回归）', () => {
      const src = `<template>\n  <span :title="cond ? $t('k0') : 'x'"></span>\n</template>\n`;
      const out = restore(src, { k0: '文本' });
      expect(out).toContain(`:title="cond ? '文本' : 'x'"`);
    });

    it('单引号属性 generate→restore 往返回到原文', async () => {
      const src = `<template>\n  <span :title='flag ? "中文" : "b"'></span>\n</template>\n`;
      const { out, localeMap } = await generate(src);
      expect(restore(out, localeMap)).toBe(src);
    });
  });

  // ── 5. 首尾 &nbsp; 不被吞 ───────────────────────────────────────────────
  describe('P2 排版空白不被 trim 吞掉', () => {
    it('文本节点首尾 &nbsp; 进入 locale 值且往返不丢', async () => {
      const src = '<template>\n  <span>&nbsp;你好&nbsp;</span>\n</template>\n';
      const { out, localeMap } = await generate(src);
      expect(localeMap.k0).toBe('\u00A0你好\u00A0');
      expect(out).toContain("<span>{{ $t('k0') }}</span>");
      // 还原后 nbsp 仍在（实体解码后的等价形式）
      expect(restore(out, localeMap)).toContain('<span>\u00A0你好\u00A0</span>');
    });

    it('静态属性值首尾 &nbsp; 同样保留', async () => {
      const { localeMap } = await generate(
        '<template>\n  <span title="&nbsp;你好"></span>\n</template>\n',
      );
      expect(localeMap.k0).toBe('\u00A0你好');
    });

    it('ASCII 缩进/换行照常被 trim（无回归）', async () => {
      const { localeMap } = await generate(
        '<template>\n  <div>\n    你好\n  </div>\n</template>\n',
      );
      expect(localeMap.k0).toBe('你好');
    });
  });

  // ── 6. 同行双 script 块 ────────────────────────────────────────────────
  describe('P2 同行 </script><script setup> 边界', () => {
    it('两块的字符串各归各块，不重复替换、不抛 Debug Failure', async () => {
      const src =
        `<script>export default { name: 'C', mounted() { this.x = '中一'; } };</script>` +
        `<script setup>const b = '中二';</script>\n`;
      const { out } = await generate(src);
      expect(out).toContain("this.$t('k0')");
      expect(out).toContain("const b = t('k1')");
      expect(out).not.toContain('中一');
      expect(out).not.toContain('中二');
    });
  });

  // ── 7. buildLocaleMessage 不误剥普通字符串的反引号 ─────────────────────
  describe('P2 locale 值定稿不误剥定界符', () => {
    it("内容整体被反引号包裹的普通字符串保真（'`代码`'）", () => {
      const message = buildLocaleMessage({
        original: '`代码`',
        isTemplateString: false,
      } as ExtractedString);
      expect(message).toBe('`代码`');
    });

    it('合成 backtick 模板（无变量）仍被剥定界符', () => {
      const message = buildLocaleMessage({
        original: '`共3项`',
        isTemplateString: true,
      } as ExtractedString);
      expect(message).toBe('共3项');
    });

    it("script 里 '`代码`' 全链路 locale 值不丢反引号", async () => {
      const { localeMap } = await generate("<script setup>\nconst tip = '`代码`';\n</script>\n");
      expect(localeMap.k0).toBe('`代码`');
    });
  });

  // ── 8. string-escape ───────────────────────────────────────────────────
  describe('P2 convertUnicodeToChineseInCode 的转义反斜杠', () => {
    it('字面 `\\\\u4e2d`（转义反斜杠 + u4e2d）不被误解码', () => {
      const code = "const a = '\\\\u4e2d';";
      expect(convertUnicodeToChineseInCode(code)).toBe(code);
    });

    it('真正的 \\u4e2d 仍被解码', () => {
      expect(convertUnicodeToChineseInCode("const a = '\\u4e2d\\u6587';")).toBe(
        "const a = '中文';",
      );
    });

    it('混合形态：转义反斜杠保留、真转义解码', () => {
      expect(convertUnicodeToChineseInCode("const a = '\\\\\\u4e2d';")).toBe("const a = '\\\\中';");
    });
  });
});
