/**
 * Spinner 封装 - 基于 ora
 *
 * 提供统一的进度指示器接口
 */

import ora, { type Ora } from 'ora';

/**
 * 创建 spinner 实例
 */
export function createSpinner(text: string): Ora {
  return ora({ text, spinner: 'dots' });
}

/**
 * 执行异步任务并显示 spinner
 */
export async function withSpinner<T>(
  text: string,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(text);
  spinner.start();
  try {
    const result = await fn();
    spinner.succeed();
    return result;
  } catch (error) {
    spinner.fail();
    throw error;
  }
}
