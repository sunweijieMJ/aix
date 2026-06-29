import { describe, it, expect, vi, beforeEach } from 'vitest';

// 用 execFile（传参数组）替代 exec（走 shell）后，路径不再经 shell 解析。
// mock child_process.execFile 捕获调用参数，验证文件路径以独立数组元素原样传递。
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

describe('formatWithPrettier — execFile 传参数组，避免 shell 解析路径', () => {
  beforeEach(() => execFileMock.mockClear());

  it('路径含 $ 等 shell 元字符时原样作为参数传递，不拼进 shell 命令串', async () => {
    const weird = '/proj/$cache/`Foo`.vue';
    await formatWithPrettier(weird);

    // prettier + eslint 两次调用
    expect(execFileMock).toHaveBeenCalledTimes(2);
    for (const call of execFileMock.mock.calls) {
      const [file, args] = call as unknown as [string, string[]];
      // 第一个参数是可执行程序名，而非整条命令串
      expect(file).toBe('npx');
      expect(Array.isArray(args)).toBe(true);
      // 路径作为独立元素原样出现（未被转义 / 插值 / 拆分）
      expect(args).toContain(weird);
      // 不得出现「路径被拼进含空格的单一命令串」这种 shell 注入形态
      expect(args.some((a) => a.includes(' ') && a.includes(weird))).toBe(false);
    }
  });
});
