import { execSync } from 'child_process';
import { LoggerUtils } from './logger';

/**
 * 命令执行工具类
 * 提供shell命令执行和formatjs操作功能
 */
export class CommandUtils {
  /**
   * 使用prettier格式化文件
   * @param filePath - 文件路径
   */
  static async formatWithPrettier(filePath: string): Promise<void> {
    LoggerUtils.info(`🎨  正在格式化: ${filePath}`);
    try {
      // 步骤 1: 使用 Prettier 进行基础格式化
      execSync(`npx prettier --write "${filePath}"`, {
        stdio: 'ignore',
        cwd: process.cwd(),
      });

      // 步骤 2: 使用 ESLint 修复包括导入顺序在内的问题
      execSync(`npx eslint --fix "${filePath}"`, {
        stdio: 'ignore',
        cwd: process.cwd(),
      });

      LoggerUtils.success(`   - ✅  格式化成功`);
    } catch (error) {
      LoggerUtils.error(
        `   - ❗  格式化失败，请确保项目已正确安装并配置 Prettier 和 ESLint。`,
        error,
      );
    }
  }

  /**
   * 执行shell命令
   * @param command - 要执行的命令
   * @param silent - 是否静默执行（不输出命令内容）
   * @throws {Error} 当命令执行失败时抛出错误
   */
  static execCommand(command: string, silent: boolean = false): void {
    try {
      if (!silent) {
        LoggerUtils.info(`执行命令: ${command}`);
      }
      execSync(command, { stdio: 'inherit' });
    } catch (error) {
      LoggerUtils.error(`命令执行失败:`, error);
      throw error;
    }
  }
}
