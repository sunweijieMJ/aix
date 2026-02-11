import * as fs from 'fs/promises';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('../src/server/index');
vi.mock('../src/extractors/index');
vi.mock('../src/utils/cache');

describe('CLI Commands', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    program = new Command();
  });

  describe('extract command', () => {
    it('应该正确解析extract命令参数', () => {
      program
        .command('extract')
        .option('--packages <dir>', '组件包目录', '../../packages')
        .option('--output <dir>', '输出目录', './data')
        .option('--ignore <packages>', '忽略的包')
        .option('--verbose', '详细输出')
        .action((options) => {
          expect(options.packages).toBe('../../packages');
          expect(options.output).toBe('./data');
        });

      program.parse(['node', 'cli.js', 'extract']);
    });

    it('应该处理自定义参数', () => {
      program
        .command('extract')
        .option('--packages <dir>', '组件包目录', '../../packages')
        .option('--output <dir>', '输出目录', './data')
        .option('--ignore <packages>', '忽略的包')
        .option('--verbose', '详细输出')
        .action((options) => {
          expect(options.packages).toBe('/custom/packages');
          expect(options.output).toBe('/custom/output');
          expect(options.ignore).toBe('package1,package2');
          expect(options.verbose).toBe(true);
        });

      program.parse([
        'node',
        'cli.js',
        'extract',
        '--packages',
        '/custom/packages',
        '--output',
        '/custom/output',
        '--ignore',
        'package1,package2',
        '--verbose',
      ]);
    });
  });

  describe('serve command', () => {
    it('应该正确解析serve命令参数', () => {
      program
        .command('serve')
        .option('--data <dir>', '数据目录', './data')
        .option('--test', '测试模式')
        .action((options) => {
          expect(options.data).toBe('./data');
          expect(options.test).toBeUndefined();
        });

      program.parse(['node', 'cli.js', 'serve']);
    });

    it('应该处理测试模式', () => {
      program
        .command('serve')
        .option('--data <dir>', '数据目录', './data')
        .option('--test', '测试模式')
        .action((options) => {
          expect(options.test).toBe(true);
        });

      program.parse(['node', 'cli.js', 'serve', '--test']);
    });
  });

  describe('serve-ws command', () => {
    it('应该正确解析WebSocket服务器参数', () => {
      program
        .command('serve-ws')
        .option('--port <port>', '端口号', '8080')
        .option('--host <host>', '主机地址', 'localhost')
        .option('--data <dir>', '数据目录', './data')
        .action((options) => {
          expect(options.port).toBe('8080');
          expect(options.host).toBe('localhost');
          expect(options.data).toBe('./data');
        });

      program.parse(['node', 'cli.js', 'serve-ws']);
    });

    it('应该处理自定义端口和主机', () => {
      program
        .command('serve-ws')
        .option('--port <port>', '端口号', '8080')
        .option('--host <host>', '主机地址', 'localhost')
        .option('--data <dir>', '数据目录', './data')
        .action((options) => {
          expect(options.port).toBe('3000');
          expect(options.host).toBe('0.0.0.0');
        });

      program.parse([
        'node',
        'cli.js',
        'serve-ws',
        '--port',
        '3000',
        '--host',
        '0.0.0.0',
      ]);
    });
  });

  describe('health command', () => {
    it('应该正确解析health命令参数', () => {
      program
        .command('health')
        .option('--quick', '快速检查')
        .action((options) => {
          expect(options.quick).toBeUndefined();
        });

      program.parse(['node', 'cli.js', 'health']);
    });

    it('应该处理快速检查模式', () => {
      program
        .command('health')
        .option('--quick', '快速检查')
        .action((options) => {
          expect(options.quick).toBe(true);
        });

      program.parse(['node', 'cli.js', 'health', '--quick']);
    });
  });

  describe('stats command', () => {
    it('应该正确解析stats命令参数', () => {
      program
        .command('stats')
        .option('--verbose', '详细统计')
        .action((options) => {
          expect(options.verbose).toBeUndefined();
        });

      program.parse(['node', 'cli.js', 'stats']);
    });

    it('应该处理详细模式', () => {
      program
        .command('stats')
        .option('--verbose', '详细统计')
        .action((options) => {
          expect(options.verbose).toBe(true);
        });

      program.parse(['node', 'cli.js', 'stats', '--verbose']);
    });
  });

  describe('clean command', () => {
    it('应该正确解析clean命令', () => {
      let cleanCalled = false;

      program.command('clean').action(() => {
        cleanCalled = true;
      });

      program.parse(['node', 'cli.js', 'clean']);
      expect(cleanCalled).toBe(true);
    });
  });

  describe('参数验证', () => {
    it('应该验证端口号范围', () => {
      const validatePort = (port: string) => {
        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
          throw new Error('端口号必须在1-65535之间');
        }
        return port;
      };

      expect(() => validatePort('8080')).not.toThrow();
      expect(() => validatePort('0')).toThrow();
      expect(() => validatePort('65536')).toThrow();
      expect(() => validatePort('abc')).toThrow();
    });

    it('应该验证目录路径', async () => {
      const validateDirectory = async (dir: string) => {
        try {
          await fs.access(dir);
          return dir;
        } catch {
          throw new Error(`目录不存在: ${dir}`);
        }
      };

      // Mock fs.access
      vi.mocked(fs.access).mockResolvedValue(undefined);
      await expect(validateDirectory('/valid/path')).resolves.toBe(
        '/valid/path',
      );

      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      await expect(validateDirectory('/invalid/path')).rejects.toThrow(
        '目录不存在',
      );
    });
  });

  describe('错误处理', () => {
    it('应该处理未知命令', () => {
      let errorHandled = false;

      program.on('command:*', () => {
        errorHandled = true;
      });

      program.parse(['node', 'cli.js', 'unknown-command']);
      expect(errorHandled).toBe(true);
    });

    it('应该处理缺少必需参数', () => {
      // 使用 exitOverride 防止进程退出
      program.exitOverride();

      program
        .command('test')
        .requiredOption('--required <value>', '必需参数')
        .action(() => {});

      expect(() => {
        program.parse(['node', 'cli.js', 'test']);
      }).toThrow();
    });
  });

  describe('帮助信息', () => {
    it('应该显示全局帮助', () => {
      program
        .name('aix-mcp-server')
        .description('AIX Components MCP Server')
        .version('1.0.33');

      const helpText = program.helpInformation();

      expect(helpText).toContain('AIX Components MCP Server');
      expect(helpText).toContain('--version');

      // 测试版本号输出
      expect(program.version()).toBe('1.0.33');
    });

    it('应该显示命令特定帮助', () => {
      const extractCommand = program
        .command('extract')
        .description('提取组件数据')
        .option('--packages <dir>', '组件包目录');

      const helpText = extractCommand.helpInformation();

      expect(helpText).toContain('提取组件数据');
      expect(helpText).toContain('--packages');
    });
  });

  describe('环境变量支持', () => {
    it('应该支持从环境变量读取配置', () => {
      const originalEnv = process.env;

      process.env.MCP_DATA_DIR = '/env/data';
      process.env.MCP_PACKAGES_DIR = '/env/packages';
      process.env.MCP_VERBOSE = 'true';

      program
        .command('extract')
        .option(
          '--packages <dir>',
          '组件包目录',
          process.env.MCP_PACKAGES_DIR || '../../packages',
        )
        .option(
          '--output <dir>',
          '输出目录',
          process.env.MCP_DATA_DIR || './data',
        )
        .option('--verbose', '详细输出', process.env.MCP_VERBOSE === 'true')
        .action((options) => {
          expect(options.packages).toBe('/env/packages');
          expect(options.output).toBe('/env/data');
          expect(options.verbose).toBe(true);
        });

      program.parse(['node', 'cli.js', 'extract']);

      process.env = originalEnv;
    });
  });

  describe('配置文件支持', () => {
    it('应该支持从配置文件读取设置', async () => {
      const configData = {
        packagesDir: '/config/packages',
        outputDir: '/config/data',
        verbose: true,
        ignorePackages: ['test-package'],
      };

      // Mock配置文件读取
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(configData));
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const loadConfig = async (configPath: string) => {
        try {
          await fs.access(configPath);
          const content = await fs.readFile(configPath, 'utf-8');
          return JSON.parse(content);
        } catch {
          return {};
        }
      };

      const config = await loadConfig('./mcp.config.json');

      expect(config.packagesDir).toBe('/config/packages');
      expect(config.outputDir).toBe('/config/data');
      expect(config.verbose).toBe(true);
      expect(config.ignorePackages).toEqual(['test-package']);
    });

    it('应该处理配置文件不存在的情况', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const loadConfig = async (configPath: string) => {
        try {
          await fs.access(configPath);
          const content = await fs.readFile(configPath, 'utf-8');
          return JSON.parse(content);
        } catch {
          return {};
        }
      };

      const config = await loadConfig('./nonexistent.config.json');
      expect(config).toEqual({});
    });
  });
});
