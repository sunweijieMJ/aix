import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';

/**
 * 回归保护：HTML 模板里"文本节点 + 插值表达式"相邻序列应作为复合句整体提取，
 * 避免切碎产生 `全部(` + 硬编码 `)` 这种结构破坏。
 */
describe('VueTextExtractor — mixed-content（TEXT + INTERPOLATION 复合句）', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-mixed-content-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const writeVue = (name: string, content: string): string => {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, content);
    return file;
  };

  it('text+插值+text：括号闭合不脱出 i18n', async () => {
    const file = writeVue(
      'A.vue',
      `<template><div>全部({{ totalCount }})</div></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.templateContext).toBe('mixed-content');
    expect(result[0]!.original).toContain('全部(');
    expect(result[0]!.original).toContain('{{ totalCount }}');
    expect(result[0]!.original).toContain(')');
    expect(result[0]!.processedMessage).toBe('`全部(${totalCount})`');
    expect(result[0]!.templateVariables).toEqual(['totalCount']);
  });

  it('多插值：第 N 讲：', async () => {
    const file = writeVue(
      'B.vue',
      `<template><span>第{{ numberToChinese(sort) }}讲：</span></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.templateContext).toBe('mixed-content');
    expect(result[0]!.processedMessage).toBe('`第${numberToChinese(sort)}讲：`');
    expect(result[0]!.templateVariables).toEqual(['numberToChinese(sort)']);
  });

  it('插值在前：{{ progress }}%已学', async () => {
    const file = writeVue(
      'C.vue',
      `<template><span>{{ progress }}%已学</span></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    expect(result).toHaveLength(1);
    expect(result[0]!.templateContext).toBe('mixed-content');
    expect(result[0]!.processedMessage).toBe('`${progress}%已学`');
  });

  it('插值表达式含字符串字面量 → 拒绝合并，回退原路径（保留对嵌套中文字面量的独立提取）', async () => {
    const file = writeVue(
      'D.vue',
      `<template><div>结果：{{ ok ? '通过' : '未通过' }} ←</div></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    // 至少应该提取出 '通过' 和 '未通过' 两个中文字面量（来自三元）
    const originals = result.map((r) => r.original);
    expect(originals).toContain('通过');
    expect(originals).toContain('未通过');
    // 周边 TEXT '结果：' 与 '←' 走 text-node 路径（不合并为 mixed-content）
    expect(result.some((r) => r.templateContext === 'mixed-content')).toBe(false);
  });

  it('跨行：不合并（多行替换边界复杂，保留为后续工作）', async () => {
    const file = writeVue(
      'E.vue',
      `<template><div>
  全部(
  {{ totalCount }}
  )
</div></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    // 跨行场景下，至少 '全部(' 这一段会被按 text-node 单独提取
    expect(result.some((r) => r.original === '全部(' && r.templateContext === 'text-node')).toBe(
      true,
    );
    // 不会出现 mixed-content
    expect(result.some((r) => r.templateContext === 'mixed-content')).toBe(false);
  });

  it('组中无中文 → 不走 mixed-content（保留原插值路径行为）', async () => {
    const file = writeVue(
      'F.vue',
      `<template><div>{{ a }} / {{ b }}</div></template><script setup></script>`,
    );

    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    const result = await extractor.extractFromFile(file);

    expect(result.every((r) => r.templateContext !== 'mixed-content')).toBe(true);
  });

  it('rejectPatterns 命中合成 message → 拒收当前整组，但后续可重新组合', async () => {
    const file = writeVue(
      'G.vue',
      `<template><div>构建版本 {{ version }} 已就绪</div></template><script setup></script>`,
    );

    // 命中合成 message `\`构建版本 ${version} 已就绪\`` 中的"构建版本"
    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never, [/构建版本/]);
    const result = await extractor.extractFromFile(file);

    // 整组（含"构建版本"）被拒收后，剩余 INTERPOLATION + TEXT('已就绪') 可重新构成
    // 一个新的、不含被拒文本的 mixed-content。这是预期行为：rejectPatterns 只屏蔽
    // 命中片段，不强行连坐相邻可独立翻译的文本。
    expect(result.some((r) => r.original === '构建版本')).toBe(false);
    // 剩余部分若能形成 mixed-content，其 processedMessage 不应包含被拒片段
    const mixed = result.filter((r) => r.templateContext === 'mixed-content');
    for (const m of mixed) {
      expect(m.processedMessage).not.toContain('构建版本');
    }
  });
});
