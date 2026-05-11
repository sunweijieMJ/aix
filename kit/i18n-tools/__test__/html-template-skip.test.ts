import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';
import { ReactTextExtractor } from '../src/strategies/react/ReactTextExtractor';
import { LoggerUtils } from '../src/utils/logger';

/**
 * 回归：含 HTML 标签的模板字符串应被拒绝整段提取（避免 innerHTML = `<div>...中文...</div>`
 * 这种写法把 HTML/CSS/SVG 灌进 locale value）。
 */
describe('TextExtractor — HTML 模板字符串跳过', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let tmpDir: string;

  beforeEach(() => {
    warnSpy = vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-html-skip-'));
  });

  afterEach(() => {
    warnSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Vue script', () => {
    it('NoSubstitutionTemplateLiteral 含 HTML + 中文 → 跳过提取并 warn', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const html = \`
  <div style="position:absolute"><span>上次学到了这里</span></div>
\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      const result = await extractor.extractFromFile(file);

      expect(result).toHaveLength(0);
      const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warnings.some((m) => m.includes('HTML 标签的模板字符串'))).toBe(true);
    });

    it('TemplateExpression（含 ${}）+ HTML + 中文 → 跳过提取并 warn', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const userName = 'Alice';
const html = \`<div class="hello">你好 \${userName}<span>欢迎</span></div>\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      const result = await extractor.extractFromFile(file);

      expect(result).toHaveLength(0);
      const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warnings.some((m) => m.includes('HTML 标签的模板字符串'))).toBe(true);
    });

    it('不含 HTML 的模板字符串正常提取（回归保护）', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const count = 5;
const msg = \`你有 \${count} 条新消息\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      const result = await extractor.extractFromFile(file);

      expect(result).toHaveLength(1);
      expect(result[0]?.original).toContain('你有');
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('含 HTML 但无中文的模板字符串不提取也不告警（保持现有行为）', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const html = \`<div><span>hello world</span></div>\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      const result = await extractor.extractFromFile(file);

      expect(result).toHaveLength(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('不等式 `<` 不应触发 HTML 检测（误伤防护）', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const x = 5;
const msg = \`当 x < 10 时显示\${x}\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      const result = await extractor.extractFromFile(file);

      // 不等式 `<` 后面是空格不是字母，不命中 HTML pattern，应正常提取
      expect(result).toHaveLength(1);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('React TS', () => {
    it('TS 文件中含 HTML 的模板字符串 → 跳过提取并 warn', async () => {
      const file = path.join(tmpDir, 'demo.ts');
      fs.writeFileSync(
        file,
        `export const html = \`
  <div style="position:absolute">
    <span>提示信息</span>
  </div>
\`;
`,
      );

      const extractor = new ReactTextExtractor();
      const result = await extractor.extractFromFile(file);

      expect(result).toHaveLength(0);
      const warnings = warnSpy.mock.calls.map((c) => String(c[0]));
      expect(warnings.some((m) => m.includes('HTML 标签的模板字符串'))).toBe(true);
    });

    it('不含 HTML 的模板字符串正常提取（回归保护）', async () => {
      const file = path.join(tmpDir, 'demo.ts');
      fs.writeFileSync(file, `const name = 'A'; export const greet = \`你好, \${name}\`;`);

      const extractor = new ReactTextExtractor();
      const result = await extractor.extractFromFile(file);

      expect(result.length).toBeGreaterThan(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
