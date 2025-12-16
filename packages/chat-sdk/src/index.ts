/**
 * @fileoverview @aix/chat-sdk - 框架无关的 AI 聊天 SDK
 * 提供核心类型、工具函数、Provider 和 MCP 客户端
 *
 * @packageDocumentation
 * @module @aix/chat-sdk
 *
 * @example 使用内置 Provider
 * ```typescript
 * import {
 *   ChatStore,
 *   AgentRunner,
 *   OpenAIChatProvider,
 *   type ChatMessage,
 * } from '@aix/chat-sdk';
 *
 * // 创建 Provider
 * const provider = new OpenAIChatProvider({
 *   baseURL: 'https://api.openai.com/v1/chat/completions',
 *   apiKey: 'sk-xxx',
 *   model: 'gpt-4',
 * });
 *
 * // 创建 Agent
 * const agent = new AgentRunner({
 *   request: async (info, callbacks) => {
 *     await provider.sendMessage(info.messages, callbacks);
 *   }
 * });
 *
 * // 创建 Store 并发送消息
 * const store = new ChatStore({ agent });
 * await store.sendMessage('Hello');
 * ```
 *
 * @example 使用 MCP 客户端
 * ```typescript
 * import { MCPClient } from '@aix/chat-sdk';
 *
 * const mcpClient = new MCPClient({
 *   baseURL: 'http://localhost:3000/mcp',
 * });
 *
 * // 获取工具列表
 * const tools = await mcpClient.listTools();
 *
 * // 调用工具
 * const result = await mcpClient.callTool({
 *   name: 'search',
 *   arguments: { query: 'hello' },
 * });
 * ```
 */

// =============================================================================
// Types - 类型定义
// =============================================================================
export * from './types';

// =============================================================================
// Core - 核心类
// =============================================================================
export * from './core';

// =============================================================================
// Utils - 工具函数
// =============================================================================
export * from './utils';

// =============================================================================
// Providers - 服务商适配
// =============================================================================
export * from './providers';

// =============================================================================
// MCP - Model Context Protocol 客户端
// =============================================================================
export * from './mcp';

// =============================================================================
// 版本信息
// =============================================================================
export { VERSION } from './version';
