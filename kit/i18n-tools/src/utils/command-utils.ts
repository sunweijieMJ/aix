import { execFile } from 'child_process';
import { promisify } from 'util';
import { LoggerUtils } from './logger';

// spawn 方式按平台分叉（见 formatWithPrettier 内注释）：
//  - 非 Windows：execFile 参数以数组传递、不经 shell——路径含 `$`、反引号、`$(...)` 等
//    shell 元字符时原样传递，不会被解析或破坏引号闭合。
//  - Windows：必须经 shell 执行 npx.cmd（Node 对 .cmd 禁止无 shell spawn），路径自行加
//    双引号防拆参。已知限制：cmd 在双引号内仍会做 %VAR% 环境变量展开，路径含成对百分号
//    且恰好命中已定义变量名时会作用于错误路径（软失败，仅影响格式化）。
const execFileAsync = promisify(execFile);

/**
 * 判断命令行参数里是否**显式**指定了 --mode/-m（用于决定未指定时是否默认开启交互模式）。
 *
 * 需覆盖 yargs 接受的全部写法：`--mode generate` / `--mode=generate` /
 * `-m generate` / `-m=generate` / `-mgenerate`（短选项贴值）。漏掉贴值写法会导致
 * CI 用 `-m=generate` 时被误判为「未指定 mode」→ 默认开交互 → 无 TTY 卡住。
 *
 * @param args 通常传 `process.argv.slice(2)`
 *
 * cspell:ignore mgenerate —— 短选项贴值写法示例，非词汇
 */
export function isModeExplicitlySet(args: string[]): boolean {
  return args.some(
    (arg) =>
      arg === '--mode' ||
      arg.startsWith('--mode=') ||
      arg === '-m' ||
      // -m=generate / -mgenerate 等短选项贴值写法（-m 后紧跟非连字符内容）
      /^-m[^-]/.test(arg),
  );
}

/**
 * 使用 prettier + eslint 格式化单个文件。
 *
 * 失败向上抛（不在此吞掉）：格式化是美化步骤，「失败是否可忽略、按什么级别播报」由调用方
 * 定——generate 走 warn 继续，restore 走 error 但仍视为已还原。函数内部就地记 error 会让
 * 两处 catch 变成永不执行的死代码，日志级别也与调用方的意图相反。
 */
export async function formatWithPrettier(filePath: string): Promise<void> {
  LoggerUtils.info(`🎨  正在格式化: ${filePath}`);
  // Windows 上 npx 实为 npx.cmd，且 CVE-2024-27980 修复后的 Node（≥18.20.2/20.12.2/21.7.3）
  // 禁止不带 shell 选项直接 spawn .cmd/.bat（一律抛 EINVAL），必须开 shell。shell 模式下
  // Node 不做参数转义（cmd 会按空格拆参），路径需自行加双引号；Windows 文件名不允许含
  // 双引号，包一层即可安全（cmd 的特殊字符 & < > | ^ 在引号内均失效）。
  // 非 Windows 保持不经 shell：参数以数组原样传递，路径含 $、反引号等也不会被解析。
  const isWindows = process.platform === 'win32';
  const npxBin = isWindows ? 'npx.cmd' : 'npx';
  const fileArg = isWindows ? `"${filePath}"` : filePath;
  const options = { cwd: process.cwd(), shell: isWindows };
  try {
    await execFileAsync(npxBin, ['prettier', '--write', fileArg], options);
    await execFileAsync(npxBin, ['eslint', '--fix', fileArg], options);
  } catch (error) {
    throw new Error(`格式化失败（${filePath}），请确保项目已正确安装并配置 Prettier 和 ESLint。`, {
      cause: error,
    });
  }
  LoggerUtils.success(`   - ✅  格式化成功`);
}
