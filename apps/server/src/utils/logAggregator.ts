/**
 * 日志聚合器
 * 提供日志收集、统计和查询功能
 */
import fs from 'fs/promises';
import path from 'path';
import { createLogger } from './logger';

const logger = createLogger('LOG_AGGREGATOR');

/**
 * 日志条目接口
 */
export interface ILogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * 日志统计接口
 */
export interface ILogStatistics {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByContext: Record<string, number>;
  errorRate: number;
  recentErrors: ILogEntry[];
  timeRange: {
    start: string;
    end: string;
  };
}

/**
 * 日志查询选项
 */
export interface ILogQueryOptions {
  level?: string;
  context?: string;
  requestId?: string;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

/**
 * 日志聚合器类
 */
export class LogAggregator {
  private logs: ILogEntry[] = [];
  private readonly maxLogs = 10000; // 内存中最多保留10000条日志
  private logDir: string;

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(process.cwd(), 'logs');
  }

  /**
   * 添加日志条目到内存缓存
   */
  addLog(entry: ILogEntry): void {
    this.logs.push(entry);

    // 限制内存中的日志数量
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * 查询日志
   */
  async queryLogs(options: ILogQueryOptions = {}): Promise<{
    total: number;
    logs: ILogEntry[];
    hasMore: boolean;
  }> {
    try {
      let filteredLogs = [...this.logs];

      // 按级别过滤
      if (options.level) {
        filteredLogs = filteredLogs.filter(log => log.level === options.level);
      }

      // 按上下文过滤
      if (options.context) {
        filteredLogs = filteredLogs.filter(log => log.context === options.context);
      }

      // 按请求ID过滤
      if (options.requestId) {
        filteredLogs = filteredLogs.filter(log => log.requestId === options.requestId);
      }

      // 按时间范围过滤
      if (options.startTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= options.startTime!);
      }
      if (options.endTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= options.endTime!);
      }

      const total = filteredLogs.length;
      const offset = options.offset || 0;
      const limit = options.limit || 100;

      // 分页
      const paginatedLogs = filteredLogs.slice(offset, offset + limit);
      const hasMore = offset + limit < total;

      return {
        total,
        logs: paginatedLogs,
        hasMore,
      };
    } catch (error) {
      logger.error('Failed to query logs:', error);
      return {
        total: 0,
        logs: [],
        hasMore: false,
      };
    }
  }

  /**
   * 获取日志统计信息
   */
  getStatistics(): ILogStatistics {
    const totalLogs = this.logs.length;
    const logsByLevel: Record<string, number> = {};
    const logsByContext: Record<string, number> = {};
    const recentErrors: ILogEntry[] = [];

    this.logs.forEach(log => {
      // 统计级别
      logsByLevel[log.level] = (logsByLevel[log.level] || 0) + 1;

      // 统计上下文
      if (log.context) {
        logsByContext[log.context] = (logsByContext[log.context] || 0) + 1;
      }

      // 收集最近的错误
      if (log.level === 'error' && recentErrors.length < 10) {
        recentErrors.push(log);
      }
    });

    const errorCount = logsByLevel['error'] || 0;
    const errorRate = totalLogs > 0 ? (errorCount / totalLogs) * 100 : 0;

    const timestamps = this.logs.map(log => log.timestamp).sort();
    const timeRange = {
      start: timestamps[0] || new Date().toISOString(),
      end: timestamps[timestamps.length - 1] || new Date().toISOString(),
    };

    return {
      totalLogs,
      logsByLevel,
      logsByContext,
      errorRate: Math.round(errorRate * 100) / 100,
      recentErrors: recentErrors.reverse(), // 最新的在前
      timeRange,
    };
  }

  /**
   * 清除内存中的日志
   */
  clearLogs(): void {
    this.logs = [];
    logger.info('Memory logs cleared');
  }

  /**
   * 读取日志文件
   */
  async readLogFile(
    filename: string,
    options: {
      tail?: number;
      level?: string;
    } = {},
  ): Promise<ILogEntry[]> {
    try {
      const filePath = path.join(this.logDir, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      let logs: ILogEntry[] = lines
        .map(line => {
          try {
            return JSON.parse(line) as ILogEntry;
          } catch {
            return null;
          }
        })
        .filter((log): log is ILogEntry => log !== null);

      // 按级别过滤
      if (options.level) {
        logs = logs.filter(log => log.level === options.level);
      }

      // 只返回最后N条
      if (options.tail) {
        logs = logs.slice(-options.tail);
      }

      return logs;
    } catch (error) {
      logger.error(`Failed to read log file ${filename}:`, error);
      return [];
    }
  }

  /**
   * 列出可用的日志文件
   */
  async listLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.logDir);
      return files.filter(file => file.endsWith('.log'));
    } catch (error) {
      logger.error('Failed to list log files:', error);
      return [];
    }
  }

  /**
   * 分析错误模式
   */
  async analyzeErrors(): Promise<{
    topErrors: Array<{ message: string; count: number }>;
    errorTrend: Array<{ hour: string; count: number }>;
  }> {
    const errorLogs = this.logs.filter(log => log.level === 'error');

    // 统计错误消息
    const errorMessages = new Map<string, number>();
    errorLogs.forEach(log => {
      const count = errorMessages.get(log.message) || 0;
      errorMessages.set(log.message, count + 1);
    });

    const topErrors = Array.from(errorMessages.entries())
      .map(([message, count]) => ({ message, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // 统计每小时的错误数
    const errorsByHour = new Map<string, number>();
    errorLogs.forEach(log => {
      const hour = log.timestamp.substring(0, 13); // YYYY-MM-DD HH
      const count = errorsByHour.get(hour) || 0;
      errorsByHour.set(hour, count + 1);
    });

    const errorTrend = Array.from(errorsByHour.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return {
      topErrors,
      errorTrend,
    };
  }

  /**
   * 获取请求追踪链
   * 根据 requestId 获取所有相关日志
   */
  getRequestTrace(requestId: string): ILogEntry[] {
    return this.logs.filter(log => log.requestId === requestId).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

// 创建全局日志聚合器实例
export const logAggregator = new LogAggregator();

/**
 * 日志聚合中间件
 * 捕获日志并添加到聚合器
 */
export function setupLogAggregator() {
  // 这个函数会在应用启动时调用，设置日志聚合
  logger.info('Log aggregator initialized');

  return logAggregator;
}
