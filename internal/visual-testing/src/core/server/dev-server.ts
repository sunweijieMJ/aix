/**
 * 开发服务器自动启动管理
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { logger } from '../../utils/logger';

const log = logger.child('DevServer');

/**
 * 服务器配置
 */
export interface ServerConfig {
  /** 服务器 URL */
  url: string;
  /** 启动命令 */
  command?: string;
  /** 等待资源（URL 或 端口） */
  waitOn?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 是否自动启动 */
  autoStart?: boolean;
}

/**
 * 开发服务器管理器
 */
export class DevServer {
  private process: ChildProcess | null = null;
  private config: ServerConfig;
  private exitListener: (() => void) | null = null;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  /**
   * 启动开发服务器
   */
  async start(): Promise<void> {
    if (!this.config.autoStart || !this.config.command) {
      log.debug('Server auto-start disabled or no command configured');
      return;
    }

    log.info(`Starting dev server: ${this.config.command}`);

    try {
      const command = this.config.command.trim();
      if (!command) {
        throw new Error('Empty server command');
      }

      // 使用 shell 模式执行命令，支持带空格路径、引号参数和管道等 shell 语法
      this.process = spawn(command, {
        stdio: 'pipe',
        detached: false,
        shell: true,
      });

      // 监听进程输出（可选，用于调试）
      if (this.process.stdout) {
        this.process.stdout.on('data', (data) => {
          log.debug(`[server] ${data.toString().trim()}`);
        });
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data) => {
          log.debug(`[server:error] ${data.toString().trim()}`);
        });
      }

      // 监听进程退出
      this.exitListener = () => {
        this.process = null;
        this.exitListener = null;
      };
      this.process.on('exit', (code) => {
        log.info(`Dev server exited with code ${code}`);
        this.exitListener?.();
      });

      // 等待服务器就绪
      await this.waitForServer();

      log.info(`Dev server ready at ${this.config.url}`);
    } catch (error) {
      log.error('Failed to start dev server', error);
      throw error;
    }
  }

  /**
   * 停止开发服务器
   */
  async stop(): Promise<void> {
    if (!this.process || this.process.exitCode !== null) {
      this.process = null;
      return;
    }

    log.info('Stopping dev server...');

    try {
      // 尝试优雅关闭
      this.process.kill('SIGTERM');

      // 等待 5 秒，如果还没关闭就强制关闭
      await this.waitForExit(5000);

      if (this.process && this.process.exitCode === null) {
        log.warn('Server did not exit gracefully, force killing...');
        this.process.kill('SIGKILL');
        // 等待进程在 SIGKILL 后真正退出，防止僵尸进程
        await this.waitForExit(2000);
      }

      this.process = null;
      log.info('Dev server stopped');
    } catch (error) {
      log.error('Failed to stop dev server', error);
      // 不抛出错误，确保清理继续
    }
  }

  /**
   * 等待服务器就绪
   */
  private async waitForServer(): Promise<void> {
    const timeout = this.config.timeout ?? 60_000;
    const startTime = Date.now();
    const checkInterval = 500; // 每 500ms 检查一次

    while (Date.now() - startTime < timeout) {
      // 检查进程是否已崩溃退出
      if (this.process && this.process.exitCode !== null) {
        throw new Error(
          `Dev server process exited unexpectedly with code ${this.process.exitCode}. Check your server command.`,
        );
      }

      try {
        // 尝试连接服务器（优先使用 waitOn 配置的健康检查地址）
        const target = this.config.waitOn ?? this.config.url;
        const response = await fetch(target, {
          signal: AbortSignal.timeout(2000),
        });

        // 非 5xx 表示服务器已启动（含 2xx/3xx/4xx）
        if (response.status < 500) {
          return;
        }
      } catch {
        // 连接失败，继续等待
      }

      // 等待一段时间后重试
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    throw new Error(
      `Dev server did not start within ${timeout}ms. Check your server command.`,
    );
  }

  /**
   * 等待进程退出
   */
  private async waitForExit(timeout: number): Promise<void> {
    if (!this.process) {
      return;
    }

    const proc = this.process;

    return new Promise<void>((resolve) => {
      const onExit = () => {
        clearTimeout(timer);
        resolve();
      };

      const timer = setTimeout(() => {
        proc.removeListener('exit', onExit);
        resolve();
      }, timeout);

      proc.once('exit', onExit);
    });
  }

  /**
   * 检查服务器是否正在运行
   */
  isRunning(): boolean {
    return this.process !== null && this.process.exitCode === null;
  }
}
