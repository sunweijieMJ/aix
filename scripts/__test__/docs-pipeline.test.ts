import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import type { Exemptions } from '../docs/exemptions';
import { collectPackageApis } from '../docs/pipeline';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/repo');

const exemptions: Exemptions = {
  nonComponentPackages: new Set(['plain']),
  handwrittenApiPackages: new Set(),
  componentDocPending: new Set(),
  externalPropsComponents: new Map([
    ['external/src/ExternalNode.vue', 'Props 由上游注入，业务侧不直接传。'],
  ]),
};

describe('collectPackageApis', () => {
  it('解析成功的包进 packages，声明无组件的包进 withoutComponents，其余进 failures', async () => {
    const result = await collectPackageApis({ root: repo, exemptions });

    expect(result.packages.map((p) => p.dirName).sort()).toEqual(['demo', 'external']);
    expect(result.withoutComponents).toEqual(['plain']);
    expect(result.failures.map((f) => f.dirName)).toEqual(['orphan']);
    expect(result.failures[0]!.message).toContain('没有导出任何 .vue 组件');
  });

  it('packageDir 是绝对路径，api.package 取 package.json 的 name', async () => {
    const { packages } = await collectPackageApis({ root: repo, exemptions });
    const demo = packages.find((p) => p.dirName === 'demo')!;
    expect(path.isAbsolute(demo.packageDir)).toBe(true);
    expect(demo.api.package).toBe('@fixture/demo');
    expect(demo.api.components.map((c) => c.name)).toEqual(['DemoCard']);
  });

  it('已登记的外部 props 组件带 propsNote 代替 Props 表', async () => {
    const { packages } = await collectPackageApis({ root: repo, exemptions });
    const external = packages.find((p) => p.dirName === 'external')!;
    expect(external.api.components[0]!.propsNote).toBe('Props 由上游注入，业务侧不直接传。');
    expect(external.api.components[0]!.props).toEqual([]);
  });

  it('未登记的外部 props 组件让整个包进 failures 而不进 packages', async () => {
    const result = await collectPackageApis({
      root: repo,
      exemptions: { ...exemptions, externalPropsComponents: new Map() },
    });
    expect(result.packages.map((p) => p.dirName)).toEqual(['demo']);
    expect(result.failures.map((f) => f.dirName).sort()).toEqual(['external', 'orphan']);
    expect(result.failures.find((f) => f.dirName === 'external')!.message).toContain(
      'COMPONENTS_WITH_EXTERNAL_PROPS',
    );
  });

  it('packages 与 failures 互斥', async () => {
    const result = await collectPackageApis({ root: repo, exemptions });
    const ok = new Set(result.packages.map((p) => p.dirName));
    for (const failure of result.failures) expect(ok.has(failure.dirName)).toBe(false);
  });

  it('类型定义只收 src/types.ts 里经入口再导出、且未渲染成表的类型', async () => {
    const { packages } = await collectPackageApis({ root: repo, exemptions });
    const demo = packages.find((p) => p.dirName === 'demo')!;
    expect(demo.api.types.map((t) => t.name)).toEqual(['DemoSize', 'DemoItem']);
    expect(demo.api.types[0]).toEqual({
      name: 'DemoSize',
      kind: 'type',
      text: "/** 尺寸档位 */\nexport type DemoSize = 'sm' | 'lg';",
    });
  });

  it('对象字面量 defineExpose 命中 <组件名>Expose 接口时，该接口也不进类型定义', async () => {
    const { packages } = await collectPackageApis({ root: repo, exemptions });
    const demo = packages.find((p) => p.dirName === 'demo')!;
    expect(demo.api.components[0]!.expose.map((m) => m.name)).toEqual(['focus']);
    expect(demo.api.types.some((t) => t.name === 'DemoCardExpose')).toBe(false);
  });

  it('没有 packages 目录时抛错', async () => {
    await expect(collectPackageApis({ root: path.join(repo, 'docs') })).rejects.toThrow(
      'packages/*/package.json',
    );
  });
});
