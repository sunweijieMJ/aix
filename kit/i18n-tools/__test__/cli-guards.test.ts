import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import toolPackage from '../package.json';

/**
 * CLI 入口层（cli.ts main）守卫的黑盒 e2e。
 *
 * main() 不导出（模块加载即执行），故无法在进程内单测；改用子进程跑 `tsx src/cli.ts <args>`，
 * 断言这些「参数路由 / UX 守卫」如实以非零状态码拦截误用——它们都在进入具体 processor 的
 * 重活（LLM / AST）之前提前退出，故无需真实源码、网络或 locale 数据。
 *
 * 覆盖的守卫：缺配置、--coverage-threshold 非法（NaN / 越界）、--dry-run 与 --apply-plan
 * 互斥、未配置 io.customDir 时 --custom 报错；并用 --help 作为「成功路径仍返回 0」的对照。
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../src/cli.ts');

/** 定位本包自带的 tsx 可执行文件（直跑二进制不受子进程 cwd 影响，自带 TS loader）。 */
function resolveTsx(): string {
  const base = path.resolve(__dirname, '../node_modules/.bin/tsx');
  if (process.platform === 'win32') {
    for (const ext of ['.CMD', '.cmd', '.exe']) {
      if (fs.existsSync(base + ext)) return base + ext;
    }
  }
  return fs.existsSync(base) ? base : 'tsx';
}
const TSX = resolveTsx();

function runCli(args: string[], cwd: string): { code: number; out: string } {
  const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  const res =
    process.platform === 'win32'
      ? spawnSync([TSX, CLI, ...args].map((s) => `"${s}"`).join(' '), {
          cwd,
          shell: true,
          encoding: 'utf-8',
          env,
        })
      : spawnSync(TSX, [CLI, ...args], { cwd, encoding: 'utf-8', env });
  return { code: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

const VALID_CONFIG = `export default {
  root: process.cwd(),
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh', targets: ['en'] },
  io: { localesDir: 'i18n', sourceDir: 'src' },
  llm: { shared: { apiKey: 'test-key', model: 'gpt-4o' } },
};
`;

// tsx 冷启动 + 子进程，给足超时
const T = 30_000;

describe('CLI 入口守卫（cli.ts main）', () => {
  let emptyDir: string; // 无配置
  let cfgDir: string; // 有合法配置（无 io.customDir）

  beforeAll(() => {
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-empty-'));
    cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-cfg-'));
    fs.writeFileSync(path.join(cfgDir, 'i18n.config.mjs'), VALID_CONFIG, 'utf-8');
  });

  afterAll(() => {
    fs.rmSync(emptyDir, { recursive: true, force: true });
    fs.rmSync(cfgDir, { recursive: true, force: true });
  });

  it(
    '缺配置文件 → 非零退出并提示创建 i18n.config',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--path', 'x'], emptyDir);
      expect(code).toBe(1);
      expect(out).toMatch(/无法加载配置文件/);
    },
    T,
  );

  it(
    '--coverage-threshold 非数字（拼错）→ 非零退出，不静默关闭门禁',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--coverage-threshold', 'abc'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/coverage-threshold 必须是 \[0, 100\]/);
    },
    T,
  );

  it(
    '--coverage-threshold 越界（>100）→ 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--coverage-threshold', '150'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/\[0, 100\]/);
    },
    T,
  );

  it(
    '--dry-run 与 --apply-plan 同传 → 非零退出（互斥）',
    () => {
      const { code, out } = runCli(
        ['--mode', 'generate', '--dry-run', '--apply-plan', 'latest'],
        cfgDir,
      );
      expect(code).toBe(1);
      expect(out).toMatch(/--dry-run 与 --apply-plan 互斥/);
    },
    T,
  );

  it(
    '未配置 io.customDir 时 --custom → 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--custom'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/未配置 io.customDir/);
    },
    T,
  );

  it(
    '--path 指向不存在的路径 → 非零退出（resolveTargetPath 路径校验守卫）',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--path', 'no/such/path/x.vue'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/--path 无效/);
    },
    T,
  );

  it(
    '非交互模式（--mode）未传 --path → 非零退出并提示需用 --path',
    () => {
      const { code, out } = runCli(['--mode', 'generate'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/需用 --path/);
    },
    T,
  );

  it(
    'csv-import 非交互且未传 --output → 非零退出',
    () => {
      const { code, out } = runCli(['--mode', 'csv-import'], cfgDir);
      expect(code).toBe(1);
      expect(out).toMatch(/csv-import 需要 --output/);
    },
    T,
  );

  // 回归（yargs 缺 .strict()）：未知 flag 此前被当自由参数静默收下，命令照常执行且退出码 0
  // ——`--dry-runn` 拼错就变成一次真跑。strict 之后拼错即报错退出并点名该 flag。
  it(
    '未知 flag（拼错）→ 非零退出并点名该 flag',
    () => {
      const { code, out } = runCli(['--mode', 'generate', '--dry-runn'], cfgDir);
      expect(code).not.toBe(0);
      expect(out).toMatch(/dry-runn/);
    },
    T,
  );

  it(
    '合法组合不受 .strict() 影响（--config + --mode + --path 仍走到路径校验）',
    () => {
      const { code, out } = runCli(
        ['--config', './i18n.config.mjs', '--mode', 'generate', '--path', 'no/such.vue'],
        cfgDir,
      );
      // 被路径守卫拦下（而非「未知参数」），说明 strict 没误杀合法 flag
      expect(out).toMatch(/--path 无效/);
      expect(out).not.toMatch(/未知的参数|Unknown argument/);
      expect(code).toBe(1);
    },
    T,
  );

  /**
   * 守卫退出走 CliExit 信号 + process.exitCode（P3）：直接 process.exit 会在 stdout 是
   * 管道时截断尚未 flush 的输出，用户看不到刚打印的那条错误。改造后守卫文案与退出码
   * 不变，且不得被 main 的兜底 catch 误套成「执行 xx 操作时发生错误」。
   */
  it(
    '守卫退出只打自身文案，不套「执行 xx 操作时发生错误」',
    () => {
      const invalidPath = runCli(['--mode', 'generate', '--path', 'no/such.vue'], cfgDir);
      expect(invalidPath.code).toBe(1);
      expect(invalidPath.out).toMatch(/--path 无效/);
      expect(invalidPath.out).not.toMatch(/操作时发生错误/);

      // resolveApplyPlanPath：latest 找不到任何 plan
      const noPlan = runCli(['--mode', 'generate', '--apply-plan', 'latest'], cfgDir);
      expect(noPlan.code).toBe(1);
      expect(noPlan.out).toMatch(/找不到任何 plan/);
      expect(noPlan.out).not.toMatch(/操作时发生错误/);
    },
    T,
  );

  it(
    '--help → 成功退出（确认守卫不是恒返回非零）',
    () => {
      const { code, out } = runCli(['--help'], cfgDir);
      expect(code).toBe(0);
      expect(out).toMatch(/国际化工具集|--mode/);
    },
    T,
  );

  /**
   * 回归（四轮审计 A15）：--help 顶部的模式清单曾是手写列表，与 --mode choices 分头维护，
   * csv-export / csv-import / prune 三个模式漏登记。现由 MODE_LIST + MODE_DESCRIPTIONS 生成。
   */
  it(
    '--help 顶部模式清单覆盖全部 --mode choices',
    () => {
      const { code, out } = runCli(['--help'], cfgDir);
      expect(code).toBe(0);
      const header = out.split('使用方式')[0]!;
      for (const mode of [
        'automatic',
        'generate',
        'pick',
        'translate',
        'merge',
        'restore',
        'export',
        'doctor',
        'csv-export',
        'csv-import',
        'prune',
      ]) {
        expect(header).toContain(mode);
      }
    },
    T,
  );

  /**
   * 「仅在 xx 模式生效」的选项被静默丢弃时必须提示：用户看不到警告就会以为参数生效
   * （`--mode merge --path src/x` 看似限定了范围，实际是全量跑）。
   * 每个用例都挑一个「警告之后还会被既有守卫拦下」的组合，断言不依赖后续真跑。
   */
  it.each([
    [['--mode', 'generate', '--keep-plan'], /--keep-plan 仅在 --apply-plan/],
    [['--mode', 'generate', '--plan-output-dir', 'plans'], /--plan-output-dir 仅在 --dry-run/],
    [['--mode', 'generate', '--langs', 'en-US'], /--langs 仅在 --mode csv-export \/ csv-import/],
    [['--mode', 'generate', '--filter', 'translated'], /--filter 仅在 --mode csv-export/],
    [['--mode', 'generate', '--source', 'translations'], /--source 仅在 --mode csv-export/],
    [
      ['--mode', 'csv-import', '--path', 'src'],
      /--path 仅在 --mode generate \/ restore \/ automatic/,
    ],
    [
      ['--mode', 'csv-import', '--skip-llm'],
      /--skip-llm 仅在 --mode generate \/ automatic \/ translate/,
    ],
    [['--mode', 'generate', '--include-stale-target'], /--include-stale-target 仅在 --mode prune/],
  ])(
    '%s → 提示该选项在当前模式下被忽略',
    (args, pattern) => {
      const { out } = runCli(args as string[], cfgDir);
      expect(out).toMatch(pattern as RegExp);
    },
    T,
  );

  it(
    '--version → 输出 i18n-tools 自身版本，不受消费项目 package.json 影响',
    () => {
      fs.writeFileSync(
        path.join(cfgDir, 'package.json'),
        JSON.stringify({ name: 'consumer-app', version: '9.9.9' }),
      );
      fs.writeFileSync(path.join(cfgDir, '.env'), 'I18N_TOOLS_VERSION_TEST=1\n', 'utf-8');

      const { code, out } = runCli(['--version'], cfgDir);

      expect(code).toBe(0);
      expect(out.trim()).toBe(toolPackage.version);
    },
    T,
  );
});

/**
 * 覆盖率 CI 卡点必须覆盖 apply-plan 路径（P1）：dry-run + apply 两段式工作流下，
 * 真正落盘的是 apply，若阈值只在直跑 generate 时判定，配了 --coverage-threshold 的
 * 流水线会一路绿灯。plan 携带 dry-run 结算的覆盖率快照，apply 据此判定并以 exit 2 退出。
 */
describe('apply-plan 覆盖率阈值卡点（e2e）', () => {
  let proj: string;

  // 一处可自动转换 + 一处需人工的 HTML 模板 → 覆盖率 50%
  const MIXED = `<script setup>\nconst label = '提交';\nconst html = \`<div>提示</div>\`;\n</script>\n`;
  const PLAN_CONFIG = `export default {
  root: process.cwd(),
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh', targets: ['en'] },
  io: { localesDir: 'i18n', sourceDir: 'src', prettify: false },
  llm: { shared: { apiKey: 'test-key', model: 'gpt-4o' } },
};
`;

  beforeEach(() => {
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-plan-cov-'));
    fs.writeFileSync(path.join(proj, 'i18n.config.mjs'), PLAN_CONFIG, 'utf-8');
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'src', 'A.vue'), MIXED, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it(
    'apply 打印覆盖率面板；低于阈值 → 退出码 2（源码仍已落盘）',
    () => {
      const dry = runCli(['--mode', 'generate', '--path', 'src', '--dry-run', '--skip-llm'], proj);
      expect(dry.code, `dry-run 输出：\n${dry.out}`).toBe(0);

      const apply = runCli(
        ['--mode', 'generate', '--apply-plan', 'latest', '--coverage-threshold', '90'],
        proj,
      );

      expect(apply.out).toMatch(/本次国际化覆盖率/);
      expect(apply.out).toMatch(/国际化覆盖率 50\.0% 低于阈值 90%/);
      expect(apply.code).toBe(2);
      // 阈值卡点发生在回放之后：源码已按 plan 落盘，退出码只用于 CI 判读
      expect(fs.readFileSync(path.join(proj, 'src', 'A.vue'), 'utf-8')).toMatch(/\bt\('/);
    },
    T,
  );

  it(
    '达标阈值 → 正常退出 0',
    () => {
      const dry = runCli(['--mode', 'generate', '--path', 'src', '--dry-run', '--skip-llm'], proj);
      expect(dry.code, `dry-run 输出：\n${dry.out}`).toBe(0);

      const apply = runCli(
        ['--mode', 'generate', '--apply-plan', 'latest', '--coverage-threshold', '50'],
        proj,
      );

      expect(apply.code, `apply 输出：\n${apply.out}`).toBe(0);
    },
    T,
  );
});

/**
 * Bug：ExportProcessor 的报错文案引导用户「通过 CLI --output 显式指定」输出目录，
 * 但 cli 的 EXPORT 分支从不把 argv.output 传给 processor.execute() —— 用户照做后
 * 仍报同一个错误。接线后 --output 对 export 模式生效。
 */
describe('export --output 接线（e2e）', () => {
  let proj: string;

  beforeAll(() => {
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-export-'));
    fs.writeFileSync(path.join(proj, 'i18n.config.mjs'), VALID_CONFIG, 'utf-8');
    const localeDir = path.join(proj, 'i18n');
    fs.mkdirSync(localeDir, { recursive: true });
    fs.writeFileSync(path.join(localeDir, 'zh.json'), JSON.stringify({ a: '你好' }));
    fs.writeFileSync(path.join(localeDir, 'en.json'), JSON.stringify({ a: 'Hello' }));
  });

  afterAll(() => {
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it(
    '未配置 io.exportDir 时 --output 生效：导出成功且文件落在指定目录',
    () => {
      const outDir = path.join(proj, 'dist-locale');
      const { code, out } = runCli(['--mode', 'export', '--output', outDir], proj);
      expect(code, `CLI 输出：\n${out}`).toBe(0);
      expect(fs.existsSync(path.join(outDir, 'zh.json'))).toBe(true);
      expect(fs.existsSync(path.join(outDir, 'en.json'))).toBe(true);
      expect(JSON.parse(fs.readFileSync(path.join(outDir, 'zh.json'), 'utf-8'))).toEqual({
        a: '你好',
      });
    },
    T,
  );
});

/**
 * restore 安全网（e2e）：CLI 此前硬编码 overwrite=true，restore 是唯一没有 dry-run 的
 * 破坏性模式，且会把用户自己手写的 t() 与 import 一并还原掉。
 * 现在默认写副本到 restored/，就地改写需 --overwrite，--dry-run 只预览。
 */
describe('restore 默认不就地改写（e2e）', () => {
  let proj: string;
  let srcFile: string;

  const RESTORE_CONFIG = `export default {
  root: process.cwd(),
  framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
  locales: { source: 'zh', targets: ['en'] },
  io: { localesDir: 'i18n', sourceDir: 'src', prettify: false },
  llm: { shared: { apiKey: 'test-key', model: 'gpt-4o' } },
};
`;
  const SRC = `<script setup lang="ts">\nimport { t } from '@/i18n';\nconst m = t('a');\n</script>\n`;

  beforeEach(() => {
    proj = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-cli-restore-'));
    fs.writeFileSync(path.join(proj, 'i18n.config.mjs'), RESTORE_CONFIG, 'utf-8');
    fs.mkdirSync(path.join(proj, 'i18n'), { recursive: true });
    fs.writeFileSync(path.join(proj, 'i18n', 'zh.json'), JSON.stringify({ a: '你好' }));
    fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
    srcFile = path.join(proj, 'src', 'A.vue');
    fs.writeFileSync(srcFile, SRC, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(proj, { recursive: true, force: true });
  });

  it(
    '默认（不传 --overwrite）：源文件不动，产物落 restored/',
    () => {
      const { code, out } = runCli(['--mode', 'restore', '--path', 'src'], proj);
      expect(code, `CLI 输出：\n${out}`).toBe(0);
      expect(fs.readFileSync(srcFile, 'utf-8')).toBe(SRC);
      const copy = path.join(proj, 'restored', 'src', 'A.vue');
      expect(fs.existsSync(copy)).toBe(true);
      expect(fs.readFileSync(copy, 'utf-8')).toContain('你好');
    },
    T,
  );

  it(
    '--overwrite：就地改写源文件，不产出 restored/',
    () => {
      const { code, out } = runCli(['--mode', 'restore', '--path', 'src', '--overwrite'], proj);
      expect(code, `CLI 输出：\n${out}`).toBe(0);
      expect(fs.readFileSync(srcFile, 'utf-8')).toContain('你好');
      expect(fs.existsSync(path.join(proj, 'restored'))).toBe(false);
    },
    T,
  );

  it(
    '--dry-run：零写盘（无 restored/、源文件不动），输出含还原计数',
    () => {
      const before = fs.readdirSync(proj).sort();
      const { code, out } = runCli(['--mode', 'restore', '--path', 'src', '--dry-run'], proj);

      expect(code, `CLI 输出：\n${out}`).toBe(0);
      expect(fs.readFileSync(srcFile, 'utf-8')).toBe(SRC);
      expect(fs.existsSync(path.join(proj, 'restored'))).toBe(false);
      // 除 .i18n-tools（运行报告）外不新增任何顶层产物
      expect(
        fs
          .readdirSync(proj)
          .filter((n) => n !== '.i18n-tools')
          .sort(),
      ).toEqual(before);
      expect(out).toMatch(/将还原调用点: 1 处/);
      expect(out).toMatch(/未写入任何文件/);
    },
    T,
  );
});
