/**
 * 日志系统 - Chalk 风格的彩色日志输出
 *
 * 提供 info/success/warn/error/debug/step 方法
 */

import chalk from 'chalk';

class Logger {
  private stepCount = 0;

  /** 信息日志 (蓝色) */
  info(message: string): void {
    console.log(chalk.blue('ℹ'), chalk.blue(message));
  }

  /** 成功日志 (绿色) */
  success(message: string): void {
    console.log(chalk.green('✔'), chalk.green(message));
  }

  /** 警告日志 (黄色) */
  warn(message: string): void {
    console.log(chalk.yellow('⚠'), chalk.yellow(message));
  }

  /** 错误日志 (红色) */
  error(message: string): void {
    console.error(chalk.red('✖'), chalk.red(message));
  }

  /** 调试日志 (灰色，仅 DEBUG 环境变量启用时输出) */
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), chalk.gray(message));
    }
  }

  /** 步骤日志 (青色，带步骤编号) */
  step(message: string): void {
    this.stepCount++;
    console.log(chalk.cyan(`[${this.stepCount}]`), chalk.cyan(message));
  }

  /** 重置步骤计数 */
  resetSteps(): void {
    this.stepCount = 0;
  }
}

/**
 * 默认日志器实例
 */
export const logger = new Logger();
