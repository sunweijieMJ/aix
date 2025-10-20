import os from 'os';
import { config } from '../config';
import { checkDatabaseHealth } from '../database/pgConnection';
import { checkCacheHealth } from '../cache';
import { createLogger } from '../utils/logger';

const logger = createLogger('HEALTH');

/**
 * 健康检查状态枚举
 */
export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
}

/**
 * 组件健康状态
 */
export interface ComponentHealth {
  status: HealthStatus;
  message?: string;
  details?: any;
  lastCheck: string;
  responseTime?: number;
}

/**
 * 系统健康状态
 */
export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: {
    database: ComponentHealth;
    cache: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
    network: ComponentHealth;
  };
  metrics: {
    cpu: {
      usage: number;
      loadAverage: number[];
    };
    memory: {
      total: number;
      used: number;
      free: number;
      usagePercent: number;
    };
    disk: {
      total: number;
      used: number;
      free: number;
      usagePercent: number;
    };
    process: {
      pid: number;
      uptime: number;
      memoryUsage: NodeJS.MemoryUsage;
      cpuUsage: NodeJS.CpuUsage;
    };
  };
}

/**
 * 健康检查管理器
 */
export class HealthCheckManager {
  private static instance: HealthCheckManager;
  private startTime: number;
  private lastHealthCheck: SystemHealth | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isChecking = false;

  private constructor() {
    this.startTime = Date.now();
    this.setupPeriodicHealthCheck();
  }

  static getInstance(): HealthCheckManager {
    if (!HealthCheckManager.instance) {
      HealthCheckManager.instance = new HealthCheckManager();
    }
    return HealthCheckManager.instance;
  }

  /**
   * 设置定期健康检查
   */
  private setupPeriodicHealthCheck(): void {
    if (config.monitoring.healthCheck.enabled) {
      const interval = 30000; // 30秒检查一次
      this.healthCheckInterval = setInterval(() => {
        this.performHealthCheck().catch(error => {
          logger.error('Periodic health check failed:', error);
        });
      }, interval);

      logger.info(`Periodic health check enabled (interval: ${interval}ms)`);
    }
  }

  /**
   * 执行完整的健康检查
   */
  async performHealthCheck(): Promise<SystemHealth> {
    if (this.isChecking) {
      return this.lastHealthCheck || this.createEmptyHealthStatus();
    }

    this.isChecking = true;
    const startTime = Date.now();

    try {
      logger.debug('Starting system health check');

      const [databaseHealth, cacheHealth, memoryHealth, diskHealth, networkHealth, systemMetrics] = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkCacheHealth(),
        this.checkMemoryHealth(),
        this.checkDiskHealth(),
        this.checkNetworkHealth(),
        this.getSystemMetrics(),
      ]);

      const components = {
        database: databaseHealth,
        cache: cacheHealth,
        memory: memoryHealth,
        disk: diskHealth,
        network: networkHealth,
      };

      // 确定整体健康状态
      const overallStatus = this.determineOverallStatus(components);

      const health: SystemHealth = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: '1.0.0',
        environment: config.env.NODE_ENV,
        components,
        metrics: systemMetrics,
      };

      this.lastHealthCheck = health;

      const checkDuration = Date.now() - startTime;
      logger.debug(`Health check completed in ${checkDuration}ms, status: ${overallStatus}`);

      return health;
    } catch (error) {
      logger.error('Health check failed:', error);

      const errorHealth: SystemHealth = {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime,
        version: '1.0.0',
        environment: config.env.NODE_ENV,
        components: {
          database: this.createErrorComponent('Database check failed', error),
          cache: this.createErrorComponent('Cache check failed', error),
          memory: this.createErrorComponent('Memory check failed', error),
          disk: this.createErrorComponent('Disk check failed', error),
          network: this.createErrorComponent('Network check failed', error),
        },
        metrics: await this.getSystemMetrics(),
      };

      return errorHealth;
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * 检查数据库健康状态
   */
  private async checkDatabaseHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const dbHealth = await checkDatabaseHealth();
      const responseTime = Date.now() - startTime;

      return {
        status: dbHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: dbHealth.healthy ? 'Database is operational' : 'Database issues detected',
        details: dbHealth.details,
        lastCheck: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      return this.createErrorComponent('Database connection failed', error, Date.now() - startTime);
    }
  }

  /**
   * 检查缓存健康状态
   */
  private async checkCacheHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const cacheHealth = await checkCacheHealth();
      const responseTime = Date.now() - startTime;

      return {
        status: cacheHealth.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY,
        message: cacheHealth.healthy ? 'Cache is operational' : 'Cache issues detected',
        details: cacheHealth.details,
        lastCheck: new Date().toISOString(),
        responseTime,
      };
    } catch (error) {
      return this.createErrorComponent('Cache check failed', error, Date.now() - startTime);
    }
  }

  /**
   * 检查内存健康状态
   */
  private async checkMemoryHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const usedMemory = totalMemory - freeMemory;
      const usagePercent = (usedMemory / totalMemory) * 100;

      const processMemory = process.memoryUsage();
      const heapUsagePercent = (processMemory.heapUsed / processMemory.heapTotal) * 100;

      let status = HealthStatus.HEALTHY;
      let message = 'Memory usage is normal';

      if (usagePercent > 90 || heapUsagePercent > 90) {
        status = HealthStatus.UNHEALTHY;
        message = 'Critical memory usage detected';
      } else if (usagePercent > 80 || heapUsagePercent > 80) {
        status = HealthStatus.DEGRADED;
        message = 'High memory usage detected';
      }

      return {
        status,
        message,
        details: {
          system: {
            total: totalMemory,
            used: usedMemory,
            free: freeMemory,
            usagePercent: Math.round(usagePercent * 100) / 100,
          },
          process: {
            ...processMemory,
            heapUsagePercent: Math.round(heapUsagePercent * 100) / 100,
          },
        },
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return this.createErrorComponent('Memory check failed', error, Date.now() - startTime);
    }
  }

  /**
   * 检查磁盘健康状态
   */
  private async checkDiskHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // 简化的磁盘检查，实际项目中可能需要更复杂的逻辑
      await import('fs').then(fs => fs.promises.stat(process.cwd()));

      return {
        status: HealthStatus.HEALTHY,
        message: 'Disk is accessible',
        details: {
          workingDirectory: process.cwd(),
          accessible: true,
        },
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return this.createErrorComponent('Disk check failed', error, Date.now() - startTime);
    }
  }

  /**
   * 检查网络健康状态
   */
  private async checkNetworkHealth(): Promise<ComponentHealth> {
    const startTime = Date.now();

    try {
      // 检查网络接口
      const networkInterfaces = os.networkInterfaces();
      const hasActiveInterface = Object.values(networkInterfaces).some(interfaces =>
        interfaces?.some(iface => !iface.internal && iface.family === 'IPv4'),
      );

      return {
        status: hasActiveInterface ? HealthStatus.HEALTHY : HealthStatus.DEGRADED,
        message: hasActiveInterface ? 'Network interfaces are active' : 'No active network interfaces',
        details: {
          interfaces: networkInterfaces,
          hasActiveInterface,
        },
        lastCheck: new Date().toISOString(),
        responseTime: Date.now() - startTime,
      };
    } catch (error) {
      return this.createErrorComponent('Network check failed', error, Date.now() - startTime);
    }
  }

  /**
   * 获取系统指标
   */
  private async getSystemMetrics(): Promise<SystemHealth['metrics']> {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
      cpu: {
        usage: this.getCPUUsage(),
        loadAverage: os.loadavg(),
      },
      memory: {
        total: totalMemory,
        used: usedMemory,
        free: freeMemory,
        usagePercent: Math.round((usedMemory / totalMemory) * 10000) / 100,
      },
      disk: {
        total: 0, // 需要额外的库来获取磁盘信息
        used: 0,
        free: 0,
        usagePercent: 0,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
      },
    };
  }

  /**
   * 获取CPU使用率（简化版本）
   */
  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;

    return Math.round((1 - idle / total) * 10000) / 100;
  }

  /**
   * 确定整体健康状态
   */
  private determineOverallStatus(components: SystemHealth['components']): HealthStatus {
    const statuses = Object.values(components).map(component => component.status);

    if (statuses.includes(HealthStatus.UNHEALTHY)) {
      return HealthStatus.UNHEALTHY;
    }

    if (statuses.includes(HealthStatus.DEGRADED)) {
      return HealthStatus.DEGRADED;
    }

    return HealthStatus.HEALTHY;
  }

  /**
   * 创建错误组件状态
   */
  private createErrorComponent(message: string, error: any, responseTime?: number): ComponentHealth {
    return {
      status: HealthStatus.UNHEALTHY,
      message,
      details: {
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      lastCheck: new Date().toISOString(),
      responseTime,
    };
  }

  /**
   * 创建空的健康状态
   */
  private createEmptyHealthStatus(): SystemHealth {
    return {
      status: HealthStatus.UNHEALTHY,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: '1.0.0',
      environment: config.env.NODE_ENV,
      components: {
        database: this.createErrorComponent('Health check in progress', undefined),
        cache: this.createErrorComponent('Health check in progress', undefined),
        memory: this.createErrorComponent('Health check in progress', undefined),
        disk: this.createErrorComponent('Health check in progress', undefined),
        network: this.createErrorComponent('Health check in progress', undefined),
      },
      metrics: {
        cpu: { usage: 0, loadAverage: [0, 0, 0] },
        memory: { total: 0, used: 0, free: 0, usagePercent: 0 },
        disk: { total: 0, used: 0, free: 0, usagePercent: 0 },
        process: {
          pid: process.pid,
          uptime: 0,
          memoryUsage: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 },
          cpuUsage: { user: 0, system: 0 },
        },
      },
    };
  }

  /**
   * 获取最近的健康检查结果
   */
  getLastHealthCheck(): SystemHealth | null {
    return this.lastHealthCheck;
  }

  /**
   * 停止定期健康检查
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Periodic health check stopped');
    }
  }

  /**
   * 获取简化的健康状态（用于快速检查）
   */
  async getQuickHealth(): Promise<{ status: HealthStatus; timestamp: string }> {
    if (this.lastHealthCheck && Date.now() - new Date(this.lastHealthCheck.timestamp).getTime() < 60000) {
      // 如果最近1分钟内有健康检查结果，直接返回
      return {
        status: this.lastHealthCheck.status,
        timestamp: this.lastHealthCheck.timestamp,
      };
    }

    // 否则执行快速检查
    try {
      const dbCheck = await checkDatabaseHealth();
      const status = dbCheck.healthy ? HealthStatus.HEALTHY : HealthStatus.UNHEALTHY;

      return {
        status,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        status: HealthStatus.UNHEALTHY,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// 导出单例实例
export const healthManager = HealthCheckManager.getInstance();
