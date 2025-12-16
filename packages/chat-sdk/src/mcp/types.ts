/**
 * @fileoverview MCP (Model Context Protocol) 类型定义
 * 基于 MCP 规范定义的类型
 */

/**
 * MCP 工具输入 Schema
 */
export interface MCPToolInputSchema {
  type: 'object';
  properties: Record<string, MCPPropertySchema>;
  required?: string[];
}

/**
 * MCP 属性 Schema
 */
export interface MCPPropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  items?: MCPPropertySchema;
  properties?: Record<string, MCPPropertySchema>;
}

/**
 * MCP 工具注解
 */
export interface MCPToolAnnotations {
  /** 工具显示标题 */
  title?: string;
  /** 是否为只读操作 */
  readOnlyHint?: boolean;
  /** 是否为破坏性操作 */
  destructiveHint?: boolean;
  /** 是否为幂等操作 */
  idempotentHint?: boolean;
  /** 是否在开放环境中运行 */
  openWorldHint?: boolean;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description?: string;
  /** 输入参数 Schema */
  inputSchema: MCPToolInputSchema;
  /** 工具注解 */
  annotations?: MCPToolAnnotations;
}

/**
 * MCP 资源定义
 */
export interface MCPResource {
  /** 资源 URI */
  uri: string;
  /** 资源名称 */
  name: string;
  /** 资源描述 */
  description?: string;
  /** MIME 类型 */
  mimeType?: string;
}

/**
 * MCP 提示模板
 */
export interface MCPPrompt {
  /** 提示名称 */
  name: string;
  /** 提示描述 */
  description?: string;
  /** 提示参数 */
  arguments?: MCPPromptArgument[];
}

/**
 * MCP 提示参数
 */
export interface MCPPromptArgument {
  /** 参数名称 */
  name: string;
  /** 参数描述 */
  description?: string;
  /** 是否必需 */
  required?: boolean;
}

/**
 * MCP 工具调用请求
 */
export interface MCPToolCallRequest {
  /** 工具名称 */
  name: string;
  /** 调用参数 */
  arguments: Record<string, unknown>;
}

/**
 * MCP 工具调用响应
 */
export interface MCPToolCallResponse {
  /** 是否为错误响应 */
  isError?: boolean;
  /** 响应内容 */
  content: MCPContent[];
}

/**
 * MCP 内容类型
 */
export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent;

/**
 * MCP 文本内容
 */
export interface MCPTextContent {
  type: 'text';
  text: string;
}

/**
 * MCP 图片内容
 */
export interface MCPImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

/**
 * MCP 资源内容
 */
export interface MCPResourceContent {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
  };
}

/**
 * MCP 客户端配置
 */
export interface MCPClientConfig {
  /** 服务器 URL */
  baseURL: string;
  /** 自定义请求头 */
  headers?: Record<string, string>;
  /** 请求超时（毫秒） */
  timeout?: number;
  /** 自定义 fetch 函数 */
  fetch?: typeof fetch;
  /** 重连配置 */
  reconnect?: MCPReconnectConfig;
}

/**
 * 重连配置
 */
export interface MCPReconnectConfig {
  /** 是否启用自动重连 */
  enabled?: boolean;
  /** 最大重连次数 */
  maxRetries?: number;
  /** 初始延迟时间（毫秒） */
  initialDelay?: number;
  /** 最大延迟时间（毫秒） */
  maxDelay?: number;
}

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  /** 服务器名称 */
  name: string;
  /** 服务器版本 */
  version: string;
  /** 支持的协议版本 */
  protocolVersion?: string;
  /** 服务器能力 */
  capabilities?: MCPServerCapabilities;
}

/**
 * MCP 服务器能力
 */
export interface MCPServerCapabilities {
  /** 是否支持工具 */
  tools?: boolean;
  /** 是否支持资源 */
  resources?: boolean;
  /** 是否支持提示 */
  prompts?: boolean;
  /** 是否支持日志 */
  logging?: boolean;
}
