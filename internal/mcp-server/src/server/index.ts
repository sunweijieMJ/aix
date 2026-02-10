import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createConfigManager } from '../config';
import type { ServerConfig } from '../config';
import {
  COMPONENT_LIBRARY_CONFIG,
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  TEXT_TEMPLATES,
} from '../constants';
import { createResourceManager } from '../mcp-resources/index';
import { createTools } from '../mcp-tools/index';
import { getAllPrompts } from '../prompts/index';
import { createWebSocketTransport } from '../transports/websocket';
import type { ComponentIndex } from '../types/index';
import { createCacheManager } from '../utils/cache';
import { log } from '../utils/logger';
import { createMonitoringManager } from '../utils/monitoring';
import {
  createSecurityManager,
  getSecurityConfigFromEnv,
  SecurityError,
} from '../utils/security';

/**
 * 获取 MCP Server 项目根目录
 * 无论代码运行在 src/ 还是 dist/ 目录下都能正确定位
 */
function getMCPServerRoot(): string {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));

  // 检查当前文件是否在构建输出目录中
  const isInBuildDir = currentFileDir.includes('/dist');

  // 计算相对于项目根目录的路径
  return isInBuildDir
    ? resolve(currentFileDir, '..') // 从 dist/ 回到根目录
    : resolve(currentFileDir, '../..'); // 从 src/server/ 回到根目录
}

/**
 * AIX 组件库 MCP Server
 *
 * 这是一个基于 Model Context Protocol (MCP) 的服务器实现，
 * 用于为 AIX 组件库提供 AI 上下文支持。它能够提取、缓存和提供
 * 组件库中的组件信息，并通过 MCP 协议将这些信息提供给 AI 模型。
 *
 * @example
 * ```typescript
 * const server = new McpServer('./data');
 * await server.start();
 * ```
 */
export class McpServer {
  private server: Server;
  private componentIndex: ComponentIndex | null = null;
  private tools: ReturnType<typeof createTools> = [];
  private resourceManager: ReturnType<typeof createResourceManager> | null =
    null;

  private cache: ReturnType<typeof createCacheManager>;
  private securityManager: ReturnType<typeof createSecurityManager>;
  private monitoringManager: ReturnType<typeof createMonitoringManager>;
  private config: ServerConfig;
  private testMode: boolean;
  private webSocketTransport?: ReturnType<typeof createWebSocketTransport>;

  /**
   * 创建 AIX MCP Server 实例
   *
   * @param dataDir - 数据目录路径，默认为 './data'
   * @param testMode - 是否启用测试模式（不启动 stdio transport），默认为 false
   */
  constructor(dataDir?: string, testMode = false) {
    // 如果未提供数据目录，则使用项目根目录下的 data 文件夹
    if (!dataDir) {
      dataDir = join(getMCPServerRoot(), 'data');
    }

    // 创建配置管理器
    const configManager = createConfigManager({ dataDir });
    this.config = configManager.getAll();
    this.testMode = testMode;

    // 确保路径存在且正确
    // 在测试模式下显示路径信息
    if (testMode) {
      log.info(`数据目录: ${this.config.dataDir}`);
      log.info(`缓存目录: ${this.config.cacheDir}`);
    }

    this.cache = createCacheManager(this.config.cacheDir);
    this.securityManager = createSecurityManager(getSecurityConfigFromEnv());
    this.monitoringManager = createMonitoringManager();

    this.server = new Server(
      {
        name: COMPONENT_LIBRARY_CONFIG.packageName,
        version: COMPONENT_LIBRARY_CONFIG.version,
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
          resources: {},
        },
      },
    );

    this.setupHandlers();
  }

  /**
   * 请求处理中间件（安全验证 + 监控）
   */
  private async processRequest(
    request: any,
    requestType: string,
  ): Promise<{ requestId: string; startTime: number }> {
    const requestId = `${requestType}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const startTime = Date.now();

    // 记录请求开始
    this.monitoringManager.recordRequestStart(requestId, requestType);

    try {
      // 安全验证
      await this.validateSecurity(request);
      return { requestId, startTime };
    } catch (error) {
      // 记录安全验证失败
      const errorMessage =
        error instanceof Error ? error.message : 'Security validation failed';
      this.monitoringManager.recordError('security_validation', errorMessage);
      this.monitoringManager.recordRequestEnd(requestId, false, startTime);
      throw error;
    }
  }

  /**
   * 完成请求处理
   */
  private completeRequest(
    requestId: string,
    startTime: number,
    success: boolean,
  ): void {
    this.monitoringManager.recordRequestEnd(requestId, success, startTime);
  }

  /**
   * 安全验证中间件
   */
  private async validateSecurity(request: any): Promise<void> {
    // 创建请求上下文（在实际环境中，headers 来自 HTTP 请求）
    const context = this.securityManager.createRequestContext({
      'user-agent': 'mcp-client',
      'x-client-id': request.id || 'unknown',
    });

    // API 密钥验证
    if (!this.securityManager.validateApiKey(context.apiKey)) {
      throw new SecurityError(
        'Invalid or missing API key',
        'INVALID_API_KEY',
        401,
      );
    }

    // 速率限制检查
    const rateLimitResult = this.securityManager.checkRateLimit(context);
    if (!rateLimitResult.allowed) {
      throw new SecurityError(
        rateLimitResult.reason || 'Rate limit exceeded',
        'RATE_LIMIT_EXCEEDED',
        429,
        rateLimitResult.retryAfter,
      );
    }

    // 记录请求
    this.securityManager.recordRequest(context, true);
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 工具列表处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      const { requestId, startTime } = await this.processRequest(
        request,
        'list-tools',
      );

      try {
        const result = {
          tools: this.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        };

        this.completeRequest(requestId, startTime, true);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.monitoringManager.recordError('list_tools', errorMessage);
        this.completeRequest(requestId, startTime, false);
        throw error;
      }
    });

    // 工具调用处理器
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: any) => {
        const { requestId, startTime } = await this.processRequest(
          request,
          'call-tool',
        );
        const { name, arguments: args } = request.params;
        const toolStartTime = Date.now();

        try {
          const tool = this.tools.find((t) => t.name === name);
          if (!tool) {
            throw new Error(`Unknown tool: ${name}`);
          }

          const result = await tool.execute(args || {});

          // 记录工具调用成功
          this.monitoringManager.recordToolCall(name, toolStartTime, true);
          this.completeRequest(requestId, startTime, true);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          // 记录工具调用失败
          this.monitoringManager.recordToolCall(
            name || 'unknown',
            toolStartTime,
            false,
          );
          this.monitoringManager.recordError(
            'tool_execution',
            error instanceof Error ? error.message : String(error),
          );
          this.completeRequest(requestId, startTime, false);

          throw new Error(
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      },
    );

    // 提示词列表处理器
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      await this.validateSecurity(request);
      const prompts = getAllPrompts();
      return {
        prompts: Object.entries(prompts).map(([key]) => ({
          name: `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-${key}`,
          description: this.getPromptDescription(key),
        })),
      };
    });

    // 获取提示词处理器
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      async (request: any) => {
        await this.validateSecurity(request);
        const { name } = request.params;
        const prompts = getAllPrompts();

        const promptKey = name.replace(
          `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-`,
          '',
        ) as keyof typeof prompts;
        const prompt = prompts[promptKey];

        if (!prompt) {
          throw new Error(`Unknown prompt: ${name}`);
        }

        return {
          messages: [
            {
              role: 'user',
              content: {
                type: 'text',
                text: prompt,
              },
            },
          ],
        };
      },
    );

    // 资源列表处理器
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      async (request) => {
        await this.validateSecurity(request);
        if (!this.resourceManager) {
          return { resources: [] };
        }

        const resources = await this.resourceManager.listResources();
        return { resources };
      },
    );

    // 读取资源处理器
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request: any) => {
        await this.validateSecurity(request);
        if (!this.resourceManager) {
          throw new Error('Resource manager not initialized');
        }

        const { uri } = request.params;
        const content = await this.resourceManager.readResource(uri);

        if (!content) {
          throw new Error(`Resource not found: ${uri}`);
        }

        return { contents: [content] };
      },
    );
  }

  /**
   * 获取提示词描述
   *
   * 根据提示词的键返回对应的描述。
   *
   * @param key - 提示词的键
   * @returns 提示词的描述
   */
  private getPromptDescription(key: string): string {
    const descriptions = {
      expert: 'AIX 组件库开发专家系统提示词',
      query: 'AIX 组件库查询助手提示词',
      generation: 'AIX 组件库代码生成指导提示词',
    };
    return descriptions[key as keyof typeof descriptions] || '未知提示词';
  }

  /**
   * 加载组件索引
   *
   * 尝试从缓存或文件系统加载组件索引。
   * 如果两者都失败，则创建一个空的组件索引。
   *
   * @returns 返回一个 Promise，在加载完成后解析
   */
  async loadComponentIndex(): Promise<void> {
    try {
      // 先尝试从缓存加载
      const cached = await this.cache.get<ComponentIndex>('component-index');
      if (cached) {
        this.componentIndex = cached;
        this.tools = createTools(this.componentIndex);
        this.resourceManager = createResourceManager(this.componentIndex);
        if (this.testMode) {
          log.info('✅ 从缓存加载组件索引');
        }
        return;
      }

      // 从文件加载
      const indexPath = join(this.config.dataDir, 'components-index.json');

      try {
        const content = await readFile(indexPath, 'utf8');
        this.componentIndex = JSON.parse(content) as ComponentIndex;

        // 缓存索引数据
        await this.cache.set(
          'component-index',
          this.componentIndex,
          24 * 60 * 60 * 1000,
        ); // 24小时
      } catch (error) {
        log.error(`无法读取组件索引文件: ${indexPath}`, error);
        throw error;
      }

      // 创建工具实例
      this.tools = createTools(this.componentIndex);
      this.resourceManager = createResourceManager(this.componentIndex);

      log.info(`✅ 加载了 ${this.componentIndex.components.length} 个组件`);
    } catch (error) {
      log.error('加载组件索引失败:', error);
      // 创建空的组件索引
      this.componentIndex = {
        components: [],
        categories: [],
        tags: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
      };
      this.tools = createTools(this.componentIndex);
      this.resourceManager = createResourceManager(this.componentIndex);
    }
  }

  /**
   * 保存组件索引
   *
   * 将组件索引保存到文件系统和缓存中。
   *
   * @param index - 要保存的组件索引
   * @returns 返回一个 Promise，在保存完成后解析
   */
  async saveComponentIndex(index: ComponentIndex): Promise<void> {
    try {
      const indexPath = join(this.config.dataDir, 'components-index.json');
      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

      // 更新缓存
      await this.cache.set('component-index', index, 24 * 60 * 60 * 1000);

      this.componentIndex = index;
      this.tools = createTools(this.componentIndex);
      this.resourceManager = createResourceManager(this.componentIndex);

      log.info('✅ 组件索引已保存');
    } catch (error) {
      log.error('保存组件索引失败:', error);
      throw error;
    }
  }

  /**
   * 刷新组件索引
   *
   * 重新加载组件索引，并更新工具列表。
   *
   * @returns 返回一个 Promise，在刷新完成后解析
   */
  async refreshComponentIndex(): Promise<void> {
    // 清除缓存
    await this.cache.delete('component-index');

    // 重新加载
    await this.loadComponentIndex();
  }

  /**
   * 获取服务器统计信息
   *
   * 返回服务器的统计信息，包括已加载的组件数量、可用工具数量、
   * 缓存统计和最后更新时间。
   *
   * @returns 服务器统计信息对象
   */
  getStats() {
    return {
      componentsLoaded: this.componentIndex?.components.length || 0,
      toolsAvailable: this.tools.length,
      cacheStats: this.cache.getStats(),
      securityStats: this.securityManager.getStats(),
      monitoringStats: this.monitoringManager.getMetricsSummary(),
      lastUpdated: this.componentIndex?.lastUpdated || null,
    };
  }

  /**
   * 启动 WebSocket 服务器
   */
  async startWebSocket(
    port = DEFAULT_WS_PORT,
    host = DEFAULT_WS_HOST,
  ): Promise<void> {
    await this.loadComponentIndex();

    // 创建 WebSocket Transport
    this.webSocketTransport = createWebSocketTransport(
      { port, host },
      this.securityManager,
    );

    // 启动 WebSocket 服务器
    await this.webSocketTransport.start();

    // 连接服务器到 WebSocket Transport
    await this.server.connect(this.webSocketTransport);

    log.info(`🚀 AIX MCP WebSocket 服务器已启动 ws://${host}:${port}`);
  }

  /**
   * 启动服务器
   *
   * 加载组件索引并启动 MCP 服务器。
   * 在测试模式下，不会启动 stdio transport。
   *
   * @returns 返回一个 Promise，在服务器启动完成后解析
   */
  async start(): Promise<void> {
    if (this.testMode) {
      log.info(TEXT_TEMPLATES.cliWelcome());
    }

    // 加载组件索引
    await this.loadComponentIndex();

    // 测试模式下不启动 stdio transport
    if (!this.testMode) {
      // 创建传输层
      const transport = new StdioServerTransport();

      // 连接服务器
      await this.server.connect(transport);
    }

    if (this.testMode) {
      log.info(TEXT_TEMPLATES.cliSuccess());
    }
  }

  /**
   * 停止服务器
   *
   * 关闭 MCP 服务器连接。
   *
   * @returns 返回一个 Promise，在服务器停止后解析
   */
  async stop(): Promise<void> {
    if (this.testMode) {
      log.info(TEXT_TEMPLATES.cliStop());
    }

    try {
      // 关闭 WebSocket Transport
      if (this.webSocketTransport) {
        await this.webSocketTransport.close();
        this.webSocketTransport = undefined;
      }

      // 停止监控
      this.monitoringManager.stop();

      // 关闭服务器
      await this.server.close();
      if (this.testMode) {
        log.info(TEXT_TEMPLATES.cliStopped());
      }
    } catch (error) {
      log.error('停止服务器时出错:', error);
    }
  }
}

/**
 * 创建并启动 MCP Server
 *
 * 工厂函数，用于创建并启动 AIX MCP Server 实例。
 *
 * @param dataDir - 数据目录路径，默认为 './data'
 * @returns 返回一个 Promise，解析为已启动的 McpServer 实例
 */
export async function createServer(dataDir?: string): Promise<McpServer> {
  const server = new McpServer(dataDir);
  await server.start();
  return server;
}

/**
 * 主入口函数
 */
export async function main(): Promise<void> {
  try {
    await createServer();
  } catch (error) {
    log.error('启动服务器失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，启动服务器
// 注释掉自动启动，避免在导入时意外启动
// if (import.meta.url === `file://${process.argv[1]}`) {
//   main().catch((error) => {
//     log.error('Fatal error:', error);
//     process.exit(1);
//   });
// }
