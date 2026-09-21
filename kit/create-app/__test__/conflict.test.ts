/**
 * 冲突处理的分支语义
 *
 * 这里每条分支的产出都是「哪些文件会被写盘」，选错分支不会报错、只会静默多写或少写文件，
 * 所以逐条钉死：force / -y / 逐文件 / 全部覆盖 / 全部跳过 / 取消，外加非 TTY 的快速失败。
 *
 * @clack/prompts 用假实现驱动：select 按预置队列依次返回，isCancel 认一个哨兵 Symbol
 * （对应用户 Ctrl-C）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GeneratedFile } from '../src/override/types';

const clack = vi.hoisted(() => {
  const CANCEL = Symbol('clack:cancel');
  return {
    CANCEL,
    /** select 的返回值队列，按调用顺序消费 */
    answers: [] as unknown[],
    /** select 收到的 message，用于确认弹的是哪一问 */
    asked: [] as string[],
  };
});

vi.mock('@clack/prompts', () => ({
  select: <T>(opts: { message: string }): Promise<T | symbol> => {
    clack.asked.push(opts.message);
    return Promise.resolve(clack.answers.shift() as T | symbol);
  },
  isCancel: (value: unknown): value is symbol => value === clack.CANCEL,
}));

const { checkProjectConflict, resolveConflicts } = await import('../src/utils/conflict');

let tmpRoot: string;
let logs: string[];
const originalIsTTY = process.stdin.isTTY;

/** 非 TTY 是测试进程的默认态；要走问答分支的用例显式打开 */
function asTTY(): void {
  process.stdin.isTTY = true;
}

function file(p: string): GeneratedFile {
  return { path: p, content: `// ${p}\n` };
}

/** 在 tmpRoot 下真实创建这些文件，制造冲突 */
function existing(...paths: string[]): void {
  for (const p of paths) {
    const full = path.join(tmpRoot, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, 'old');
  }
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-conflict-'));
  clack.answers.length = 0;
  clack.asked.length = 0;
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.stdin.isTTY = originalIsTTY;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------- checkProjectConflict

describe('checkProjectConflict', () => {
  const noFlags = { force: false, yes: false };

  it('目录不存在时直接放行，不打任何提示', async () => {
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).resolves.toBe(true);
    expect(logs).toEqual([]);
    expect(clack.asked).toEqual([]);
  });

  it('目录存在但为空时视为无冲突（空目录不算已有产物）', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'sysu'));
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).resolves.toBe(true);
    expect(clack.asked).toEqual([]);
  });

  it('--force 时直接放行且不弹问答', async () => {
    existing('sysu/router/index.ts');
    await expect(checkProjectConflict('sysu', tmpRoot, { force: true, yes: false })).resolves.toBe(
      true,
    );
    expect(clack.asked).toEqual([]);
    expect(logs.join('\n')).toContain('--force');
  });

  it('-y 时直接放行且不弹问答', async () => {
    existing('sysu/router/index.ts');
    await expect(checkProjectConflict('sysu', tmpRoot, { force: false, yes: true })).resolves.toBe(
      true,
    );
    expect(clack.asked).toEqual([]);
    expect(logs.join('\n')).toContain('跳过已有文件');
  });

  it('非 TTY 且未给 -y/--force 时抛 E_NON_INTERACTIVE，而不是假装用户取消了', async () => {
    existing('sysu/router/index.ts');
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).rejects.toMatchObject({
      code: 'E_NON_INTERACTIVE',
      suggestion: expect.stringContaining('--force') as unknown as string,
    });
    expect(clack.asked).toEqual([]);
  });

  it('TTY 下选「继续」返回 true', async () => {
    asTTY();
    existing('sysu/router/index.ts');
    clack.answers.push('continue');
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).resolves.toBe(true);
    expect(clack.asked).toHaveLength(1);
  });

  it('TTY 下选「取消」返回 false', async () => {
    asTTY();
    existing('sysu/router/index.ts');
    clack.answers.push('cancel');
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).resolves.toBe(false);
  });

  it('TTY 下 Ctrl-C 返回 false（不能被当成「继续」）', async () => {
    asTTY();
    existing('sysu/router/index.ts');
    clack.answers.push(clack.CANCEL);
    await expect(checkProjectConflict('sysu', tmpRoot, noFlags)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------- resolveConflicts

describe('resolveConflicts', () => {
  const noFlags = { force: false, yes: false };
  const files = [file('a.ts'), file('b.ts'), file('c.ts')];

  it('无冲突时原样返回全部文件', async () => {
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toEqual(files);
    expect(clack.asked).toEqual([]);
  });

  it('--force 时返回全部文件（含已有的，即覆盖）', async () => {
    existing('a.ts', 'c.ts');
    await expect(resolveConflicts(files, tmpRoot, { force: true, yes: false })).resolves.toEqual(
      files,
    );
    expect(clack.asked).toEqual([]);
    expect(logs.join('\n')).toContain('将覆盖 2 个已有文件');
  });

  it('-y 时只返回不冲突的文件（跳过语义，不是覆盖）', async () => {
    existing('a.ts', 'c.ts');
    const got = await resolveConflicts(files, tmpRoot, { force: false, yes: true });
    expect(got?.map((f) => f.path)).toEqual(['b.ts']);
    expect(clack.asked).toEqual([]);
  });

  it('非 TTY 且有冲突时抛 E_NON_INTERACTIVE', async () => {
    existing('a.ts');
    await expect(resolveConflicts(files, tmpRoot, noFlags)).rejects.toMatchObject({
      code: 'E_NON_INTERACTIVE',
      suggestion: expect.stringContaining('-y') as unknown as string,
    });
  });

  it('无冲突时即使非 TTY 也不会失败（「有输出目录」不等于「会撞冲突」）', async () => {
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toEqual(files);
  });

  it('「全部覆盖」返回全部文件', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('overwrite');
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toEqual(files);
    expect(clack.asked).toHaveLength(1);
  });

  it('「全部跳过」只返回不冲突的文件', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('skip');
    const got = await resolveConflicts(files, tmpRoot, noFlags);
    expect(got?.map((f) => f.path)).toEqual(['b.ts']);
  });

  it('「取消操作」返回 null（区别于「跳过全部」的空写入）', async () => {
    asTTY();
    existing('a.ts');
    clack.answers.push('cancel');
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toBeNull();
  });

  it('总问答上 Ctrl-C 返回 null', async () => {
    asTTY();
    existing('a.ts');
    clack.answers.push(clack.CANCEL);
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toBeNull();
  });

  it('逐文件确认：只有选了覆盖的冲突文件进结果，安全文件始终在前', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('per-file', 'skip', 'overwrite');

    const got = await resolveConflicts(files, tmpRoot, noFlags);
    expect(got?.map((f) => f.path)).toEqual(['b.ts', 'c.ts']);
    // 一次总问答 + 两个冲突文件各一问，且逐文件那两问点名了具体路径
    expect(clack.asked).toHaveLength(3);
    expect(clack.asked[1]).toContain('a.ts');
    expect(clack.asked[2]).toContain('c.ts');
  });

  it('逐文件确认里全选覆盖 ≡ 全量写入', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('per-file', 'overwrite', 'overwrite');
    const got = await resolveConflicts(files, tmpRoot, noFlags);
    expect(got?.map((f) => f.path).sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('逐文件确认中途 Ctrl-C 返回 null（已确认的部分一并作废，不能写半套）', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('per-file', 'overwrite', clack.CANCEL);
    await expect(resolveConflicts(files, tmpRoot, noFlags)).resolves.toBeNull();
  });

  it('冲突清单会被逐条列出来给用户看', async () => {
    asTTY();
    existing('a.ts', 'c.ts');
    clack.answers.push('skip');
    await resolveConflicts(files, tmpRoot, noFlags);

    const out = logs.join('\n');
    expect(out).toContain('发现 2 个已有文件');
    expect(out).toContain('a.ts');
    expect(out).toContain('c.ts');
  });

  it('嵌套路径的存在性按拼接后的完整路径判定', async () => {
    asTTY();
    const nested = [file('sysu/router/index.ts'), file('sysu/views/.gitkeep')];
    existing('sysu/router/index.ts');
    clack.answers.push('skip');
    const got = await resolveConflicts(nested, tmpRoot, noFlags);
    expect(got?.map((f) => f.path)).toEqual(['sysu/views/.gitkeep']);
  });
});
