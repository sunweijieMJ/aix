import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ReactAdapter } from '../src/adapters/ReactAdapter';
import { CommonASTUtils } from '../src/utils/common-ast-utils';

/**
 * 回归（三轮审计 #3）：JSX 混合内容（中文文本 + 插值表达式）路径
 * extractJsxMixedContent 对每个 `{expr}` 子节点只发 `${expr}` 占位，**不**做嵌套中文
 * 检测——而模板字面量路径会把三元/逻辑分支里的中文记入 skippedNestedChinese 供
 * lint/doctor 告警。于是 `<div>状态：{ok ? '成功' : '失败'}</div>` 里的「成功/失败」
 * 既不翻译也无任何诊断，运行时静默泄漏未翻译中文。
 *
 * 修复：JSX 混合内容路径与模板字面量路径对齐，对插值子节点里的嵌套中文调用
 * recordSkippedNestedChinese。
 */
describe('React JSX 混合内容插值中嵌套中文记入诊断（审计三轮 #3）', () => {
  let dir: string;
  beforeEach(() => {
    CommonASTUtils.drainSkippedNestedChinese();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'react-jsx-nested-cn-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const extract = async (code: string) => {
    const file = path.join(dir, 'C.tsx');
    fs.writeFileSync(file, code);
    const adapter = new ReactAdapter('@/plugins/locale', 'react-i18next');
    return adapter.getTextExtractor().extractFromFile(file);
  };

  it('三元分支中文被记录，且未各自生成独立 key', async () => {
    const code = `import React from 'react';
export function C({ ok }: { ok: boolean }) {
  return <div>状态：{ok ? '成功' : '失败'}</div>;
}
`;
    const strings = await extract(code);

    // 「成功」「失败」不应作为独立提取项各自生成 key（被整段占位符吞掉）
    expect(strings.some((s) => s.original === '成功')).toBe(false);
    expect(strings.some((s) => s.original === '失败')).toBe(false);

    // 关键：两个中文分支被记入诊断集合（不再静默泄漏）
    const drained = CommonASTUtils.drainSkippedNestedChinese();
    const texts = drained.map((d) => d.text).sort();
    expect(texts).toEqual(['失败', '成功']);
    expect(drained[0]!.filePath).toBe(path.join(dir, 'C.tsx'));
    expect(drained[0]!.line).toBeGreaterThan(0);
  });

  it('插值为纯变量（无嵌套中文）：不记录、不产生噪声', async () => {
    const code = `import React from 'react';
export function C({ name }: { name: string }) {
  return <div>欢迎：{name}</div>;
}
`;
    await extract(code);
    expect(CommonASTUtils.drainSkippedNestedChinese()).toEqual([]);
  });
});
