/**
 * `override add` 的真实 CLI 回归
 *
 * 这条链路（generator / conflict / 参数校验）此前零测试，而两个已确认的缺陷都在这里：
 * 1. 定制目录名只在问答分支校验，命令行传 `../../PWNED` 会把覆盖层写到 output 之外
 * 2. `-m 'router,'` 的空片段被当成模块名，报出「未知模块: 」
 *
 * 与 cli-cache-tty.test.ts 同策略：spawn `tsx src/cli.ts`，断言用户真正会遇到的行为。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(PKG_ROOT, 'src/cli.ts');
const TSX = path.join(PKG_ROOT, 'node_modules/.bin/tsx');

/** 每个 tsx 冷启动约 1s */
const TIMEOUT = 60_000;

const tempDirs: string[] = [];

/**
 * 造一个「带 Override 内核的项目根」
 *
 * 内核（`src/plugins/override/`）与基础设施（`<output>/types.ts` 等）由模板的 overrides
 * 特性提供，本包只生成按租户的骨架 —— 所以这些前置文件必须先摆上，否则 add 会直接报
 * E_MISSING_OVERRIDE_KERNEL（缺失路径本身另有用例覆盖）。
 *
 * @param withKernel 传 false 得到一个「只有 package.json」的裸项目
 */
function makeProject(withKernel = true): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-ovr-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));

  if (withKernel) {
    fs.mkdirSync(path.join(dir, 'src/plugins/override'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'src/plugins/override/index.ts'),
      '// 模板 overrides 特性提供的内核（测试替身）\nexport {};\n',
    );
    fs.mkdirSync(path.join(dir, 'src/overrides'), { recursive: true });
    for (const rel of ['types.ts', 'index.ts', 'registry.ts', 'deployment.ts']) {
      fs.writeFileSync(path.join(dir, 'src/overrides', rel), `// 模板提供：${rel}\nexport {};\n`);
    }
  }
  return dir;
}

function runAdd(args: string[], cwd: string): { status: number | null; output: string } {
  const r = spawnSync(TSX, [CLI, 'override', 'add', ...args], {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { status: r.status, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

describe('override add - 定制目录名校验', () => {
  it(
    '路径穿越的目录名被拒，且不在 output 之外留下任何文件',
    () => {
      const cwd = makeProject();
      const r = runAdd(['../../PWNED', '-m', 'router', '-y'], cwd);

      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_INVALID_PROJECT_NAME');
      expect(r.output).toContain('../../PWNED');
      // 关键断言：穿越目标与 output 目录都不该被创建
      expect(fs.existsSync(path.join(cwd, 'PWNED'))).toBe(false);
      expect(fs.existsSync(path.resolve(cwd, '../PWNED'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '大写 / 数字开头等不合法目录名同样被拒',
    () => {
      const cwd = makeProject();
      for (const code of ['SYSU', '1sysu']) {
        const r = runAdd([code, '-m', 'router', '-y'], cwd);
        expect(r.status, code).not.toBe(0);
        expect(r.output, code).toContain('E_INVALID_PROJECT_NAME');
      }
    },
    TIMEOUT,
  );
});

describe('override add - 内核 / 基础设施前置检查', () => {
  it(
    '裸项目（无内核）直接报 E_MISSING_OVERRIDE_KERNEL，并点名缺哪些文件',
    () => {
      const cwd = makeProject(false);
      const r = runAdd(['sysu', '-m', 'router', '-y'], cwd);

      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_MISSING_OVERRIDE_KERNEL');
      expect(r.output).toContain('src/plugins/override/index.ts');
      expect(r.output).toContain('src/overrides/types.ts');
      // 一个文件都不该落盘：骨架 import 不到内核，生成出来只是死 import
      expect(fs.existsSync(path.join(cwd, 'src/overrides/sysu'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '--dry-run 也拦（预览一个注定装不上的产物只会误导）',
    () => {
      const cwd = makeProject(false);
      const r = runAdd(['sysu', '-m', 'router', '--dry-run'], cwd);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_MISSING_OVERRIDE_KERNEL');
    },
    TIMEOUT,
  );

  it(
    '只缺基础设施（有内核、output 目录是空的）同样报错并只点名缺的那几个',
    () => {
      const cwd = makeProject(false);
      fs.mkdirSync(path.join(cwd, 'src/plugins/override'), { recursive: true });
      fs.writeFileSync(path.join(cwd, 'src/plugins/override/index.ts'), 'export {};\n');

      const r = runAdd(['sysu', '-m', 'router', '-y'], cwd);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('src/overrides/types.ts');
      expect(r.output).not.toContain('src/plugins/override/index.ts');
    },
    TIMEOUT,
  );
});

describe('override add - 空串位置参数按「缺失」处理', () => {
  it(
    "`override add ''` 报 E_NON_INTERACTIVE（缺参数），而不是「目录名不合法」",
    () => {
      const cwd = makeProject();
      const r = runAdd(['', '-m', 'router', '-y'], cwd);
      expect(r.status).not.toBe(0);
      // 空串是未赋值 shell 变量的典型形态，全 CLI 统一按缺失处理
      expect(r.output).toContain('E_NON_INTERACTIVE');
      expect(r.output).not.toContain('E_INVALID_PROJECT_NAME');
    },
    TIMEOUT,
  );
});

describe('override add - 模块参数解析', () => {
  it(
    '`-m router,` 的尾随空片段被忽略，而不是报「未知模块: 」',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'router,', '-y'], cwd);

      expect(r.output).not.toContain('未知模块');
      expect(r.status).toBe(0);
      expect(fs.existsSync(path.join(cwd, 'src/overrides/sysu/router/index.ts'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '`-m ,,` 解析不出任何模块时直接失败，不静默退化成「只生成必选模块」',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', ',,', '-y'], cwd);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('没有解析出任何模块');
      // 走统一错误出口：带错误码，且可用模块清单落在 suggestion 里
      expect(r.output).toContain('E_INVALID_OPTION');
      expect(r.output).toContain('可用模块:');
    },
    TIMEOUT,
  );

  it(
    '未知模块名仍然报错并列出可用模块',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'router,nope', '-y'], cwd);
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('未知模块: nope');
      expect(r.output).toContain('E_INVALID_OPTION');
      // 清单不能因为改走 suggestion 就丢信息量
      expect(r.output).toContain('可用模块:');
      expect(r.output).toContain('locale');
    },
    TIMEOUT,
  );
});

describe('override add - 生成物必须自包含', () => {
  it(
    '除 @/plugins/override（同批生成）外，不得出现任何 @/ 语句级 import',
    () => {
      // 骨架里的 @/ import 只允许 @/plugins/override（内核，由模板的 overrides 特性提供）。
      // 出现别的 @/xxx 就会在用户项目里变成死 import——内核本身已收口到模板真源，
      // 本包只生成按租户的骨架。详见 templates-override/README.md
      const cwd = makeProject();
      expect(
        runAdd(['sysu', '-m', 'api,components,directives,layout,locale,store', '-y'], cwd).status,
      ).toBe(0);

      const roots = [path.join(cwd, 'src/overrides'), path.join(cwd, 'src/plugins/override')];
      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else if (e.name.endsWith('.ts')) files.push(full);
        }
      };
      roots.forEach(walk);
      expect(files.length).toBeGreaterThan(10);

      const offenders: string[] = [];
      for (const file of files) {
        fs.readFileSync(file, 'utf-8')
          .split('\n')
          .forEach((line, i) => {
            const m = /^\s*import\s[^;]*?from\s*'(@\/[^']+)'/.exec(line);
            if (m && m[1] !== '@/plugins/override') {
              offenders.push(`${path.relative(cwd, file)}:${i + 1} → ${m[1]}`);
            }
          });
      }
      expect(offenders, offenders.join('\n')).toEqual([]);
    },
    TIMEOUT,
  );
});

describe('override add - 生成结果', () => {
  it(
    '生成必选模块 + 指定模块，并落在 output 目录内',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'locale', '-y'], cwd);
      expect(r.status).toBe(0);

      const base = path.join(cwd, 'src/overrides');
      // 项目聚合入口
      expect(fs.existsSync(path.join(base, 'sysu/index.ts'))).toBe(true);
      // 基础设施是前置文件，本包不生成也不改写它们
      for (const rel of ['types.ts', 'index.ts', 'registry.ts', 'deployment.ts']) {
        expect(fs.readFileSync(path.join(base, rel), 'utf-8'), rel).toContain('模板提供');
      }
      // 必选模块（constants / router / views）始终生成，即便 -m 里没写
      expect(fs.existsSync(path.join(base, 'sysu/constants/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(base, 'sysu/router/index.ts'))).toBe(true);
      expect(fs.existsSync(path.join(base, 'sysu/views/.gitkeep'))).toBe(true);
      // 指定的可选模块
      expect(fs.existsSync(path.join(base, 'sysu/locale/index.ts'))).toBe(true);
      // 未指定的可选模块不生成
      expect(fs.existsSync(path.join(base, 'sysu/store/index.ts'))).toBe(false);
      // 项目聚合入口只 import 选中的模块
      const entry = fs.readFileSync(path.join(base, 'sysu/index.ts'), 'utf-8');
      expect(entry).toContain("from './locale'");
      expect(entry).not.toContain("from './store'");
      // 内核不再由本包生成，原样保持模板提供的那份
      expect(fs.readFileSync(path.join(cwd, 'src/plugins/override/index.ts'), 'utf-8')).toContain(
        '测试替身',
      );
    },
    TIMEOUT,
  );

  it(
    '`-y` 重跑时跳过已有文件（不覆盖），退出码仍为 0',
    () => {
      const cwd = makeProject();
      expect(runAdd(['sysu', '-m', 'router', '-y'], cwd).status).toBe(0);

      const marker = '// 用户手改过的内容\n';
      const target = path.join(cwd, 'src/overrides/registry.ts');
      fs.writeFileSync(target, marker);

      const r = runAdd(['gzdx', '-m', 'router', '-y'], cwd);
      expect(r.status).toBe(0);
      // 已有的基础设施文件不被回写（否则会用旧模板覆盖用户/模板的新版本）
      expect(fs.readFileSync(target, 'utf-8')).toBe(marker);
      expect(fs.existsSync(path.join(cwd, 'src/overrides/gzdx/index.ts'))).toBe(true);
    },
    TIMEOUT,
  );

  it(
    '`--dry-run` 只预览不写盘',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'router', '--dry-run'], cwd);
      expect(r.status).toBe(0);
      expect(r.output).toContain('预览模式');
      // src/overrides 与 src/plugins/override 是前置文件（模板提供），本来就存在；
      // 该断的是「按租户的那部分一个都没落盘」
      expect(fs.existsSync(path.join(cwd, 'src/overrides/sysu'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '不在项目根目录（无 package.json）时拒绝执行',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'router', '-y'], path.join(cwd, 'nested'));
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('E_NOT_PROJECT_ROOT');
      expect(r.output).toContain('未检测到 package.json');
    },
    TIMEOUT,
  );
});
