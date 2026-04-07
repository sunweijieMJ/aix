import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ToolPackageExtractor } from '../src/extractors/tool-package-extractor';

describe('ToolPackageExtractor', () => {
  const kitDir = join(process.cwd(), '../../kit');
  const internalDir = join(process.cwd(), '../../internal');

  it('应该能从 kit/ 目录提取工具包信息', async () => {
    const extractor = new ToolPackageExtractor();
    const packages = await extractor.extractFromDirectory(kitDir, 'kit');

    expect(packages.length).toBeGreaterThan(0);

    const tracker = packages.find((p) => p.packageName === '@kit/tracker');
    expect(tracker).toBeTruthy();
    expect(tracker!.name).toBe('Tracker');
    expect(tracker!.scope).toBe('kit');
    expect(tracker!.description).toBeTruthy();
    expect(tracker!.features.length).toBeGreaterThan(0);
    expect(tracker!.examples.length).toBeGreaterThan(0);
    expect(tracker!.apiSections.length).toBeGreaterThan(0);
  });

  it('应该能从 internal/ 目录提取工具包信息', async () => {
    const extractor = new ToolPackageExtractor();
    const packages = await extractor.extractFromDirectory(internalDir, 'internal');

    expect(packages.length).toBeGreaterThan(0);

    const eslint = packages.find((p) => p.packageName === '@kit/eslint-config');
    expect(eslint).toBeTruthy();
    expect(eslint!.scope).toBe('internal');
    expect(eslint!.category).toBe('基础设施');
  });

  it('应该正确推断 category', async () => {
    const extractor = new ToolPackageExtractor();
    const kitPackages = await extractor.extractFromDirectory(kitDir, 'kit');
    const internalPackages = await extractor.extractFromDirectory(internalDir, 'internal');

    const eslint = internalPackages.find((p) => p.packageName === '@kit/eslint-config');
    expect(eslint?.category).toBe('基础设施');

    const sentinel = kitPackages.find((p) => p.packageName === '@kit/sentinel');
    expect(sentinel?.category).toBe('开发工具');

    const tracker = kitPackages.find((p) => p.packageName === '@kit/tracker');
    expect(tracker?.category).toBe('工具包');
  });

  it('对不存在的目录应返回空数组', async () => {
    const extractor = new ToolPackageExtractor();
    const packages = await extractor.extractFromDirectory('/nonexistent', 'kit');
    expect(packages).toEqual([]);
  });
});
