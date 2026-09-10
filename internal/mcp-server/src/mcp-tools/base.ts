/**
 * MCP 工具基类
 */

import type { ToolArguments } from '../types/index';

/** limit 的下限与上限 */
const MIN_LIMIT = 1;
const MAX_LIMIT = 100;
/** 未指定 limit 时的默认值 */
const DEFAULT_LIMIT = 10;

/**
 * MCP 工具基类
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: object;

  abstract execute(args: ToolArguments): Promise<unknown>;
}

/**
 * 归一化 limit 参数
 *
 * 低阶 MCP Server 不校验入参，limit 什么都可能传进来。
 * 各工具原先各写各的（`limit || 10` 会把 0 变成 10，`Math.min(limit,100)`
 * 会让负数走到 `slice(0, -5)` 去掉尾部结果），这里统一收口。
 */
export function clampLimit(value: unknown, fallback = DEFAULT_LIMIT): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value), MIN_LIMIT), MAX_LIMIT);
}

/**
 * 读取必填的字符串参数
 *
 * 参数缺失或类型不对时抛出可读的错误，而不是让 `undefined.toLowerCase()`
 * 抛一个 TypeError 出去。空字符串不算错——那是"搜了个空"，
 * 由调用方按业务决定返回空结果还是别的，这里只保证类型。
 */
export function requireString(args: ToolArguments, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`缺少必填参数: ${key}（应为字符串）`);
  }
  return value.trim();
}
