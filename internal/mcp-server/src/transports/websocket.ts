/**
 * WebSocket Transport 实现
 */

import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DEFAULT_WS_CLIENT_TIMEOUT,
  DEFAULT_WS_HEARTBEAT_INTERVAL,
  DEFAULT_WS_HOST,
  DEFAULT_WS_MAX_CONNECTIONS,
  DEFAULT_WS_PATH,
} from '../constants';
import { log } from '../utils/logger';
import type { SecurityManager } from '../utils/security';

/**
 * WebSocket 配置
 */
export interface WebSocketConfig {
  port: number;
  host?: string;
  path?: string;
  maxConnections?: number;
  heartbeatInterval?: number;
  clientTimeout?: number;
}

/**
 * 客户端连接信息
 */
interface ClientConnection {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  connectedAt: number;
  lastActivity: number;
  messageCount: number;
}

/**
 * WebSocket Transport 实现
 */
export class WebSocketTransport implements Transport {
  private server: WebSocketServer;
  private clients = new Map<string, ClientConnection>();
  private config: Required<WebSocketConfig>;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private securityManager?: SecurityManager;

  constructor(config: WebSocketConfig, securityManager?: SecurityManager) {
    this.config = {
      port: config.port,
      host: config.host || DEFAULT_WS_HOST,
      path: config.path || DEFAULT_WS_PATH,
      maxConnections: config.maxConnections || DEFAULT_WS_MAX_CONNECTIONS,
      heartbeatInterval:
        config.heartbeatInterval || DEFAULT_WS_HEARTBEAT_INTERVAL,
      clientTimeout: config.clientTimeout || DEFAULT_WS_CLIENT_TIMEOUT,
    };
    this.securityManager = securityManager;

    this.server = new WebSocketServer({
      port: this.config.port,
      host: this.config.host,
      path: this.config.path,
    });

    this.setupEventHandlers();
    this.startHeartbeat();
    this.startCleanup();
  }

  /**
   * 启动 WebSocket 服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on('listening', () => {
        log.info(
          `🌐 WebSocket 服务器启动于 ws://${this.config.host}:${this.config.port}${this.config.path}`,
        );
        resolve();
      });

      this.server.on('error', (error) => {
        log.error('❌ WebSocket 服务器启动失败:', error);
        reject(error);
      });
    });
  }

  /**
   * 停止 WebSocket 服务器
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
      }

      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
      }

      // 关闭所有客户端连接
      for (const client of this.clients.values()) {
        client.ws.close();
      }

      this.clients.clear();

      this.server.close(() => {
        log.info('🛑 WebSocket 服务器已停止');
        resolve();
      });
    });
  }

  /**
   * 发送消息（Transport 接口实现）
   */
  send(message: any): Promise<void> {
    // 对于服务器端，我们需要向所有连接的客户端发送消息
    const data = JSON.stringify(message);
    const promises: Promise<void>[] = [];

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        promises.push(
          new Promise((resolve, reject) => {
            client.ws.send(data, (error) => {
              if (error) {
                log.error(`发送消息到客户端 ${client.id} 失败:`, error);
                reject(error);
              } else {
                resolve();
              }
            });
          }),
        );
      }
    }

    return Promise.all(promises).then(() => {});
  }

  /**
   * 设置消息处理器（Transport 接口实现）
   */
  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
  }

  /**
   * 设置关闭处理器（Transport 接口实现）
   */
  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /**
   * 设置错误处理器（Transport 接口实现）
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  private messageHandler?: (message: any) => void;
  private closeHandler?: () => void;
  private errorHandler?: (error: Error) => void;

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    this.server.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    this.server.on('error', (error) => {
      log.error('WebSocket 服务器错误:', error);
      if (this.errorHandler) {
        this.errorHandler(error);
      }
    });
  }

  /**
   * 处理新连接
   */
  private async handleConnection(ws: WebSocket, request: any): Promise<void> {
    // 检查连接数限制
    if (this.clients.size >= this.config.maxConnections) {
      ws.close(1013, 'Server capacity exceeded');
      return;
    }

    const clientId = this.generateClientId();
    const now = Date.now();

    // 安全验证
    if (this.securityManager) {
      try {
        const headers = request.headers || {};
        const context = this.securityManager.createRequestContext(headers);

        // API 密钥验证
        if (!this.securityManager.validateApiKey(context.apiKey)) {
          ws.close(1008, 'Invalid API key');
          return;
        }

        // 速率限制检查
        const rateLimitResult = this.securityManager.checkRateLimit(context);
        if (!rateLimitResult.allowed) {
          ws.close(1013, 'Rate limit exceeded');
          return;
        }
      } catch (error) {
        log.error('安全验证失败:', error);
        ws.close(1008, 'Security validation failed');
        return;
      }
    }

    // 创建客户端连接记录
    const client: ClientConnection = {
      id: clientId,
      ws,
      isAlive: true,
      connectedAt: now,
      lastActivity: now,
      messageCount: 0,
    };

    this.clients.set(clientId, client);

    log.info(`✅ 新客户端连接: ${clientId} (总连接数: ${this.clients.size})`);

    // 设置消息处理器
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    // 设置心跳响应
    ws.on('pong', () => {
      client.isAlive = true;
      client.lastActivity = Date.now();
    });

    // 设置关闭处理器
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // 设置错误处理器
    ws.on('error', (error) => {
      log.error(`客户端 ${clientId} 错误:`, error);
      this.handleDisconnection(clientId);
    });

    // 发送欢迎消息
    ws.send(
      JSON.stringify({
        type: 'welcome',
        clientId,
        timestamp: now,
      }),
    );
  }

  /**
   * 处理消息
   */
  private handleMessage(clientId: string, data: any): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.lastActivity = Date.now();
    client.messageCount++;

    try {
      const message = JSON.parse(data.toString());

      // 记录安全事件
      if (this.securityManager) {
        const context = this.securityManager.createRequestContext({
          'x-client-id': clientId,
        });
        this.securityManager.recordRequest(context, true);
      }

      // 调用消息处理器
      if (this.messageHandler) {
        this.messageHandler(message);
      }
    } catch (error) {
      log.error(`解析客户端 ${clientId} 消息失败:`, error);
      client.ws.send(
        JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
        }),
      );
    }
  }

  /**
   * 处理断开连接
   */
  private handleDisconnection(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    const duration = Date.now() - client.connectedAt;
    log.info(
      `❌ 客户端断开连接: ${clientId} (持续时间: ${Math.round(duration / 1000)}s, 消息数: ${client.messageCount})`,
    );

    this.clients.delete(clientId);

    // 如果所有客户端都断开连接，调用关闭处理器
    if (this.clients.size === 0 && this.closeHandler) {
      this.closeHandler();
    }
  }

  /**
   * 生成客户端 ID
   */
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [clientId, client] of this.clients.entries()) {
        if (!client.isAlive) {
          log.info(`💔 客户端 ${clientId} 心跳检测失败，关闭连接`);
          client.ws.terminate();
          this.clients.delete(clientId);
          continue;
        }

        client.isAlive = false;
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 启动清理任务
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();

      for (const [clientId, client] of this.clients.entries()) {
        // 清理超时的连接
        if (now - client.lastActivity > this.config.clientTimeout) {
          log.info(`⏰ 客户端 ${clientId} 超时，关闭连接`);
          client.ws.close(1000, 'Client timeout');
          this.clients.delete(clientId);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * 获取连接统计
   */
  getStats(): {
    totalConnections: number;
    activeConnections: number;
    totalMessages: number;
    averageConnectionDuration: number;
  } {
    const now = Date.now();
    let totalMessages = 0;
    let totalDuration = 0;

    for (const client of this.clients.values()) {
      totalMessages += client.messageCount;
      totalDuration += now - client.connectedAt;
    }

    return {
      totalConnections: this.clients.size,
      activeConnections: this.clients.size,
      totalMessages,
      averageConnectionDuration:
        this.clients.size > 0 ? totalDuration / this.clients.size : 0,
    };
  }

  /**
   * 向指定客户端发送消息
   */
  sendToClient(clientId: string, message: any): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      log.error(`发送消息到客户端 ${clientId} 失败:`, error);
      return false;
    }
  }

  /**
   * 广播消息到所有客户端
   */
  broadcast(message: any): void {
    const data = JSON.stringify(message);

    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    }
  }

  /**
   * 获取所有连接的客户端 ID
   */
  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }
}

/**
 * 创建 WebSocket Transport
 */
export function createWebSocketTransport(
  config: WebSocketConfig,
  securityManager?: SecurityManager,
): WebSocketTransport {
  return new WebSocketTransport(config, securityManager);
}
