import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import type { ExtractedString } from '../src/utils/types';

/**
 * 表格驱动「边界矩阵」回归测试
 * ---------------------------------------------------------------------------
 * 目的：把 i18n 提取/替换的缺陷面 = 框架 × i18n库 × 文本形态 铺成一张表，
 *       用数据行而非「再开一轮人工 review」来兜住长尾边界 case。
 *
 * 新增边界 = 往 CASES 里加一行，而不是新建一个测试文件。
 *
 * 每一行声明输入源码 + 期望：
 *   - extracts      ：这些中文【必须】被提取出来（漏提取 = 线上残留中文）
 *   - notExtracts   ：这些【不应】被提取（误提取 = 污染 locale）
 *   - outContains   ：transform 输出【必须】包含（字符串或正则）
 *   - outNotContains：transform 输出【不应】包含（残留原文 = 替换失败）
 *
 * 历史 Bug 用例以 `// BUG:<id>` 标注，便于追溯。
 */

type VueLib = 'vue-i18n' | 'vue-i18next';
type ReactLib = 'react-i18next' | 'react-intl';

interface MatrixCase {
  id: string;
  framework: 'vue' | 'react';
  library: VueLib | ReactLib;
  ext: string;
  input: string;
  extracts?: string[];
  notExtracts?: string[];
  outContains?: (string | RegExp)[];
  outNotContains?: (string | RegExp)[];
}

const T_IMPORT = '@/plugins/locale';

/** 提取 → 赋稳定 semanticId → 转换。模拟 generate 主流程（跳过 LLM）。 */
async function generate(
  c: MatrixCase,
  dir: string,
): Promise<{ strings: ExtractedString[]; output: string }> {
  const file = path.join(dir, `${c.id}.${c.ext}`);
  fs.writeFileSync(file, c.input);
  const adapter =
    c.framework === 'vue'
      ? new VueAdapter(T_IMPORT, c.library as VueLib)
      : new ReactAdapter(T_IMPORT, c.library as ReactLib);
  const strings = await adapter.getTextExtractor().extractFromFile(file);
  strings.forEach((s, i) => (s.semanticId = `views.M.${c.id}_${i}`));
  const output = adapter.getTransformer().transform(file, strings, c.input);
  return { strings, output };
}

const CASES: MatrixCase[] = [
  // ───────────── Vue · 纯文本节点 ─────────────
  {
    id: 'vue_plain_text',
    framework: 'vue',
    library: 'vue-i18n',
    ext: 'vue',
    input: `<template><div>版权所有规则</div></template>\n`,
    extracts: ['版权所有规则'],
    outContains: [/\$t\(/],
    outNotContains: ['版权所有规则'],
  },
  {
    // BUG:B1 — 文本节点含 HTML 实体时，content 被解码导致 indexOf 在原始源里匹配失败
    id: 'vue_html_entity',
    framework: 'vue',
    library: 'vue-i18n',
    ext: 'vue',
    input: `<template><div>版权&copy;所有规则</div></template>\n`,
    outContains: [/\$t\(/],
    // 关键断言：替换后不得残留原始（含实体）中文整段
    outNotContains: ['版权&copy;所有规则'],
  },
  {
    // BUG:B2 — 技术属性名前缀匹配误杀（forecast 命中 'for'）
    id: 'vue_attr_prefix_forecast',
    framework: 'vue',
    library: 'vue-i18n',
    ext: 'vue',
    input: `<template><div forecast="预报内容" placeholder="占位提示"></div></template>\n`,
    extracts: ['预报内容', '占位提示'],
  },
  {
    // 真技术属性仍应被跳过（防止过度修正）
    id: 'vue_attr_true_technical',
    framework: 'vue',
    library: 'vue-i18n',
    ext: 'vue',
    input: `<template><div for="field-id" type="button" placeholder="占位提示"></div></template>\n`,
    extracts: ['占位提示'],
    notExtracts: ['field-id', 'button'],
  },

  // ───────────── React · 作用域判定 ─────────────
  {
    // PascalCase 组件返回 JSX：应注入 useTranslation hook（既有正确行为，防回归）
    id: 'react_pascal_component',
    framework: 'react',
    library: 'react-i18next',
    ext: 'tsx',
    input: `export default function Panel() {\n  return <div title="中文标题">x</div>;\n}\n`,
    outContains: [/useTranslation\(/, /\bt\(/],
  },
  {
    // BUG:B4 — 模块顶层小写函数返回 JSX，被判 function 作用域 → 裸 t() 但不注入 import
    id: 'react_lowercase_helper',
    framework: 'react',
    library: 'react-i18next',
    ext: 'tsx',
    input: `const renderHeader = () => <div title="中文标题">x</div>;\nexport default renderHeader;\n`,
    // 关键断言：若输出引用 t(，必须同时存在 t 的声明（import { t } 或 useTranslation）
    outContains: [/\bt\(/, /import\s*\{[^}]*\bt\b[^}]*\}|useTranslation\(/],
  },
  {
    // 非组件普通工具函数（既有正确行为，防回归）：注入 import { t }
    id: 'react_plain_fn',
    framework: 'react',
    library: 'react-i18next',
    ext: 'ts',
    input: `export const greeting = (): string => '你好欢迎';\n`,
    outContains: [/import\s*\{\s*t\s*\}\s*from/, /\bt\(/],
    outNotContains: ['你好欢迎'],
  },
  {
    // BUG:#1 — export default class 组件 HOC 注入须改产出 `export default HOC(...)`，
    // 不得遗留孤立 `default class`（语法错误，整文件无法编译）。title 属性触发 HOC。
    id: 'react_export_default_class',
    framework: 'react',
    library: 'react-i18next',
    ext: 'tsx',
    input: `export default class Foo extends React.Component {\n  render() { return <div title="中文标题">x</div>; }\n}\n`,
    outContains: [/export default withTranslation\(\)\(/],
    // 关键断言：不得出现孤立的 `default class`（删 export 时遗留 default 关键字）
    outNotContains: [/default\s+class/],
  },
  {
    // BUG:#3 — PureComponent 类组件注入 this.props.t 后，类型增广须同样追加 WithTranslation，
    // 否则 this.props.t 类型检查失败。
    id: 'react_pure_component_type',
    framework: 'react',
    library: 'react-i18next',
    ext: 'tsx',
    input: `export class Foo extends React.PureComponent {\n  render() { return <div title="中文标题">x</div>; }\n}\n`,
    outContains: [/PureComponent<WithTranslation>/],
  },
  {
    // BUG:#4 — 单参 useEffect（无依赖数组 = 每次渲染执行）体内用到 t 时，不得擅自补 `, [t]`
    // （会把语义改成「仅 t 变化时」且 restore 不可逆）。title 触发 hook 注入，使 t 进入作用域。
    id: 'react_single_arg_effect_no_deps',
    framework: 'react',
    library: 'react-i18next',
    ext: 'tsx',
    input: `export default function Panel() {\n  useEffect(() => { notify('保存成功'); });\n  return <div title="中文标题">x</div>;\n}\n`,
    outContains: [/useTranslation\(/],
    // 关键断言：单参 effect 不应被补依赖数组 [t]
    outNotContains: [/\[t\]/],
  },
];

describe('边界矩阵：框架 × i18n库 × 文本形态（提取↔替换对称性）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-matrix-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(CASES.map((c) => [c.id, c] as const))('[%s]', async (_id, c) => {
    const { strings, output } = await generate(c, dir);
    const extracted = strings.map((s) => s.original);

    for (const must of c.extracts ?? []) {
      expect(extracted, `应提取「${must}」，实际提取：${JSON.stringify(extracted)}`).toContain(
        must,
      );
    }
    for (const mustNot of c.notExtracts ?? []) {
      expect(extracted, `不应提取「${mustNot}」`).not.toContain(mustNot);
    }
    for (const needle of c.outContains ?? []) {
      if (needle instanceof RegExp) {
        expect(output, `输出应匹配 ${needle}\n实际输出：\n${output}`).toMatch(needle);
      } else {
        expect(output, `输出应包含「${needle}」\n实际输出：\n${output}`).toContain(needle);
      }
    }
    for (const needle of c.outNotContains ?? []) {
      if (needle instanceof RegExp) {
        expect(output, `输出不应匹配 ${needle}\n实际输出：\n${output}`).not.toMatch(needle);
      } else {
        expect(output, `输出不应残留「${needle}」\n实际输出：\n${output}`).not.toContain(needle);
      }
    }
  });
});
