/**
 * @fileoverview Stream 模块公共工具函数
 */

/**
 * 检查字符串是否有效（非空且非纯空白）
 */
export const isValidString = (str: string): boolean =>
  (str ?? '').trim() !== '';
