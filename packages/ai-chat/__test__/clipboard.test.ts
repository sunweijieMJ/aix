import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../src/utils/clipboard';

// 本 jsdom 未实现 document.execCommand，无法 spy 不存在的属性 → 直接赋值 mock 函数
type ExecHost = { execCommand?: (cmd: string) => boolean };
const setExec = (fn: ReturnType<typeof vi.fn>) => {
  (document as unknown as ExecHost).execCommand = fn as unknown as (cmd: string) => boolean;
  return fn;
};

afterEach(() => {
  vi.restoreAllMocks();
  Object.assign(navigator, { clipboard: undefined });
  delete (document as unknown as ExecHost).execCommand;
});

describe('copyText', () => {
  it('优先用 Clipboard API：成功返回 true，不触发 execCommand', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const exec = setExec(vi.fn().mockReturnValue(true));
    expect(await copyText('hi')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hi');
    expect(exec).not.toHaveBeenCalled();
  });

  it('Clipboard API 写入失败（权限被拒 / 非聚焦）→ 降级 execCommand', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.assign(navigator, { clipboard: { writeText } });
    const exec = setExec(vi.fn().mockReturnValue(true));
    expect(await copyText('hi')).toBe(true);
    expect(writeText).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('无 Clipboard API（HTTP 非安全上下文 / 旧浏览器）→ 直接走 execCommand 兜底', async () => {
    Object.assign(navigator, { clipboard: undefined });
    const exec = setExec(vi.fn().mockReturnValue(true));
    expect(await copyText('hi')).toBe(true);
    expect(exec).toHaveBeenCalledWith('copy');
  });

  it('两条路径都失败时返回 false', async () => {
    Object.assign(navigator, { clipboard: undefined });
    setExec(vi.fn().mockReturnValue(false));
    expect(await copyText('hi')).toBe(false);
  });

  it('execCommand 兜底用完即移除临时 textarea（无 DOM 残留）', async () => {
    Object.assign(navigator, { clipboard: undefined });
    setExec(vi.fn().mockReturnValue(true));
    await copyText('hi');
    expect(document.querySelector('textarea')).toBeNull();
  });
});
