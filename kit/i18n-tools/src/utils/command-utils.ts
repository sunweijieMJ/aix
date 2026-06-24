import { exec } from 'child_process';
import { promisify } from 'util';
import { LoggerUtils } from './logger';

const execAsync = promisify(exec);

/**
 * 判断命令行参数里是否**显式**指定了 --mode/-m（用于决定未指定时是否默认开启交互模式）。
 *
 * 需覆盖 yargs 接受的全部写法：`--mode generate` / `--mode=generate` /
 * `-m generate` / `-m=generate` / `-mgenerate`（短选项贴值）。漏掉贴值写法会导致
 * CI 用 `-m=generate` 时被误判为「未指定 mode」→ 默认开交互 → 无 TTY 卡住。
 *
 * @param args 通常传 `process.argv.slice(2)`
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
 * Why 改为自由函数：原 CommandUtils 类只有这一个静态方法，类壳没有收益。
 */
export async function formatWithPrettier(filePath: string): Promise<void> {
  LoggerUtils.info(`🎨  正在格式化: ${filePath}`);
  try {
    await execAsync(`npx prettier --write "${filePath}"`, { cwd: process.cwd() });
    await execAsync(`npx eslint --fix "${filePath}"`, { cwd: process.cwd() });
    LoggerUtils.success(`   - ✅  格式化成功`);
  } catch (error) {
    LoggerUtils.error(
      `   - ❗  格式化失败，请确保项目已正确安装并配置 Prettier 和 ESLint。`,
      error,
    );
  }
}
