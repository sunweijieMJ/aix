import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';
import { ReactTextExtractor } from '../src/strategies/react/ReactTextExtractor';
import { CommonASTUtils } from '../src/utils/common-ast-utils';
import { LoggerUtils } from '../src/utils/logger';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { VueAdapter } from '../src/adapters/VueAdapter';

/**
 * 提取阶段的边界回归集合，覆盖：
 *   - HTML 文本 + 插值复合句整体提取
 *   - 插值表达式内嵌套中文记入诊断
 *   - 含 HTML 标签的模板字符串跳过提取（Vue + React）
 *   - <code>/<pre> 内容不提取（Vue + React）
 *   - 计算属性访问的中文 key 不误提取（Vue + React）
 */

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
      const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(warnings.some((m: string) => m.includes('HTML 标签的模板字符串'))).toBe(true);
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
      const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(warnings.some((m: string) => m.includes('HTML 标签的模板字符串'))).toBe(true);
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

    it('跳过 HTML 模板时 warning 同步进入 drainWarnings 缓冲区', async () => {
      const file = path.join(tmpDir, 'Demo.vue');
      fs.writeFileSync(
        file,
        `<template><div /></template>
<script setup>
const html = \`<div><span>提示</span></div>\`;
</script>`,
      );

      const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
      await extractor.extractFromFile(file);

      const warnings = extractor.drainWarnings();
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('HTML 标签的模板字符串');
      // drain 后缓冲区应清空，幂等回放
      expect(extractor.drainWarnings()).toHaveLength(0);
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
      const warnings = warnSpy.mock.calls.map((c: unknown[]) => String(c[0]));
      expect(warnings.some((m: string) => m.includes('HTML 标签的模板字符串'))).toBe(true);
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

/**
 * <code> / <pre> 内容是逐字代码 / 预格式文本，不应被提取（含整棵子树）。
 * 兄弟节点的正常中文照常提取。覆盖 Vue 模板与 React JSX。
 * 复现来源：apps/client demo 里 `<code>&lt;script setup&gt;</code>` 被提取成孤儿 key。
 */
describe('<code> / <pre> 内容不提取', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-pre-skip-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function originals(adapter: ReactAdapter | VueAdapter, name: string, code: string) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, code);
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    return strings.map((s) => s.original);
  }

  it('React：<code> 内容跳过，句中中文照常提取', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const out = await originals(
      adapter,
      'r.tsx',
      `export default function P() {\n  return <p>校验 <code>&lt;script setup&gt;</code> 用法</p>;\n}\n`,
    );
    expect(out).toContain('校验');
    expect(out).toContain('用法');
    expect(out.some((o) => o.includes('script setup'))).toBe(false);
  });

  it('React：<pre> 整段跳过，兄弟中文保留', async () => {
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    const out = await originals(
      adapter,
      'r2.tsx',
      `export default function P() {\n  return (\n    <div>\n      <pre>const x = '示例代码';</pre>\n      <span>说明文字</span>\n    </div>\n  );\n}\n`,
    );
    expect(out).toContain('说明文字');
    expect(out.some((o) => o.includes('示例代码'))).toBe(false);
  });

  it('Vue：<code> 内容跳过，兄弟中文照常提取', async () => {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n');
    const out = await originals(
      adapter,
      'v.vue',
      `<template>\n  <p>查看 <code>&lt;script setup&gt;</code> 写法<span>标题</span></p>\n</template>\n`,
    );
    expect(out).toContain('查看');
    expect(out).toContain('写法');
    expect(out).toContain('标题');
    expect(out.some((o) => o.includes('script setup'))).toBe(false);
  });
});

/**
 * 回归：计算属性访问的中文字面量 key（`map['进行中']`）不应被提取。
 *
 * 根因：isExtractableStringLiteral 排除了对象字面量定义 key（`{ '进行中': x }`）、
 * import 路径、比较/case 操作数，但未排除 ElementAccessExpression 的实参字面量。
 * 于是访问侧 `map['进行中']` 被当可见文案提取替换为 `map[t(...)]`，运行时返回译文，
 * 与定义侧（已被保留的 `{ '进行中': x }`）不匹配，查找落空——与 === 操作数同类不对称风险。
 *
 * 修复：isExtractableStringLiteral 增加 ElementAccessExpression 实参排除。
 */
describe('计算属性访问的中文 key 不被误提取', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-elem-access-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Vue <script>：map['中文'] 的 key 不被提取", async () => {
    const file = path.join(tmpDir, 'A.vue');
    fs.writeFileSync(
      file,
      `<template><div /></template>
<script setup>
const statusMap = { '进行中': 'green' };
const color = statusMap['进行中'];
</script>`,
    );
    const result = await new VueTextExtractor({ name: 'vue-i18n' } as never).extractFromFile(file);
    expect(result.map((r) => r.original)).not.toContain('进行中');
  });

  it("React .tsx：map['中文'] 的 key 不被提取", async () => {
    const file = path.join(tmpDir, 'A.tsx');
    fs.writeFileSync(
      file,
      `export function f(statusMap: Record<string, string>) {
  return statusMap['进行中'];
}`,
    );
    const result = await new ReactTextExtractor().extractFromFile(file);
    expect(result.map((r) => r.original)).not.toContain('进行中');
  });

  it('控制用例：普通中文展示文案仍被提取', async () => {
    const file = path.join(tmpDir, 'B.tsx');
    fs.writeFileSync(
      file,
      `export function f() {
  const title = '请输入姓名';
  return title;
}`,
    );
    const result = await new ReactTextExtractor().extractFromFile(file);
    expect(result.map((r) => r.original)).toContain('请输入姓名');
  });
});
