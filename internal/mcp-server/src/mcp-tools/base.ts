/**
 * MCP 工具基类
 */

import type { ToolArguments } from '../types/index';

/**
 * MCP 工具基类
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: object;

  abstract execute(args: ToolArguments): Promise<unknown>;
}
