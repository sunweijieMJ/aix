/**
 * Figma MCP 基准图提供器
 *
 * 利用项目现有的 Figma MCP 集成，通过 MCP Client SDK 调用
 * mcp__figma__download_figma_images 工具获取设计稿图片。
 *
 * 优势：
 * - 无需额外的 API Token（复用 MCP 连接）
 * - 支持复杂的节点选择
 * - 批量下载优化（并发限制）
 */

import path from 'node:path';

import { ensureDir, pathExists } from '../../utils/file';
import { hashFile } from '../../utils/hash';
import { getImageDimensions } from '../../utils/image';
import { logger } from '../../utils/logger';
import type {
  BaselineMetadata,
  BaselineProvider,
  BaselineResult,
  BaselineSource,
  FetchBaselineOptions,
} from './types';

const log = logger.child('FigmaMcpProvider');

/** 默认下载超时 (ms) */
const DEFAULT_TIMEOUT = 30_000;
/** 默认缩放比例 */
const DEFAULT_SCALE = 2;

/**
 * 动态导入可选依赖（防止打包器静态分析模块路径）
 */
async function importOptional(specifier: string): Promise<Record<string, any>> {
  return import(specifier);
}

/**
 * MCP 调用结果
 */
interface McpCallResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * MCP Client 接口约束
 *
 * 动态导入 @modelcontextprotocol/sdk 后的客户端实例最小接口。
 * 避免 unknown + as any 的零类型安全问题。
 */
interface McpClient {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
  request(
    req: { method: string; params: Record<string, unknown> },
    opts?: { timeout?: number },
  ): Promise<McpCallResult>;
}

/**
 * 解析来源为结构化 BaselineSource
 */
function parseSource(source: string | BaselineSource): BaselineSource {
  if (typeof source === 'string') {
    // 期望格式: "fileKey:nodeId" 或纯 nodeId
    // nodeId 本身可能包含冒号（如 "123:456"），只按第一个冒号切分
    const colonIndex = source.indexOf(':');
    if (colonIndex > 0) {
      return {
        type: 'figma-mcp',
        source: source.slice(colonIndex + 1),
        fileKey: source.slice(0, colonIndex),
      };
    }
    return { type: 'figma-mcp', source };
  }
  return source;
}

export class FigmaMcpProvider implements BaselineProvider {
  readonly name = 'figma-mcp';

  private mcpClient: McpClient | null = null;
  private defaultFileKey?: string;

  private boundExitHandler: (() => void) | null = null;

  constructor(options?: { fileKey?: string }) {
    this.defaultFileKey = options?.fileKey;

    // 注册进程退出清理。
    // 注意: exit handler 中无法执行异步操作（Promise 不会被等待），
    // 仅置空引用即可。MCP 子进程会随父进程退出由 OS 自动清理。
    this.boundExitHandler = () => {
      this.mcpClient = null;
    };
    process.on('exit', this.boundExitHandler);
  }

  async fetch(options: FetchBaselineOptions): Promise<BaselineResult> {
    const {
      source,
      outputPath,
      scale = DEFAULT_SCALE,
      timeout = DEFAULT_TIMEOUT,
    } = options;
    const parsed = parseSource(source);
    const fileKey = parsed.fileKey ?? this.defaultFileKey;

    if (!fileKey) {
      return {
        path: outputPath,
        success: false,
        error: new Error(
          'Figma fileKey is required. Provide it in the source or provider config.',
        ),
      };
    }

    log.debug(
      `Fetching Figma node: ${fileKey}/${parsed.source} -> ${outputPath}`,
    );

    try {
      if (!this.mcpClient) {
        try {
          await this.initMcpClient();
        } catch (error) {
          // MCP Client 初始化失败，确保状态清理后返回错误结果
          this.mcpClient = null;
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          return {
            path: outputPath,
            success: false,
            error: new Error(
              `Failed to initialize Figma MCP client: ${errorMsg}`,
            ),
          };
        }
      }

      const outputDir = path.dirname(outputPath);
      const fileName = path.basename(outputPath);
      await ensureDir(outputDir);

      const result = await this.callMcpDownload({
        fileKey,
        nodeId: parsed.source,
        outputDir,
        fileName,
        scale,
        timeout,
      });

      if (result.isError) {
        const errorMsg = result.content[0]?.text ?? 'Unknown MCP error';
        throw new Error(`Figma MCP download failed: ${errorMsg}`);
      }

      // 验证文件已下载
      const fileExists = await pathExists(outputPath);
      if (!fileExists) {
        throw new Error(`Downloaded file not found at: ${outputPath}`);
      }

      const [dimensions, hash] = await Promise.all([
        getImageDimensions(outputPath),
        hashFile(outputPath),
      ]);

      const metadata: BaselineMetadata = {
        dimensions,
        hash,
        fetchedAt: new Date().toISOString(),
        figmaInfo: {
          fileKey,
          nodeId: parsed.source,
          lastModified: new Date().toISOString(),
          version: 'latest',
        },
      };

      log.info(
        `Figma baseline fetched: ${fileName} (${dimensions.width}x${dimensions.height})`,
      );

      return { path: outputPath, success: true, metadata };
    } catch (error) {
      log.error('Failed to fetch Figma baseline', error as Error);
      return {
        path: outputPath,
        success: false,
        error: error as Error,
      };
    }
  }

  async exists(source: string | BaselineSource): Promise<boolean> {
    const parsed = parseSource(source);
    const fileKey = parsed.fileKey ?? this.defaultFileKey;

    if (!fileKey) {
      return false;
    }

    try {
      if (!this.mcpClient) {
        await this.initMcpClient();
      }

      // 尝试获取节点数据来验证是否存在
      const result = await this.callMcpTool('get_figma_data', {
        fileKey,
        nodeId: parsed.source,
        depth: 0,
      });

      return !result.isError;
    } catch {
      return false;
    }
  }

  private disposed = false;
  private isDisposing = false;

  async dispose(): Promise<void> {
    if (this.disposed || this.isDisposing) return;
    this.isDisposing = true;

    try {
      // 移除进程退出监听器
      if (this.boundExitHandler) {
        process.removeListener('exit', this.boundExitHandler);
        this.boundExitHandler = null;
      }

      if (this.mcpClient) {
        try {
          await this.mcpClient.close();
        } catch {
          // 忽略关闭错误
        }
        this.mcpClient = null;
        log.debug('MCP client disposed');
      }

      this.disposed = true;
    } finally {
      this.isDisposing = false;
    }
  }

  /**
   * 初始化 MCP Client
   *
   * 动态导入 @modelcontextprotocol/sdk，建立与 Figma MCP Server 的连接。
   * 如果 SDK 未安装或连接失败，将抛出错误。
   */
  private async initMcpClient(): Promise<void> {
    log.info('Initializing Figma MCP client...');

    try {
      // MCP SDK is an optional peer dependency, loaded dynamically at runtime.
      // Wrapping import() in a function with a parameter prevents bundlers (tsup/esbuild)
      // from statically resolving the module path, avoiding build errors when SDK is absent.
      const { Client } = await importOptional(
        '@modelcontextprotocol/sdk/client/index.js',
      );
      const { StdioClientTransport } = await importOptional(
        '@modelcontextprotocol/sdk/client/stdio.js',
      );

      const transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@anthropic-ai/mcp-server-figma'],
      });

      const client: McpClient = new Client(
        { name: 'visual-testing', version: '0.1.0' },
        { capabilities: { tools: {} } },
      );

      await client.connect(transport);
      this.mcpClient = client;

      log.info('Figma MCP client initialized');
    } catch (error) {
      this.mcpClient = null;
      throw new Error(
        `Failed to initialize Figma MCP client: ${(error as Error).message}. ` +
          'Ensure @modelcontextprotocol/sdk is installed.',
        { cause: error },
      );
    }
  }

  /**
   * 调用 MCP 下载图片工具
   */
  private async callMcpDownload(params: {
    fileKey: string;
    nodeId: string;
    outputDir: string;
    fileName: string;
    scale: number;
    timeout: number;
  }): Promise<McpCallResult> {
    const { fileKey, nodeId, outputDir, fileName, scale, timeout } = params;

    return this.callMcpTool(
      'download_figma_images',
      {
        fileKey,
        nodes: [{ nodeId, fileName }],
        localPath: outputDir,
        format: 'png',
        scale,
      },
      timeout,
    );
  }

  /**
   * 通用 MCP 工具调用
   */
  private async callMcpTool(
    toolName: string,
    args: Record<string, unknown>,
    timeout: number = DEFAULT_TIMEOUT,
  ): Promise<McpCallResult> {
    if (!this.mcpClient) {
      throw new Error('MCP client not initialized');
    }

    return this.mcpClient.request(
      {
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      },
      { timeout },
    );
  }
}
