import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// formatWithPrettier 的 spawn 方式按平台分叉：非 Windows 不经 shell（路径原样传参）；
// Windows 经 shell 执行 npx.cmd（CVE-2024-27980 后 Node 禁止无 shell spawn .cmd）且路径
// 加双引号防拆参。mock child_process.execFile 捕获调用参数，逐平台断言各自契约。
const { execFileMock } = vi.hoisted(() => ({
  // 取末位实参作回调（promisify 会把回调追加到参数末尾），避免对位置形参的假设。
  execFileMock: vi.fn((...args: unknown[]) => {
    const cb = args[args.length - 1];
    if (typeof cb === 'function') (cb as (e: unknown, r: unknown) => void)(null, '');
  }),
}));

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import { formatWithPrettier } from '../src/utils/command-utils';

// 按平台还原/覆写 process.platform（getter 属性，需 defineProperty）
const realPlatform = process.platform;
function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

describe('formatWithPrettier — 平台差异化的 spawn 方式', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    setPlatform(realPlatform);
  });
  afterEach(() => setPlatform(realPlatform));

  it('非 Windows：不经 shell，路径含 shell 元字符时原样作为独立参数传递', async () => {
    setPlatform('linux');
    const weird = '/proj/$cache/`Foo`.vue';
    await formatWithPrettier(weird);

    // prettier + eslint 两次调用
    expect(execFileMock).toHaveBeenCalledTimes(2);
    for (const call of execFileMock.mock.calls) {
      const [file, args, options] = call as unknown as [
        string,
        string[],
        { shell?: boolean } | undefined,
      ];
      expect(file).toBe('npx');
      expect(Array.isArray(args)).toBe(true);
      // 不走 shell（无解析风险，路径原样传递）
      expect(options?.shell ?? false).toBe(false);
      expect(args).toContain(weird);
    }
  });

  it('Windows：必须带 shell 选项（CVE-2024-27980 修复后直接 spawn .cmd 抛 EINVAL），且路径加引号防含空格拆分', async () => {
    setPlatform('win32');
    const spaced = 'C:\\Users\\My Name\\proj\\Foo.vue';
    await formatWithPrettier(spaced);

    expect(execFileMock).toHaveBeenCalledTimes(2);
    for (const call of execFileMock.mock.calls) {
      const [file, args, options] = call as unknown as [
        string,
        string[],
        { shell?: boolean } | undefined,
      ];
      expect(file).toBe('npx.cmd');
      // shell 开启是 EINVAL 修复的核心
      expect(options?.shell).toBe(true);
      // shell 模式下 Node 不做参数转义，含空格路径必须由我们加引号，否则被 cmd 拆成多个参数
      expect(args).toContain(`"${spaced}"`);
    }
  });
});

/**
 * 回归（四轮审计 A13）：formatWithPrettier 曾就地吞掉异常并记 error，使
 * GenerateProcessor / RestoreProcessor 两处 catch 成为永不执行的死代码，
 * 日志级别也与调用方「格式化失败可忽略」的意图相反。改为向上抛，由调用方定级别。
 */
describe('formatWithPrettier — 失败向上抛', () => {
  beforeEach(() => {
    execFileMock.mockClear();
    setPlatform(realPlatform);
  });
  afterEach(() => setPlatform(realPlatform));

  it('子进程失败 → 抛错并带上文件路径与原始 cause', async () => {
    const boom = new Error('prettier not found');
    execFileMock.mockImplementationOnce((...args: unknown[]) => {
      const cb = args[args.length - 1];
      if (typeof cb === 'function') (cb as (e: unknown, r: unknown) => void)(boom, '');
    });

    await expect(formatWithPrettier('/proj/A.vue')).rejects.toThrow(/格式化失败.*A\.vue/);
    // eslint 不再被调用（prettier 已失败）
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it('全部成功 → 正常 resolve', async () => {
    await expect(formatWithPrettier('/proj/A.vue')).resolves.toBeUndefined();
    expect(execFileMock).toHaveBeenCalledTimes(2);
  });
});
