import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import type { VueI18nLibraryType } from '../src/strategies/vue/libraries';

/**
 * Vue 完整回环：extract → transform → restore，断言还原后 === 原文（镜像 React 端
 * react-class-hoc-restore.test.ts 的 round-trip，此前 Vue 侧零覆盖）。
 *
 * 复刻已删除的 _harness.mts 的 localeMap 构建逻辑：generate 落盘语言文件用的就是
 * createMessageWithOptions + finalizeLocaleMessage，restore 必须能从同一份 locale 复原。
 */
describe('Vue extract→transform→restore 回环', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-rt-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function roundTrip(src: string, lib: VueI18nLibraryType = 'vue-i18n'): Promise<string> {
    const adapter = new VueAdapter('@/plugins/locale', lib);
    const extractor = adapter.getTextExtractor();
    const transformer = adapter.getTransformer();
    const restorer = adapter.getRestoreTransformer();
    const library = adapter.getLibrary();

    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');

    const extracted = await extractor.extractFromFile(fp);
    const localeMap: Record<string, string> = {};
    extracted.forEach((e, i) => {
      e.semanticId = 'k' + i;
      const raw = (e as { processedMessage?: string }).processedMessage || e.original;
      const built =
        e.isTemplateString && e.templateVariables
          ? CommonASTUtils.createMessageWithOptions(raw, e.templateVariables)
          : {
              message: raw.replace(/^['"`]|['"`]$/g, ''),
              placeholderMap: new Map<string, string>(),
            };
      localeMap[e.semanticId!] = CommonASTUtils.finalizeLocaleMessage(
        built.message,
        built.placeholderMap.values(),
        library,
      );
    });

    const transformed = transformer.transform(fp, extracted, src);
    fs.writeFileSync(fp, transformed, 'utf8');
    return restorer.transform(fp, localeMap);
  }

  // 这些上下文的回环应当无损（还原后逐字符等于原文）
  const lossless: Array<[string, string]> = [
    ['文本节点', `<template>\n  <div>提交</div>\n</template>\n`],
    ['静态属性', `<template>\n  <el-button title="确认">x</el-button>\n</template>\n`],
    ['三元插值', `<template>\n  <div>{{ ok ? '成功' : '失败' }}</div>\n</template>\n`],
    [
      '动态属性三元',
      `<template>\n  <el-tag :title="ok ? '进行' : '停止'">x</el-tag>\n</template>\n`,
    ],
    [
      'script setup 字面量',
      `<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
    ],
    [
      'Options API this.$t',
      `<script>\nexport default {\n  methods: {\n    greet() {\n      return '你好';\n    },\n  },\n};\n</script>\n`,
    ],
    // HTML 实体文本节点：&lt;/&gt;/&amp; 解码进 locale 值后，restore 写回静态文本节点时
    // 必须重新转义（否则 <code> 变成真元素、& 被当实体）。仅这三个实体是可逆的，故可做
    // 无损断言；&copy;/&nbsp; 解码有损不在此列。回归 VueRestoreTransformer.escapeTemplateText。
    [
      'HTML 实体文本节点',
      `<template>\n  <div>条款 &lt;code&gt; 与 &amp; 符号说明</div>\n</template>\n`,
    ],
  ];

  for (const [label, src] of lossless) {
    it(`无损回环：${label}`, async () => {
      const restored = await roundTrip(src);
      expect(restored.trim()).toBe(src.trim());
    });
  }

  // 混合内容（文本 + 插值）：还原后结构可能与原文有空白差异，但绝不能丢数据——
  // 必须复原中文且不残留 $t() 调用。
  it('混合内容不丢数据（中文复原 + 无 $t 残留）', async () => {
    const src = `<template>\n  <div>全部({{ totalCount }})</div>\n</template>\n`;
    const restored = await roundTrip(src);
    expect(restored).toContain('全部');
    expect(restored).toContain('totalCount');
    expect(restored).not.toContain('$t(');
  });

  it('vue-i18next 回环：文本节点无损', async () => {
    const src = `<template>\n  <div>提交</div>\n</template>\n`;
    const restored = await roundTrip(src, 'vue-i18next');
    expect(restored.trim()).toBe(src.trim());
  });
});
