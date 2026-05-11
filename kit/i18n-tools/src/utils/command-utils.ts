import { exec } from 'child_process';
import { promisify } from 'util';
import { LoggerUtils } from './logger';

const execAsync = promisify(exec);

/**
 * 命令执行工具类
 */
export class CommandUtils {
  /**
   * 使用 prettier + eslint 格式化文件
   */
  static async formatWithPrettier(filePath: string): Promise<void> {
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
}
