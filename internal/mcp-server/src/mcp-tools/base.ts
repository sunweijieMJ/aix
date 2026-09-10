/**
 * MCP 工具基类
 */

import type { ZodRawShape } from 'zod';
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
  /**
   * 入参 schema（zod shape）
   *
   * 交给 SDK 的 registerTool 后，协议层会自动校验并生成 JSON Schema，
   * 不需要再手写一份 JSON Schema 与实现同步维护。
   */
  abstract inputSchema: ZodRawShape;

  abstract execute(args: ToolArguments): Promise<unknown>;
}

/**
 * 归一化 limit 参数
 *
 * 协议层已由 zod 校验类型，这里负责取值范围，并覆盖 execute 被直接调用
 * （测试、内部复用）的路径。各工具原先各写各的：`limit || 10` 会把 0 变成 10，
 * `Math.min(limit, 100)` 会让负数走到 `slice(0, -5)` 去掉尾部结果。
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
 * 协议层调用已被 zod 拦住，这里覆盖 execute 被直接调用的路径：
 * 缺参时给出可读错误，而不是让 `undefined.toLowerCase()` 抛 TypeError。
 * 空字符串不算错——那是"搜了个空"，由调用方按业务决定怎么处理。
 */
export function requireString(args: ToolArguments, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`缺少必填参数: ${key}（应为字符串）`);
  }
  return value.trim();
}
