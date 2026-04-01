import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { program } from 'commander';
import {
  COMPONENT_LIBRARY_CONFIG,
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  TEXT_TEMPLATES,
} from './constants';
import { McpServer } from './server/index';
import type { ExtractorConfig } from './types/index';
import { log } from './utils/logger';
import {
  createMonitoringManager,
  formatHealthCheckResult,
} from './utils/monitoring';
import { validateExtractorConfig } from './utils/validation';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * CLI 应用类
 */
class McpCli {
  constructor() {
    this.setupCommands();
  }

  /**
   * 设置命令
   */
  private setupCommands(): void {
    program
      .name(COMPONENT_LIBRARY_CONFIG.cliName)
      .description(COMPONENT_LIBRARY_CONFIG.cliDisplayName)
      .version(COMPONENT_LIBRARY_CONFIG.version)
      .option('-d, --data <dir>', '数据目录路径')
      .option('-t, --test', '测试模式（不启动 stdio transport）', false);

    // 移除默认action，让Commander.js处理help和version
    // program.action 会拦截所有命令，包括 --help

    // 启动服务器命令
    program
      .command('serve')
      .description('启动 MCP Server (stdio)')
      .option('-d, --data <dir>', '数据目录路径')
      .option('-t, --test', '测试模式（不启动 stdio transport）', false)
      .action(async (options) => {
        await this.serveCommand(options);
      });

    // WebSocket 服务器启动命令
    program
      .command('serve-ws')
      .description('启动 MCP WebSocket 服务器')
      .option('-d, --data <dir>', '数据目录路径')
      .option('-p, --port <port>', 'WebSocket 端口', DEFAULT_WS_PORT.toString())
      .option('-H, --host <host>', 'WebSocket 主机', DEFAULT_WS_HOST)
      .action(async (options) => {
        await this.serveWebSocketCommand(options);
      });

    // 提取组件数据命令
    program
      .command('extract')
      .description('提取组件库数据')
      .option(
        '-p, --packages <dir>',
        '包目录路径',
        join(__dirname, '../../../packages'),
      )
      .option(
        '-k, --kit <dir>',
        '工具包目录路径 (kit/)',
        join(__dirname, '../../../kit'),
      )
      .option(
        '-i, --internal <dir>',
        '内部包目录路径 (internal/)',
        join(__dirname, '../../../internal'),
      )
      .option('-o, --output <dir>', '输出目录路径')
      .option('-v, --verbose', '显示详细输出', false)
      .option('--ignore <packages>', '忽略的包列表（逗号分隔）', '')
      .option('--incremental', '增量提取（仅提取变更的组件）', false)
      .action(async (options) => {
        await this.extractCommand(options);
      });

    // 验证数据命令
    program
      .command('validate')
      .description('验证组件数据完整性')
      .option('-d, --data <dir>', '数据目录路径')
      .action(async (options) => {
        await this.validateCommand(options);
      });

    // 统计信息命令
    program
      .command('stats')
      .description('显示组件库统计信息')
      .option('-d, --data <dir>', '数据目录路径')
      .action(async (options) => {
        await this.statsCommand(options);
      });

    // 清理缓存命令
    program
      .command('clean')
      .description('清理缓存数据')
      .option('-d, --data <dir>', '数据目录路径')
      .action(async (options) => {
        await this.cleanCommand(options);
      });

    // 健康检查命令
    program
      .command('health')
      .description('执行健康检查')
      .option('-d, --data <dir>', '数据目录路径')
      .option(
        '-p, --packages <dir>',
        '包目录路径',
        join(__dirname, '../../../packages'),
      )
      .option('--quick', '快速检查（仅检查关键项）', false)
      .action(async (options) => {
        await this.healthCommand(options);
      });

    // 同步版本命令
    program
      .command('sync-version')
      .description('同步组件库版本信息到 MCP Server')
      .option('-d, --data <dir>', '数据目录路径')
      .option(
        '-p, --packages <dir>',
        '包目录路径',
        join(__dirname, '../../../packages'),
      )
      .action(async (options) => {
        await this.syncVersionCommand(options);
      });
  }

  /**
   * 启动服务器命令
   */
  private async serveCommand(options: {
    data?: string;
    test?: boolean;
  }): Promise<void> {
    try {
      log.info(chalk.blue(TEXT_TEMPLATES.cliWelcome()));

      // 确保数据目录存在（如果提供了）
      if (options.data) {
        const fs = await import('node:fs/promises');
        await fs.mkdir(options.data, { recursive: true }).catch(() => {});
        log.info(chalk.gray(`数据目录: ${options.data}`));
      }

      const server = new McpServer(options.data, options.test);
      await server.start();

      // 显示统计信息
      const stats = server.getStats();
      log.info(chalk.green('✅ 服务器启动成功!'));
      log.info(chalk.gray(`已加载 ${stats.componentsLoaded} 个组件`));
      log.info(chalk.gray(`可用工具: ${stats.toolsAvailable} 个`));

      // 监听退出信号
      process.on('SIGINT', async () => {
        log.info(chalk.yellow('\n🛑 正在关闭服务器...'));
        await server.stop();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        log.info(chalk.yellow('\n🛑 正在关闭服务器...'));
        await server.stop();
        process.exit(0);
      });
    } catch (error) {
      log.error(chalk.red('❌ 启动服务器失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 提取组件数据命令
   */
  private async extractCommand(options: {
    packages: string;
    kit: string;
    internal: string;
    output?: string;
    verbose: boolean;
    ignore: string;
    incremental: boolean;
  }): Promise<void> {
    try {
      const isIncremental = options.incremental;
      log.info(
        chalk.blue(
          isIncremental
            ? '📦 开始增量提取组件数据...'
            : '📦 开始提取组件数据...',
        ),
      );

      // 使用默认输出目录或提供的目录
      const outputDir = options.output || join(__dirname, '../data');

      // 确保输出目录存在
      const fs = await import('node:fs/promises');
      await fs.mkdir(outputDir, { recursive: true }).catch(() => {});

      const config: ExtractorConfig = {
        packagesDir: options.packages,
        outputDir: outputDir,
        ignorePackages: options.ignore
          ? options.ignore.split(',').map((s) => s.trim())
          : [],
        enableCache: true,
        verbose: options.verbose,
      };

      // 验证配置
      const validationResult = validateExtractorConfig(config);
      if (!validationResult.isValid) {
        log.error(chalk.red('❌ 配置验证失败:'));
        validationResult.errors.forEach((error) => {
          log.error(chalk.red(`  - ${error}`));
        });
        process.exit(1);
      }

      if (validationResult.warnings.length > 0) {
        log.warn(chalk.yellow('⚠️ 配置警告:'));
        validationResult.warnings.forEach((warning) => {
          log.warn(chalk.yellow(`  - ${warning}`));
        });
      }

      // 动态导入提取脚本
      const { ComponentExtractor } = await import('./extractors/index');
      const extractor = new ComponentExtractor(config);

      let components;
      let icons: any[] = [];

      if (isIncremental) {
        // 增量提取：读取上次提取时间
        const metadataPath = join(config.outputDir, 'metadata.json');
        let lastExtractTime = new Date(0); // 默认为最早时间

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf8');
          const metadata = JSON.parse(metadataContent);
          if (metadata.extractedAt) {
            lastExtractTime = new Date(metadata.extractedAt);
            log.info(
              chalk.gray(`上次提取时间: ${lastExtractTime.toISOString()}`),
            );
          }
        } catch {
          log.warn(chalk.yellow('⚠️ 未找到上次提取记录，将执行全量提取'));
        }

        // 执行增量提取
        components =
          await extractor.extractIncrementalComponents(lastExtractTime);

        // 增量模式下，需要合并现有数据
        if (components.length > 0) {
          try {
            const indexPath = join(config.outputDir, 'components-index.json');
            const indexContent = await fs.readFile(indexPath, 'utf8');
            const existingIndex = JSON.parse(indexContent);

            // 合并组件：更新已存在的，添加新的
            const componentMap = new Map(
              existingIndex.components.map((c: any) => [c.packageName, c]),
            );
            for (const comp of components) {
              componentMap.set(comp.packageName, comp);
            }

            // 更新索引（简化版，仅更新组件列表）
            existingIndex.components = Array.from(componentMap.values());
            existingIndex.lastUpdated = new Date().toISOString();

            await fs.writeFile(
              indexPath,
              JSON.stringify(existingIndex, null, 2),
              'utf8',
            );
            log.info(chalk.green(`📝 已更新组件索引`));
          } catch (error) {
            log.warn(chalk.yellow('⚠️ 无法合并现有数据，将覆盖'), error);
          }
        }
      } else {
        // 全量提取
        const result = await extractor.extractAndSaveAllComponents();
        components = result.components;
        icons = result.icons;

        // 提取工具包
        const { ToolPackageExtractor } = await import('./extractors/index');
        const { DataManager } = await import('./utils/data-manager');
        const toolExtractor = new ToolPackageExtractor();
        const dataManager = new DataManager(config.outputDir);

        const kitPackages = await toolExtractor.extractFromDirectory(
          options.kit,
          'kit',
        );
        const internalPackages = await toolExtractor.extractFromDirectory(
          options.internal,
          'internal',
        );
        const allToolPackages = [...kitPackages, ...internalPackages];

        if (allToolPackages.length > 0) {
          await dataManager.saveToolPackages(allToolPackages);
          log.info(
            chalk.green(`✅ 成功提取 ${allToolPackages.length} 个工具包`),
          );
        }
      }

      // 保存元数据
      const metadata = {
        extractedAt: new Date().toISOString(),
        totalComponents: components.length,
        totalIcons: icons.length,
        totalItems: components.length + icons.length,
        version: '1.0.0',
        incremental: isIncremental,
      };

      const metadataPath = join(config.outputDir, 'metadata.json');
      await fs.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        'utf8',
      );
      log.info(chalk.green(`📊 元数据已保存到: ${metadataPath}`));

      if (isIncremental) {
        log.info(
          chalk.green(`✅ 增量提取完成，更新了 ${components.length} 个组件`),
        );
      } else {
        log.info(
          chalk.green(
            `✅ 成功提取 ${components.length} 个组件和 ${icons.length} 个图标`,
          ),
        );
      }

      process.exit(0);
    } catch (error) {
      log.error(chalk.red('❌ 提取数据失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 验证数据命令
   */
  private async validateCommand(options: { data?: string }): Promise<void> {
    try {
      log.info(chalk.blue('🔍 验证组件数据...'));

      // 使用默认数据目录如果未提供
      const dataDir = options.data || join(__dirname, '../data');

      const { readFile } = await import('node:fs/promises');
      const indexPath = join(dataDir, 'components-index.json');

      const content = await readFile(indexPath, 'utf8');
      const index = JSON.parse(content);

      let errors = 0;

      // 验证必需字段
      for (const component of index.components) {
        if (!component.name) {
          log.info(chalk.red(`❌ 组件缺少 name: ${component.packageName}`));
          errors++;
        }
        if (!component.packageName) {
          log.info(chalk.red(`❌ 组件缺少 packageName: ${component.name}`));
          errors++;
        }
        if (!component.version) {
          log.info(chalk.yellow(`⚠️ 组件缺少 version: ${component.name}`));
        }
      }

      if (errors === 0) {
        log.info(chalk.green('✅ 数据验证通过'));
        process.exit(0);
      } else {
        log.info(chalk.red(`❌ 发现 ${errors} 个错误`));
        process.exit(1);
      }
    } catch (error) {
      log.error(chalk.red('❌ 验证数据失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 统计信息命令
   */
  private async statsCommand(options: { data?: string }): Promise<void> {
    try {
      log.info(chalk.blue('📊 组件库统计信息'));
      log.info(chalk.blue('==================='));

      // 使用默认数据目录如果未提供
      const dataDir = options.data || join(__dirname, '../data');

      const { readFile } = await import('node:fs/promises');
      const indexPath = join(dataDir, 'components-index.json');

      const content = await readFile(indexPath, 'utf8');
      const index = JSON.parse(content);

      log.info(`总组件数: ${chalk.cyan(index.components.length)}`);
      log.info(`分类数: ${chalk.cyan(index.categories.length)}`);
      log.info(`标签数: ${chalk.cyan(index.tags.length)}`);
      log.info(`最后更新: ${chalk.gray(index.lastUpdated)}`);

      // 分类统计
      log.info('\n📂 分类分布:');
      const categoryStats: Record<string, number> = {};
      for (const component of index.components) {
        categoryStats[component.category] =
          (categoryStats[component.category] || 0) + 1;
      }
      for (const [category, count] of Object.entries(categoryStats)) {
        log.info(`  ${category}: ${chalk.cyan(count)} 个组件`);
      }

      // Props 统计
      const totalProps = index.components.reduce(
        (sum: number, comp: any) => sum + comp.props.length,
        0,
      );
      const avgProps = Math.round(totalProps / index.components.length);
      log.info(
        `\n📝 Props 统计: 总计 ${chalk.cyan(totalProps)} 个，平均 ${chalk.cyan(avgProps)} 个/组件`,
      );

      // 示例统计
      const totalExamples = index.components.reduce(
        (sum: number, comp: any) => sum + comp.examples.length,
        0,
      );
      const avgExamples = Math.round(totalExamples / index.components.length);
      log.info(
        `📚 示例统计: 总计 ${chalk.cyan(totalExamples)} 个，平均 ${chalk.cyan(avgExamples)} 个/组件`,
      );

      // 明确退出进程
      process.exit(0);
    } catch (error) {
      log.error(chalk.red('❌ 获取统计信息失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 清理缓存命令
   */
  private async cleanCommand(options: { data?: string }): Promise<void> {
    try {
      log.info(chalk.blue('🧹 清理缓存数据...'));

      // 使用默认数据目录如果未提供
      const dataDir = options.data || join(__dirname, '../data');

      const { rm } = await import('node:fs/promises');
      const cacheDir = join(dataDir, '.cache');

      await rm(cacheDir, { recursive: true, force: true });
      log.info(chalk.green('✅ 缓存清理完成'));
      process.exit(0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        log.info(chalk.yellow('⚠️ 缓存目录不存在'));
        process.exit(0);
      } else {
        log.error(chalk.red('❌ 清理缓存失败:'), error);
        process.exit(1);
      }
    }
  }

  /**
   * 同步版本命令
   */
  private async syncVersionCommand(options: {
    data?: string;
    packages: string;
  }): Promise<void> {
    try {
      log.info(chalk.blue('🔄 同步组件库版本信息...'));

      // 使用默认数据目录如果未提供
      const dataDir = options.data || join(__dirname, '../data');

      const fs = await import('node:fs/promises');
      const path = await import('node:path');

      // 读取现有组件索引
      const indexPath = path.join(dataDir, 'components-index.json');
      let componentIndex;

      try {
        const content = await fs.readFile(indexPath, 'utf8');
        componentIndex = JSON.parse(content);
      } catch (error) {
        log.warn(chalk.yellow('⚠️ 未找到现有组件索引，将创建新索引'), error);
        componentIndex = {
          components: [],
          categories: [],
          tags: [],
          lastUpdated: new Date().toISOString(),
          version: '1.0.0',
        };
      }

      // 查找所有包的 package.json
      const glob = await import('glob');
      const packageJson = await glob.glob(
        `${options.packages}/**/package.json`,
        {
          ignore: '**/node_modules/**',
        },
      );

      let updatedCount = 0;

      // 更新版本信息
      for (const packageJsonPath of packageJson) {
        try {
          const content = await fs.readFile(packageJsonPath, 'utf8');
          const packageInfo = JSON.parse(content);
          const packageDir = path.dirname(packageJsonPath);
          const packageName = packageInfo.name;

          // 查找对应组件
          const componentIdx = componentIndex.components.findIndex(
            (c: any) => c.packageName === packageName,
          );

          if (componentIdx !== -1) {
            // 更新版本
            const oldVersion = componentIndex.components[componentIdx].version;
            if (oldVersion !== packageInfo.version) {
              componentIndex.components[componentIdx].version =
                packageInfo.version;
              updatedCount++;

              log.info(
                chalk.green(
                  `✅ 更新组件版本: ${packageName} ${oldVersion} -> ${packageInfo.version}`,
                ),
              );

              // 检查是否有 CHANGELOG.md
              const changelogPath = path.join(packageDir, 'CHANGELOG.md');
              try {
                await fs.access(changelogPath);
                // 这里可以添加提取 CHANGELOG 的逻辑
              } catch {
                // CHANGELOG 不存在，跳过
              }
            }
          }
        } catch (error) {
          log.warn(chalk.yellow(`⚠️ 处理 ${packageJsonPath} 时出错:`, error));
        }
      }

      // 更新最后更新时间
      componentIndex.lastUpdated = new Date().toISOString();

      // 保存更新后的索引
      await fs.mkdir(path.dirname(indexPath), { recursive: true });
      await fs.writeFile(
        indexPath,
        JSON.stringify(componentIndex, null, 2),
        'utf8',
      );

      log.info(
        chalk.green(`✅ 同步完成，更新了 ${updatedCount} 个组件的版本信息`),
      );
      process.exit(0);
    } catch (error) {
      log.error(chalk.red('❌ 同步版本失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 健康检查命令
   */
  private async healthCommand(_options: {
    data?: string;
    packages: string;
    quick: boolean;
  }): Promise<void> {
    try {
      log.info(chalk.blue('🏥 执行健康检查...'));

      const monitoring = createMonitoringManager();

      // quick 选项已废弃，统一使用 performHealthCheck
      const result = await monitoring.performHealthCheck();

      const output = formatHealthCheckResult(result);
      log.info(output);

      // 根据检查结果设置退出码
      if (result.status === 'error') {
        process.exit(1);
      } else if (result.status === 'warning') {
        process.exit(2);
      } else {
        process.exit(0);
      }
    } catch (error) {
      log.error(chalk.red('❌ 健康检查失败:'), error);
      process.exit(1);
    }
  }

  /**
   * WebSocket 服务器启动命令
   */
  private async serveWebSocketCommand(options: {
    data?: string;
    port: string;
    host: string;
  }): Promise<void> {
    try {
      // 使用默认数据目录如果未提供
      const dataDir = options.data || join(__dirname, '../data');

      log.info(chalk.blue(TEXT_TEMPLATES.wsStart()));
      log.info(chalk.gray(`数据目录: ${dataDir}`));
      log.info(
        chalk.gray(`WebSocket 地址: ws://${options.host}:${options.port}`),
      );

      // 确保数据目录存在
      const fs = await import('node:fs/promises');
      await fs.mkdir(dataDir, { recursive: true }).catch(() => {});

      // 动态导入服务器类
      const { McpServer } = await import('./server/index');

      // 创建服务器实例
      const server = new McpServer(dataDir);

      // 启动 WebSocket 服务器
      const port = parseInt(options.port, 10);
      await server.startWebSocket(port, options.host);

      // 获取并显示统计信息
      const stats = server.getStats();
      log.info(chalk.green('✅ WebSocket 服务器启动成功!'));
      log.info(chalk.gray(`已加载 ${stats.componentsLoaded} 个组件`));
      log.info(chalk.gray(`可用工具: ${stats.toolsAvailable} 个`));
      log.info(
        chalk.cyan(`WebSocket 端点: ws://${options.host}:${options.port}`),
      );

      // 优雅关闭处理
      const gracefulShutdown = () => {
        log.info(chalk.yellow('\n🛑 正在关闭 WebSocket 服务器...'));
        server.stop().then(() => {
          process.exit(0);
        });
      };

      process.on('SIGINT', gracefulShutdown);
      process.on('SIGTERM', gracefulShutdown);

      // 保持进程运行
      log.info(chalk.gray('按 Ctrl+C 停止服务器'));
    } catch (error) {
      log.error(chalk.red('❌ WebSocket 服务器启动失败:'), error);
      process.exit(1);
    }
  }

  /**
   * 运行 CLI
   */
  async run(): Promise<void> {
    // 无参数时默认启动服务器
    if (process.argv.length <= 2) {
      await this.serveCommand({ test: false });
      return;
    }

    program.parse();
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  try {
    const cli = new McpCli();
    await cli.run();
  } catch (error) {
    console.error('Main function error:', error);
    process.exit(1);
  }
}

// 如果直接运行此文件，启动 CLI
// 使用 fileURLToPath 确保跨平台兼容（Windows 和 Unix）
const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1]
  ? fileURLToPath(`file://${process.argv[1].replace(/\\/g, '/')}`)
  : '';

if (
  currentFilePath.endsWith('/cli.js') ||
  currentFilePath.endsWith('\\cli.js') ||
  currentFilePath === executedFilePath
) {
  main().catch((error) => {
    console.error('CLI 启动失败:', error);
    process.exit(1);
  });
}

export { McpCli };
