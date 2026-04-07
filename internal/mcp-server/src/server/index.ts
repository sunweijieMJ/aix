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
import type { ComponentIndex, ToolPackageIndex } from '../types/index';
import { createCacheManager } from '../utils/cache';
import { log } from '../utils/logger';
import { createMonitoringManager } from '../utils/monitoring';

/**
 * 获取 MCP Server 项目根目录
 * 无论代码运行在 src/ 还是 dist/ 目录下都能正确定位
 */
function getMCPServerRoot(): string {
  const currentFileDir = dirname(fileURLToPath(import.meta.url));

  // 检查当前文件是否在构建输出目录中（兼容 Windows 和 Unix 路径）
  const isInBuildDir = currentFileDir.includes('/dist') || currentFileDir.includes('\\dist');

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
  private toolPackageIndex: ToolPackageIndex | null = null;
  private tools: ReturnType<typeof createTools> = [];
  private resourceManager: ReturnType<typeof createResourceManager> | null = null;

  private cache: ReturnType<typeof createCacheManager>;
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

    this.cache = createCacheManager();
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
   * 包装请求处理器，统一处理监控和错误
   */
  private wrapHandler<T>(
    requestType: string,
    handler: (request: any) => Promise<T>,
  ): (request: any) => Promise<T> {
    return async (request: any) => {
      const startTime = Date.now();
      this.monitoringManager.recordRequestStart();

      try {
        const result = await handler(request);
        this.monitoringManager.recordRequestEnd(true, startTime);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.monitoringManager.recordError(requestType, errorMessage);
        this.monitoringManager.recordRequestEnd(false, startTime);
        throw error;
      }
    };
  }

  /**
   * 设置请求处理器
   */
  private setupHandlers(): void {
    // 工具列表处理器
    this.server.setRequestHandler(
      ListToolsRequestSchema,
      this.wrapHandler('list-tools', async () => ({
        tools: this.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      })),
    );

    // 工具调用处理器
    this.server.setRequestHandler(
      CallToolRequestSchema,
      this.wrapHandler('call-tool', async (request: any) => {
        const { name, arguments: args } = request.params;
        const toolStartTime = Date.now();

        const tool = this.tools.find((t) => t.name === name);
        if (!tool) {
          throw new Error(`Unknown tool: ${name}`);
        }

        try {
          const result = await tool.execute(args || {});
          this.monitoringManager.recordToolCall(name, toolStartTime);
          return {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          };
        } catch (error) {
          this.monitoringManager.recordToolCall(name, toolStartTime);
          throw new Error(
            `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }
      }),
    );

    // 提示词列表处理器
    this.server.setRequestHandler(
      ListPromptsRequestSchema,
      this.wrapHandler('list-prompts', async () => {
        const prompts = getAllPrompts();
        return {
          prompts: Object.entries(prompts).map(([key]) => ({
            name: `${COMPONENT_LIBRARY_CONFIG.packagePrefix}-${key}`,
            description: this.getPromptDescription(key),
          })),
        };
      }),
    );

    // 获取提示词处理器
    this.server.setRequestHandler(
      GetPromptRequestSchema,
      this.wrapHandler('get-prompt', async (request: any) => {
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
          messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
        };
      }),
    );

    // 资源列表处理器
    this.server.setRequestHandler(
      ListResourcesRequestSchema,
      this.wrapHandler('list-resources', async () => {
        if (!this.resourceManager) {
          return { resources: [] };
        }
        const resources = await this.resourceManager.listResources();
        return { resources };
      }),
    );

    // 读取资源处理器
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      this.wrapHandler('read-resource', async (request: any) => {
        if (!this.resourceManager) {
          throw new Error('Resource manager not initialized');
        }
        const { uri } = request.params;
        const content = await this.resourceManager.readResource(uri);
        if (!content) {
          throw new Error(`Resource not found: ${uri}`);
        }
        return { contents: [content] };
      }),
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
    // 加载工具包索引（可选，不影响组件工具）
    this.toolPackageIndex = await this.loadToolPackageIndex();

    try {
      // 先尝试从缓存加载
      const cached = await this.cache.get<ComponentIndex>('component-index');
      if (cached) {
        this.componentIndex = cached;
        this.tools = createTools(
          this.componentIndex,
          this.config.dataDir,
          this.toolPackageIndex ?? undefined,
        );
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
        await this.cache.set('component-index', this.componentIndex, 24 * 60 * 60 * 1000); // 24小时
      } catch (error) {
        log.error(`无法读取组件索引文件: ${indexPath}`, error);
        throw error;
      }

      // 创建工具实例
      this.tools = createTools(
        this.componentIndex,
        this.config.dataDir,
        this.toolPackageIndex ?? undefined,
      );
      this.resourceManager = createResourceManager(this.componentIndex);

      log.info(`✅ 加载了 ${this.componentIndex.components.length} 个组件`);
    } catch (error) {
      log.error('加载组件索引失败:', error);
      log.warn('⚠️ 服务将以空数据启动，请运行 "extract" 命令生成组件索引');
      // 创建空的组件索引
      this.componentIndex = {
        components: [],
        categories: [],
        tags: [],
        lastUpdated: new Date().toISOString(),
        version: '1.0.0',
      };
      this.tools = createTools(
        this.componentIndex,
        this.config.dataDir,
        this.toolPackageIndex ?? undefined,
      );
      this.resourceManager = createResourceManager(this.componentIndex);
    }
  }

  /**
   * 加载工具包索引
   */
  private async loadToolPackageIndex(): Promise<ToolPackageIndex | null> {
    try {
      const indexPath = join(this.config.dataDir, 'packages-index.json');
      const content = await readFile(indexPath, 'utf8');
      const index = JSON.parse(content) as ToolPackageIndex;
      log.info(`✅ 加载了 ${index.packages.length} 个工具包`);
      return index;
    } catch {
      return null;
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
      this.tools = createTools(
        this.componentIndex,
        this.config.dataDir,
        this.toolPackageIndex ?? undefined,
      );
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
      monitoringStats: this.monitoringManager.getMetricsSummary(),
      lastUpdated: this.componentIndex?.lastUpdated || null,
    };
  }

  /**
   * 启动 WebSocket 服务器
   */
  async startWebSocket(port = DEFAULT_WS_PORT, host = DEFAULT_WS_HOST): Promise<void> {
    await this.loadComponentIndex();

    // 创建 WebSocket Transport
    this.webSocketTransport = createWebSocketTransport({ port, host });

    // server.connect() 内部会按正确顺序：注册 onmessage 等回调 → 调用 transport.start()
    // 不要额外调用 transport.start()，否则会导致端口重复绑定
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
