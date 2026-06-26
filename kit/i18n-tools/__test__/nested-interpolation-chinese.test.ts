import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * 端到端回归：`操作失败：${cond ? '内部错误' : '网络异常'}` 这类模板字符串，整段会被
 * 占位符化为 `操作失败：{value}`，三元里的中文分支既不提取、也不内联，而是作为运行时
 * 参数原样塞进 {value}——切到非源语种后渲染未翻译中文（静默泄漏）。
 *
 * 修复后：提取阶段把这些嵌套中文记入 CommonASTUtils.skippedNestedChinese，
 * 供 lint / doctor 显式告警（nested-interpolation-chinese）。
 */
describe('提取：插值表达式内嵌套中文记入诊断（nested-interpolation-chinese）', () => {
  let tmpDir: string;

  beforeEach(() => {
    // 清空收集器，避免跨用例污染（drain 是消耗性操作）。
    CommonASTUtils.drainSkippedNestedChinese();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-nested-cn-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeVue = (name: string, content: string): string => {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, content);
    return file;
  };

  it('script 段模板字符串：三元中文分支被记录，且未泄漏进提取文案占位符', async () => {
    const file = writeVue(
      'A.vue',
      `<template><div>占位</div></template>
<script setup lang="ts">
const handle = () => {
  emit('error', \`操作失败：\${status === 'x' ? '内部错误' : '网络异常'}\`);
};
</script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    // 模板字符串被提取为占位符形态：中文分支只保留在 original（源码匹配用），
    // 不会各自生成 locale key（被整体占位符 {value} 吞掉）。
    const tmpl = result.find((r) => r.isTemplateString);
    expect(tmpl).toBeTruthy();
    // 不存在以 '内部错误' / '网络异常' 为独立提取项的 key（证明它们没被单独 i18n 化）
    expect(result.some((r) => !r.isTemplateString && r.original === '内部错误')).toBe(false);
    expect(result.some((r) => !r.isTemplateString && r.original === '网络异常')).toBe(false);

    // 关键：两个中文分支被记入诊断集合（不再静默）
    const drained = CommonASTUtils.drainSkippedNestedChinese();
    const texts = drained.map((d) => d.text).sort();
    expect(texts).toEqual(['内部错误', '网络异常']);
    // 位置信息可用于 IDE 跳转
    expect(drained[0]!.filePath).toBe(file);
    expect(drained[0]!.line).toBeGreaterThan(0);
  });

  it('三元为纯变量（无嵌套中文）：不记录、不产生噪声', async () => {
    const file = writeVue(
      'B.vue',
      `<template><div>占位</div></template>
<script setup lang="ts">
const handle = () => {
  emit('error', \`提示：\${ok ? okMsg : errMsg}\`);
};
</script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    await extractor.extractFromFile(file);

    expect(CommonASTUtils.drainSkippedNestedChinese()).toEqual([]);
  });
});
