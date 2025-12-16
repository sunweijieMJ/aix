/**
 * @fileoverview MCPClient - MCP (Model Context Protocol) 客户端
 * 用于与 MCP 服务器通信，获取工具、资源和提示模板
 */

import type {
  MCPClientConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolCallRequest,
  MCPToolCallResponse,
  MCPServerInfo,
  MCPReconnectConfig,
} from './types';

/**
 * MCP 客户端状态
 */
export interface MCPClientState {
  /** 是否已连接 */
  connected: boolean;
  /** 是否正在请求 */
  loading: boolean;
  /** 是否正在重连 */
  reconnecting: boolean;
  /** 重连次数 */
  reconnectCount: number;
  /** 服务器信息 */
  serverInfo: MCPServerInfo | null;
  /** 可用工具列表 */
  tools: MCPTool[];
  /** 可用资源列表 */
  resources: MCPResource[];
  /** 可用提示列表 */
  prompts: MCPPrompt[];
  /** 最后错误 */
  lastError: Error | null;
}

/**
 * MCP 客户端事件
 */
export interface MCPClientEvents {
  /** 连接成功回调 */
  onConnect?: (serverInfo: MCPServerInfo) => void;
  /** 连接断开回调 */
  onDisconnect?: () => void;
  /** 工具列表更新回调 */
  onToolsUpdate?: (tools: MCPTool[]) => void;
  /** 错误回调 */
  onError?: (error: Error) => void;
  /** 重连回调 */
  onReconnect?: (attempt: number, delay: number) => void;
  /** 重连成功回调 */
  onReconnectSuccess?: () => void;
  /** 重连失败回调 */
  onReconnectFailed?: (error: Error) => void;
}

/**
 * MCP 客户端
 *
 * @example
 * ```ts
 * const client = new MCPClient({
 *   baseURL: 'http://localhost:3000/mcp',
 *   timeout: 30000,
 * });
 *
 * // 获取工具列表
 * const tools = await client.listTools();
 *
 * // 调用工具
 * const result = await client.callTool({
 *   name: 'search',
 *   arguments: { query: 'hello' },
 * });
 *
 * // 订阅状态变化
 * client.subscribe((state) => {
 *   console.log('Tools:', state.tools);
 * });
 * ```
 */
export class MCPClient {
  private config: Required<Omit<MCPClientConfig, 'reconnect'>> & {
    reconnect: Required<MCPReconnectConfig>;
  };

  private state: MCPClientState;

  private events: MCPClientEvents;

  private listeners: Set<(state: MCPClientState) => void> = new Set();

  private abortController: AbortController | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** 延迟 Promise 的 resolve 函数，用于取消延迟 */
  private delayResolve: ((value: boolean) => void) | null = null;

  constructor(config: MCPClientConfig, events: MCPClientEvents = {}) {
    this.config = {
      baseURL: config.baseURL,
      headers: config.headers ?? {},
      timeout: config.timeout ?? 30000,
      fetch: config.fetch ?? globalThis.fetch.bind(globalThis),
      reconnect: {
        enabled: config.reconnect?.enabled ?? false,
        maxRetries: config.reconnect?.maxRetries ?? 3,
        initialDelay: config.reconnect?.initialDelay ?? 1000,
        maxDelay: config.reconnect?.maxDelay ?? 30000,
      },
    };

    this.events = events;

    this.state = {
      connected: false,
      loading: false,
      reconnecting: false,
      reconnectCount: 0,
      serverInfo: null,
      tools: [],
      resources: [],
      prompts: [],
      lastError: null,
    };
  }

  /**
   * 获取当前状态
   */
  getState(): MCPClientState {
    return { ...this.state };
  }

  /**
   * 是否已连接
   */
  isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * 是否正在加载
   */
  isLoading(): boolean {
    return this.state.loading;
  }

  /**
   * 获取工具列表
   */
  getTools(): MCPTool[] {
    return [...this.state.tools];
  }

  /**
   * 获取资源列表
   */
  getResources(): MCPResource[] {
    return [...this.state.resources];
  }

  /**
   * 获取提示列表
   */
  getPrompts(): MCPPrompt[] {
    return [...this.state.prompts];
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(): Promise<MCPServerInfo> {
    this.updateState({ loading: true, lastError: null });

    try {
      const serverInfo = await this.request<MCPServerInfo>('/info', 'GET');

      this.updateState({
        connected: true,
        loading: false,
        serverInfo,
      });

      this.events.onConnect?.(serverInfo);

      // 自动加载工具、资源和提示
      await Promise.all([
        this.listTools().catch(() => []),
        this.listResources().catch(() => []),
        this.listPrompts().catch(() => []),
      ]);

      return serverInfo;
    } catch (error) {
      const err = error as Error;
      this.updateState({
        loading: false,
        lastError: err,
      });
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopReconnect();
    this.abort();
    this.updateState({
      connected: false,
      reconnecting: false,
      reconnectCount: 0,
      serverInfo: null,
      tools: [],
      resources: [],
      prompts: [],
    });
    this.events.onDisconnect?.();
  }

  /**
   * 尝试重连
   * 使用指数退避策略（循环实现，避免栈溢出）
   */
  async reconnect(): Promise<MCPServerInfo | null> {
    if (!this.config.reconnect.enabled) {
      return null;
    }

    const { maxRetries, initialDelay, maxDelay } = this.config.reconnect;

    // 使用 while 循环代替递归，避免栈溢出
    while (this.state.reconnectCount < maxRetries) {
      // 计算延迟（指数退避）
      const delay = Math.min(
        initialDelay * Math.pow(2, this.state.reconnectCount),
        maxDelay,
      );

      this.updateState({
        reconnecting: true,
        reconnectCount: this.state.reconnectCount + 1,
      });

      this.events.onReconnect?.(this.state.reconnectCount, delay);

      // 使用可取消的延迟
      const shouldContinue = await this.delayWithCancel(delay);
      if (!shouldContinue) {
        // 延迟被取消（调用了 stopReconnect 或 disconnect）
        return null;
      }

      try {
        const serverInfo = await this.connect();
        this.updateState({ reconnecting: false, reconnectCount: 0 });
        this.events.onReconnectSuccess?.();
        return serverInfo;
      } catch {
        // 检查是否在连接期间被停止
        if (!this.state.reconnecting) {
          return null;
        }
        // 继续循环重试
      }
    }

    // 达到最大重试次数
    const error = new Error(`Reconnect failed after ${maxRetries} attempts`);
    this.events.onReconnectFailed?.(error);
    this.updateState({ reconnecting: false });
    return null;
  }

  /**
   * 可取消的延迟
   * @returns true 表示延迟完成，false 表示被取消
   */
  private delayWithCancel(ms: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // 保存 resolve 函数以便 stopReconnect 可以调用
      this.delayResolve = resolve;
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.delayResolve = null;
        // 再次检查状态，确保没有在定时器触发前被停止
        resolve(this.state.reconnecting);
      }, ms);
    });
  }

  /**
   * 停止重连
   */
  stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    // 如果有等待中的延迟 Promise，立即 resolve 为 false
    if (this.delayResolve) {
      this.delayResolve(false);
      this.delayResolve = null;
    }
    this.updateState({ reconnecting: false });
  }

  /**
   * 列出可用工具
   */
  async listTools(): Promise<MCPTool[]> {
    const tools = await this.listItems<MCPTool>('tools', '/tools');
    this.events.onToolsUpdate?.(tools);
    return tools;
  }

  /**
   * 列出可用资源
   */
  async listResources(): Promise<MCPResource[]> {
    return this.listItems<MCPResource>('resources', '/resources');
  }

  /**
   * 列出可用提示模板
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    return this.listItems<MCPPrompt>('prompts', '/prompts');
  }

  /**
   * 调用工具
   */
  async callTool(request: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    this.updateState({ loading: true, lastError: null });

    try {
      const response = await this.request<MCPToolCallResponse>(
        '/tools/call',
        'POST',
        request,
      );

      this.updateState({ loading: false });

      if (response.isError) {
        const errorMessage = response.content
          .filter((c) => c.type === 'text')
          .map((c) => (c as { type: 'text'; text: string }).text)
          .join('\n');
        throw new Error(errorMessage || 'Tool call failed');
      }

      return response;
    } catch (error) {
      const err = error as Error;
      this.updateState({
        loading: false,
        lastError: err,
      });
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<MCPResource & { content: string }> {
    this.updateState({ loading: true, lastError: null });

    try {
      const response = await this.request<MCPResource & { content: string }>(
        `/resources/read?uri=${encodeURIComponent(uri)}`,
        'GET',
      );

      this.updateState({ loading: false });
      return response;
    } catch (error) {
      const err = error as Error;
      this.updateState({
        loading: false,
        lastError: err,
      });
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 获取提示模板内容
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>,
  ): Promise<{ messages: Array<{ role: string; content: string }> }> {
    this.updateState({ loading: true, lastError: null });

    try {
      const params = new URLSearchParams({ name });
      if (args) {
        params.set('arguments', JSON.stringify(args));
      }

      const response = await this.request<{
        messages: Array<{ role: string; content: string }>;
      }>(`/prompts/get?${params.toString()}`, 'GET');

      this.updateState({ loading: false });
      return response;
    } catch (error) {
      const err = error as Error;
      this.updateState({
        loading: false,
        lastError: err,
      });
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 根据名称查找工具
   */
  findTool(name: string): MCPTool | undefined {
    return this.state.tools.find((tool) => tool.name === name);
  }

  /**
   * 根据名称查找资源
   */
  findResource(uri: string): MCPResource | undefined {
    return this.state.resources.find((resource) => resource.uri === uri);
  }

  /**
   * 根据名称查找提示
   */
  findPrompt(name: string): MCPPrompt | undefined {
    return this.state.prompts.find((prompt) => prompt.name === name);
  }

  /**
   * 将工具列表转换为 OpenAI Function Calling 格式
   */
  toOpenAITools(): Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: MCPTool['inputSchema'];
    };
  }> {
    return this.state.tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * 中止当前请求
   */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.updateState({ loading: false });
  }

  /**
   * 订阅状态变化
   */
  subscribe(listener: (state: MCPClientState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 销毁实例
   */
  destroy(): void {
    this.stopReconnect();
    this.abort();
    this.listeners.clear();
    this.state = {
      connected: false,
      loading: false,
      reconnecting: false,
      reconnectCount: 0,
      serverInfo: null,
      tools: [],
      resources: [],
      prompts: [],
      lastError: null,
    };
  }

  /**
   * 发送请求
   */
  private async request<T>(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<T> {
    this.abortController = new AbortController();

    const timeoutId = setTimeout(() => {
      this.abortController?.abort();
    }, this.config.timeout);

    try {
      const url = this.config.baseURL.replace(/\/$/, '') + path;

      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        signal: this.abortController.signal,
      };

      if (body && method === 'POST') {
        options.body = JSON.stringify(body);
      }

      const response = await this.config.fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `MCP request failed: ${response.status} ${response.statusText} - ${errorText}`,
        );
      }

      const data = await response.json();
      return data as T;
    } finally {
      clearTimeout(timeoutId);
      this.abortController = null;
    }
  }

  /**
   * 通用的列表项获取方法
   */
  private async listItems<T>(
    type: 'tools' | 'resources' | 'prompts',
    path: string,
  ): Promise<T[]> {
    this.updateState({ loading: true, lastError: null });

    try {
      const response = await this.request<{ [key: string]: T[] } | T[]>(
        path,
        'GET',
      );

      // 兼容两种响应格式：数组或对象包装
      const items = Array.isArray(response) ? response : (response[type] ?? []);

      this.updateState({
        loading: false,
        [type]: items,
      });

      return items;
    } catch (error) {
      const err = error as Error;
      this.updateState({
        loading: false,
        lastError: err,
      });
      this.events.onError?.(err);
      throw err;
    }
  }

  /**
   * 更新状态并通知监听器
   */
  private updateState(partial: Partial<MCPClientState>): void {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener(this.state));
  }
}

/**
 * 创建 MCP 客户端实例
 */
export function createMCPClient(
  config: MCPClientConfig,
  events?: MCPClientEvents,
): MCPClient {
  return new MCPClient(config, events);
}
