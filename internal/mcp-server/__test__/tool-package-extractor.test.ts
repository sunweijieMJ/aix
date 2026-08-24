import { join } from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ToolPackageExtractor } from '../src/extractors/tool-package-extractor';
import type { ToolPackageInfo } from '../src/types/index';

describe('ToolPackageExtractor', () => {
  const kitDir = join(import.meta.dirname, '../../../kit');
  const internalDir = join(import.meta.dirname, '../../../internal');

  /**
   * 两次目录扫描提到 beforeAll 共享。
   *
   * 各用例自己扫时，「应该正确推断 category」一条要连扫 kit/ 与 internal/ 两个目录、
   * 逐包读并解析 README，会顶穿 vitest 默认的 5000ms 单用例超时——本地单跑 1.7s 必绿，
   * `pnpm test` 并发 31 个任务时实测 5072ms 挂掉，表现为 CI 随机红。
   *
   * 提到 beforeAll 后：目录遍历从 4 次降到 2 次，且 hook 超时（默认 10s）比单用例超时
   * 宽裕；用例本身只剩内存里的数组查找，与机器快慢彻底解耦。
   *
   * 两个目录用各自的 extractor 实例并行：它持有 ReadmeExtractor 成员，
   * 共用一个实例并发调用得先论证其无状态，不如直接回避。
   */
  let kitPackages: ToolPackageInfo[];
  let internalPackages: ToolPackageInfo[];

  beforeAll(async () => {
    [kitPackages, internalPackages] = await Promise.all([
      new ToolPackageExtractor().extractFromDirectory(kitDir, 'kit'),
      new ToolPackageExtractor().extractFromDirectory(internalDir, 'internal'),
    ]);
  });

  it('应该能从 kit/ 目录提取工具包信息', () => {
    expect(kitPackages.length).toBeGreaterThan(0);

    const tracker = kitPackages.find((p) => p.packageName === '@kit/tracker');
    expect(tracker).toBeTruthy();
    expect(tracker!.name).toBe('Tracker');
    expect(tracker!.scope).toBe('kit');
    expect(tracker!.description).toBeTruthy();
    expect(tracker!.features.length).toBeGreaterThan(0);
    expect(tracker!.examples.length).toBeGreaterThan(0);
    expect(tracker!.apiSections.length).toBeGreaterThan(0);
  });

  it('应该能从 internal/ 目录提取工具包信息', () => {
    expect(internalPackages.length).toBeGreaterThan(0);

    const eslint = internalPackages.find((p) => p.packageName === '@kit/eslint-config');
    expect(eslint).toBeTruthy();
    expect(eslint!.scope).toBe('internal');
    expect(eslint!.category).toBe('基础设施');
  });

  it('应该正确推断 category', () => {
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
