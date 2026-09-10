import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
import { COMPONENT_LIBRARY_CONFIG } from '../constants';
import { createResourceManager } from '../mcp-resources/index';
import { createTools } from '../mcp-tools/index';
import { getAllPrompts } from '../prompts/index';
import type { ComponentIndex, ToolPackageIndex } from '../types/index';
import { log } from '../utils/logger';
import { createMonitoringManager } from '../utils/monitoring';
import { findRepoRoot } from '../utils/repo-root';

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

  private monitoringManager: ReturnType<typeof createMonitoringManager>;
  private configManager: ReturnType<typeof createConfigManager>;
  private config: ServerConfig;
  private testMode: boolean;
  /**
   * workspace 根目录，null 表示当前是脱离仓库运行（如 npx 安装）
   *
   * 有仓库时读磁盘上的真实文件，没有时退回 data/ 里的文档快照。
   */
  private repoRoot: string | null = null;

  /**
   * 创建 AIX MCP Server 实例
   *
   * @param dataDir - 数据目录路径，默认为 './data'
   * @param testMode - 是否启用测试模式（不启动 stdio transport），默认为 false
   */
  constructor(dataDir?: string, testMode = false) {
    // 不传时交给 ConfigManager 走「环境变量 -> 默认值」，
    // 在这里补默认值会盖掉 MCP_DATA_DIR，让环境变量永远不生效
    this.configManager = createConfigManager(dataDir ? { dataDir } : undefined);
    this.config = this.configManager.getAll();
    this.testMode = testMode;

    if (testMode) {
      log.info(`数据目录: ${this.config.dataDir}`);
    }

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
      const indexPath = join(this.config.dataDir, 'components-index.json');

      try {
        const content = await readFile(indexPath, 'utf8');
        this.componentIndex = JSON.parse(content) as ComponentIndex;
      } catch (error) {
        log.error(`无法读取组件索引文件: ${indexPath}`, error);
        throw error;
      }

      this.wireUpIndex();

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
      this.wireUpIndex();
    }
  }

  /**
   * 用当前索引重建工具和资源管理器
   *
   * 索引来自缓存、磁盘还是空兜底，后续装配都一样，集中在这里避免三处漂移。
   */
  private wireUpIndex(): void {
    if (!this.componentIndex) return;

    this.repoRoot = this.resolveRepoRoot(this.componentIndex);

    this.tools = createTools(
      this.componentIndex,
      this.config.dataDir,
      this.toolPackageIndex ?? undefined,
      this.repoRoot,
    );
    this.resourceManager = createResourceManager(
      this.componentIndex,
      this.config.dataDir,
      this.repoRoot,
    );
  }

  /**
   * 定位 workspace 根
   *
   * 用第一个组件的 sourcePath 当探针，确保命中的是真的装着这套组件库的仓库，
   * 而不是使用方自己那个恰好也有 pnpm-workspace.yaml 的目录。
   */
  private resolveRepoRoot(index: ComponentIndex): string | null {
    const probe = index.components[0]?.sourcePath;
    const root = findRepoRoot(this.config.dataDir, probe);

    if (this.testMode) {
      log.info(root ? `仓库根目录: ${root}` : '未定位到仓库，文档走 data/ 内的快照');
    }

    return root;
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
   * @param index - 要保存的组件索引
   * @returns 返回一个 Promise，在保存完成后解析
   */
  async saveComponentIndex(index: ComponentIndex): Promise<void> {
    try {
      const indexPath = join(this.config.dataDir, 'components-index.json');
      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, JSON.stringify(index, null, 2), 'utf8');

      this.componentIndex = index;
      this.wireUpIndex();

      log.info('✅ 组件索引已保存');
    } catch (error) {
      log.error('保存组件索引失败:', error);
      throw error;
    }
  }

  /**
   * 刷新组件索引
   *
   * 重新从磁盘加载索引，并更新工具列表。
   *
   * @returns 返回一个 Promise，在刷新完成后解析
   */
  async refreshComponentIndex(): Promise<void> {
    await this.loadComponentIndex();
  }

  /**
   * 获取服务器统计信息
   *
   * @returns 服务器统计信息对象
   */
  getStats() {
    return {
      componentsLoaded: this.componentIndex?.components.length || 0,
      toolsAvailable: this.tools.length,
      monitoringStats: this.monitoringManager.getMetricsSummary(),
      lastUpdated: this.componentIndex?.lastUpdated || null,
    };
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
      log.info(`🚀 启动 ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server...`);
    }

    // 校验配置：错误直接失败，警告只提示（数据缺失时服务仍以空数据启动）
    const validation = await this.configManager.validate();
    validation.warnings.forEach((w) => log.warn(`⚠️ ${w}`));
    if (!validation.isValid) {
      validation.errors.forEach((e) => log.error(`❌ ${e}`));
      throw new Error(`配置校验失败: ${validation.errors.join('; ')}`);
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
      log.info(`✅ ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server 已启动`);
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
      log.info(`🛑 停止 ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server...`);
    }

    try {
      // 关闭服务器
      await this.server.close();
      if (this.testMode) {
        log.info(`✅ ${COMPONENT_LIBRARY_CONFIG.displayName} MCP Server 已停止`);
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
