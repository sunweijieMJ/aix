/**
 * 安全验证和防护功能
 */

import crypto from 'node:crypto';
import {
  DEFAULT_CLIENT_RATE_LIMIT,
  DEFAULT_GLOBAL_RATE_LIMIT,
  DEFAULT_MAX_REQUEST_SIZE,
  DEFAULT_RATE_LIMIT_WINDOW,
} from '../constants';

/**
 * 请求上下文
 */
export interface RequestContext {
  clientId?: string;
  apiKey?: string;
  userAgent?: string;
  timestamp: number;
  requestId: string;
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
  skipSuccessfulRequests?: boolean; // 是否跳过成功请求的计数
}

/**
 * 安全配置
 */
export interface SecurityConfig {
  enableApiKeyAuth: boolean;
  apiKeys: string[];
  rateLimiting: {
    enabled: boolean;
    global: RateLimitConfig;
    perClient: RateLimitConfig;
  };
  requestValidation: {
    maxRequestSize: number; // 最大请求大小（字节）
    allowedMethods: string[];
  };
  cors: {
    enabled: boolean;
    allowedOrigins: string[];
    allowedHeaders: string[];
  };
}

/**
 * 请求记录
 */
interface RequestRecord {
  count: number;
  firstRequest: number;
  lastRequest: number;
}

/**
 * 安全管理器
 */
export class SecurityManager {
  private config: SecurityConfig;
  private globalRequestMap = new Map<string, RequestRecord>();
  private clientRequestMap = new Map<string, RequestRecord>();

  constructor(config?: Partial<SecurityConfig>) {
    this.config = {
      enableApiKeyAuth: false,
      apiKeys: [],
      rateLimiting: {
        enabled: true,
        global: {
          windowMs: DEFAULT_RATE_LIMIT_WINDOW,
          maxRequests: DEFAULT_GLOBAL_RATE_LIMIT,
          skipSuccessfulRequests: false,
        },
        perClient: {
          windowMs: DEFAULT_RATE_LIMIT_WINDOW,
          maxRequests: DEFAULT_CLIENT_RATE_LIMIT,
          skipSuccessfulRequests: false,
        },
      },
      requestValidation: {
        maxRequestSize: DEFAULT_MAX_REQUEST_SIZE,
        allowedMethods: ['POST', 'GET', 'OPTIONS'],
      },
      cors: {
        enabled: true,
        allowedOrigins: ['*'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      },
      ...config,
    };

    // 启动清理任务
    this.startCleanupTask();
  }

  /**
   * 验证 API 密钥
   */
  validateApiKey(apiKey?: string): boolean {
    if (!this.config.enableApiKeyAuth) {
      return true;
    }

    if (!apiKey) {
      return false;
    }

    return this.config.apiKeys.includes(apiKey);
  }

  /**
   * 检查速率限制
   */
  checkRateLimit(context: RequestContext): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    if (!this.config.rateLimiting.enabled) {
      return { allowed: true };
    }

    const now = Date.now();

    // 检查全局速率限制
    const globalCheck = this.checkGlobalRateLimit(now);
    if (!globalCheck.allowed) {
      return globalCheck;
    }

    // 检查客户端速率限制
    if (context.clientId) {
      const clientCheck = this.checkClientRateLimit(context.clientId, now);
      if (!clientCheck.allowed) {
        return clientCheck;
      }
    }

    return { allowed: true };
  }

  /**
   * 记录请求
   */
  recordRequest(context: RequestContext, success: boolean): void {
    if (!this.config.rateLimiting.enabled) {
      return;
    }

    const now = Date.now();

    // 如果配置跳过成功请求且当前请求成功，则不记录
    if (this.config.rateLimiting.global.skipSuccessfulRequests && success) {
      return;
    }

    // 记录全局请求
    this.updateRequestRecord(this.globalRequestMap, 'global', now);

    // 记录客户端请求
    if (context.clientId) {
      this.updateRequestRecord(this.clientRequestMap, context.clientId, now);
    }
  }

  /**
   * 验证请求大小
   */
  validateRequestSize(contentLength: number): boolean {
    return contentLength <= this.config.requestValidation.maxRequestSize;
  }

  /**
   * 验证请求方法
   */
  validateRequestMethod(method: string): boolean {
    return this.config.requestValidation.allowedMethods.includes(
      method.toUpperCase(),
    );
  }

  /**
   * 获取 CORS 头
   */
  getCorsHeaders(origin?: string): Record<string, string> {
    if (!this.config.cors.enabled) {
      return {};
    }

    const headers: Record<string, string> = {};

    // Access-Control-Allow-Origin
    if (this.config.cors.allowedOrigins.includes('*')) {
      headers['Access-Control-Allow-Origin'] = '*';
    } else if (origin && this.config.cors.allowedOrigins.includes(origin)) {
      headers['Access-Control-Allow-Origin'] = origin;
    }

    // Access-Control-Allow-Headers
    headers['Access-Control-Allow-Headers'] =
      this.config.cors.allowedHeaders.join(', ');

    // Access-Control-Allow-Methods
    headers['Access-Control-Allow-Methods'] =
      this.config.requestValidation.allowedMethods.join(', ');

    return headers;
  }

  /**
   * 生成请求 ID
   */
  generateRequestId(): string {
    return crypto.randomUUID();
  }

  /**
   * 创建请求上下文
   */
  createRequestContext(headers: Record<string, string>): RequestContext {
    return {
      clientId: headers['x-client-id'] || this.extractClientId(headers),
      apiKey: this.extractApiKey(headers),
      userAgent: headers['user-agent'],
      timestamp: Date.now(),
      requestId: this.generateRequestId(),
    };
  }

  /**
   * 检查全局速率限制
   */
  private checkGlobalRateLimit(now: number): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const record = this.globalRequestMap.get('global');
    if (!record) {
      return { allowed: true };
    }

    const { windowMs, maxRequests } = this.config.rateLimiting.global;
    const windowStart = now - windowMs;

    if (record.firstRequest < windowStart) {
      // 窗口已过期，重置记录
      this.globalRequestMap.delete('global');
      return { allowed: true };
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil(
        (record.firstRequest + windowMs - now) / 1000,
      );
      return {
        allowed: false,
        reason: 'Global rate limit exceeded',
        retryAfter,
      };
    }

    return { allowed: true };
  }

  /**
   * 检查客户端速率限制
   */
  private checkClientRateLimit(
    clientId: string,
    now: number,
  ): {
    allowed: boolean;
    reason?: string;
    retryAfter?: number;
  } {
    const record = this.clientRequestMap.get(clientId);
    if (!record) {
      return { allowed: true };
    }

    const { windowMs, maxRequests } = this.config.rateLimiting.perClient;
    const windowStart = now - windowMs;

    if (record.firstRequest < windowStart) {
      // 窗口已过期，重置记录
      this.clientRequestMap.delete(clientId);
      return { allowed: true };
    }

    if (record.count >= maxRequests) {
      const retryAfter = Math.ceil(
        (record.firstRequest + windowMs - now) / 1000,
      );
      return {
        allowed: false,
        reason: `Client rate limit exceeded for ${clientId}`,
        retryAfter,
      };
    }

    return { allowed: true };
  }

  /**
   * 更新请求记录
   */
  private updateRequestRecord(
    map: Map<string, RequestRecord>,
    key: string,
    now: number,
  ): void {
    const record = map.get(key);
    if (!record) {
      map.set(key, {
        count: 1,
        firstRequest: now,
        lastRequest: now,
      });
    } else {
      record.count++;
      record.lastRequest = now;
    }
  }

  /**
   * 从请求头提取客户端 ID
   */
  private extractClientId(headers: Record<string, string>): string {
    // 可以从 User-Agent 或其他头部信息生成客户端 ID
    const userAgent = headers['user-agent'] || 'unknown';
    const ip = headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown';

    return crypto
      .createHash('sha256')
      .update(`${userAgent}-${ip}`)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * 从请求头提取 API 密钥
   */
  private extractApiKey(headers: Record<string, string>): string | undefined {
    // 支持多种 API 密钥格式
    const authHeader = headers.authorization;
    if (authHeader) {
      // Bearer token
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
      if (bearerMatch) {
        return bearerMatch[1];
      }

      // API Key
      const apiKeyMatch = authHeader.match(/^ApiKey\s+(.+)$/i);
      if (apiKeyMatch) {
        return apiKeyMatch[1];
      }
    }

    // 直接从头部获取
    return headers['x-api-key'];
  }

  /**
   * 启动清理任务
   */
  private startCleanupTask(): void {
    // 每5分钟清理一次过期记录
    const cleanupInterval = 5 * 60 * 1000;

    setInterval(() => {
      this.cleanupExpiredRecords();
    }, cleanupInterval);
  }

  /**
   * 清理过期的请求记录
   */
  private cleanupExpiredRecords(): void {
    const now = Date.now();
    const globalWindowMs = this.config.rateLimiting.global.windowMs;
    const clientWindowMs = this.config.rateLimiting.perClient.windowMs;

    // 清理全局记录
    for (const [key, record] of this.globalRequestMap.entries()) {
      if (now - record.lastRequest > globalWindowMs) {
        this.globalRequestMap.delete(key);
      }
    }

    // 清理客户端记录
    for (const [key, record] of this.clientRequestMap.entries()) {
      if (now - record.lastRequest > clientWindowMs) {
        this.clientRequestMap.delete(key);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    globalRequests: number;
    clientRequests: number;
    totalClients: number;
  } {
    return {
      globalRequests: this.globalRequestMap.get('global')?.count || 0,
      clientRequests: Array.from(this.clientRequestMap.values()).reduce(
        (sum, record) => sum + record.count,
        0,
      ),
      totalClients: this.clientRequestMap.size,
    };
  }

  /**
   * 停止安全管理器
   */
  stop(): void {
    // 当前实现不需要特殊的停止逻辑
    // 如果未来有定时器或其他资源需要清理，可以在这里添加
  }
}

/**
 * 安全错误类
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 403,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * 创建安全管理器
 */
export function createSecurityManager(
  config?: Partial<SecurityConfig>,
): SecurityManager {
  return new SecurityManager(config);
}

/**
 * 从环境变量获取安全配置
 */
export function getSecurityConfigFromEnv(): Partial<SecurityConfig> {
  const config: Partial<SecurityConfig> = {};

  // API 密钥认证
  if (process.env.MCP_ENABLE_API_KEY_AUTH === 'true') {
    config.enableApiKeyAuth = true;

    if (process.env.MCP_API_KEYS) {
      config.apiKeys = process.env.MCP_API_KEYS.split(',').map((key) =>
        key.trim(),
      );
    }
  }

  // 速率限制
  if (process.env.MCP_RATE_LIMIT_ENABLED === 'false') {
    config.rateLimiting = {
      enabled: false,
      global: {
        windowMs: DEFAULT_RATE_LIMIT_WINDOW,
        maxRequests: DEFAULT_GLOBAL_RATE_LIMIT,
      },
      perClient: {
        windowMs: DEFAULT_RATE_LIMIT_WINDOW,
        maxRequests: DEFAULT_CLIENT_RATE_LIMIT,
      },
    };
  } else {
    const globalMax = process.env.MCP_GLOBAL_RATE_LIMIT
      ? parseInt(process.env.MCP_GLOBAL_RATE_LIMIT, 10)
      : undefined;
    const clientMax = process.env.MCP_CLIENT_RATE_LIMIT
      ? parseInt(process.env.MCP_CLIENT_RATE_LIMIT, 10)
      : undefined;

    if (globalMax || clientMax) {
      config.rateLimiting = {
        enabled: true,
        global: {
          windowMs: DEFAULT_RATE_LIMIT_WINDOW,
          maxRequests: globalMax || 100,
          skipSuccessfulRequests: false,
        },
        perClient: {
          windowMs: DEFAULT_RATE_LIMIT_WINDOW,
          maxRequests: clientMax || 30,
          skipSuccessfulRequests: false,
        },
      };
    }
  }

  // 请求验证
  const maxSize = process.env.MCP_MAX_REQUEST_SIZE
    ? parseInt(process.env.MCP_MAX_REQUEST_SIZE, 10)
    : undefined;
  if (maxSize) {
    config.requestValidation = {
      maxRequestSize: maxSize,
      allowedMethods: ['POST', 'GET', 'OPTIONS'],
    };
  }

  return config;
}
