import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';

/**
 * 回归（三轮审计 #2，medium，产物非法 JS）：动态属性 / 插值表达式以语句上下文解析
 * （parseSourceFile），`:config="{ '提示信息': msg }"` 被 TS 当 Block 而非对象字面量，
 * 且该路径未走 isExtractableStringLiteral（缺对象 key / import 排除）。于是中文对象 KEY
 * 被当可见文案提取，转换后产出 `{ $t('...'): msg }`（非法 JS）+ 孤儿 key。
 *
 * 修复：动态属性 / 插值表达式改用表达式上下文解析，并统一经 isExtractableStringLiteral
 * 排除对象 key / 导入路径，与 script 段、React 端口径一致。
 */
describe('VueTextExtractor 动态属性/插值：中文对象 key 不被误提取（审计三轮 #2）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-vue-objkey-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const extract = async (content: string) => {
    const file = path.join(tmpDir, 'A.vue');
    fs.writeFileSync(file, content);
    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    return extractor.extractFromFile(file);
  };

  it('动态属性内联对象字面量的中文 KEY 不被提取', async () => {
    const result = await extract(
      `<template><el-table :config="{ '提示信息': msg, '标题': title }" /></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).not.toContain('提示信息');
    expect(originals).not.toContain('标题');
  });

  it('插值内联对象字面量的中文 KEY 不被提取', async () => {
    const result = await extract(
      `<template><div>{{ { '错误': err }[code] }}</div></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).not.toContain('错误');
  });

  it('控制用例：绑定到中文字符串字面量的属性值仍被提取', async () => {
    const result = await extract(
      `<template><my-input :label="'请输入姓名'" /></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).toContain('请输入姓名');
  });
});
