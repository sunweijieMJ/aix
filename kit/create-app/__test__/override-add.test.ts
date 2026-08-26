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

/** 造一个「最小项目根」：只需要有 package.json（isProjectRoot 的判据） */
function makeProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'create-app-ovr-'));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'host' }));
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
    },
    TIMEOUT,
  );
});

describe('override add - 生成物必须自包含', () => {
  it(
    '除 @/plugins/override（同批生成）外，不得出现任何 @/ 语句级 import',
    () => {
      // 这份内核拷贝的唯一消费者是「尚未拥有内核的项目」——真源那份为紧耦合优化，
      // 直接 import 了 @/api/core/request、@/constants/menu、@/layout/useLayoutContext、
      // @/utils/auth，照抄过来就是一堆悬空 import。本用例守住这条边界，
      // 防止后来者「同步最新版」时把分叉抹平。详见 templates-override/README.md
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

  it(
    '维护者说明不得渲染进用户项目（.eta 里的 JS 注释会原样输出）',
    () => {
      const cwd = makeProject();
      expect(runAdd(['sysu', '-m', 'layout', '-y'], cwd).status).toBe(0);
      for (const rel of [
        'src/plugins/override/index.ts',
        'src/plugins/override/override-layout.ts',
        'src/overrides/registry.ts',
      ]) {
        expect(fs.readFileSync(path.join(cwd, rel), 'utf-8'), rel).not.toContain('有意分叉');
      }
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
      // 基础设施 + 项目聚合入口
      for (const rel of ['types.ts', 'index.ts', 'registry.ts', 'deployment.ts', 'sysu/index.ts']) {
        expect(fs.existsSync(path.join(base, rel)), rel).toBe(true);
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
      // 内核工具首次运行时补齐
      expect(fs.existsSync(path.join(cwd, 'src/plugins/override/index.ts'))).toBe(true);
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
      expect(fs.existsSync(path.join(cwd, 'src/overrides'))).toBe(false);
      expect(fs.existsSync(path.join(cwd, 'src/plugins/override'))).toBe(false);
    },
    TIMEOUT,
  );

  it(
    '不在项目根目录（无 package.json）时拒绝执行',
    () => {
      const cwd = makeProject();
      const r = runAdd(['sysu', '-m', 'router', '-y'], path.join(cwd, 'nested'));
      expect(r.status).not.toBe(0);
      expect(r.output).toContain('未检测到 package.json');
    },
    TIMEOUT,
  );
});
