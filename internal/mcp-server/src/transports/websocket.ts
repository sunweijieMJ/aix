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
 * JSON-RPC 请求 ID 类型
 */
type JsonRpcId = string | number | null;

/**
 * 请求映射信息（包含时间戳用于超时清理）
 */
interface RequestMapping {
  clientId: string;
  timestamp: number;
}

/**
 * 请求映射超时时间（60秒）
 */
const REQUEST_MAPPING_TIMEOUT = 60000;

/**
 * WebSocket Transport 实现
 */
export class WebSocketTransport implements Transport {
  private server: WebSocketServer | null = null;
  private clients = new Map<string, ClientConnection>();
  private config: Required<WebSocketConfig>;
  private heartbeatTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  /**
   * 请求 ID 到客户端信息的映射
   * 用于正确路由 JSON-RPC 响应到发起请求的客户端
   * 包含时间戳用于超时清理，防止内存泄漏
   */
  private requestToClient = new Map<string, RequestMapping>();

  constructor(config: WebSocketConfig) {
    this.config = {
      port: config.port,
      host: config.host || DEFAULT_WS_HOST,
      path: config.path || DEFAULT_WS_PATH,
      maxConnections: config.maxConnections || DEFAULT_WS_MAX_CONNECTIONS,
      heartbeatInterval: config.heartbeatInterval || DEFAULT_WS_HEARTBEAT_INTERVAL,
      clientTimeout: config.clientTimeout || DEFAULT_WS_CLIENT_TIMEOUT,
    };
    // 注意: server 在 start() 中创建，避免竞态条件
  }

  /**
   * 启动 WebSocket 服务器
   *
   * 由 Protocol.connect() 自动调用，不应手动调用。
   * 内置幂等保护，重复调用会直接返回。
   */
  async start(): Promise<void> {
    // 幂等保护：防止重复启动导致端口冲突
    if (this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({
        port: this.config.port,
        host: this.config.host,
        path: this.config.path,
      });

      this.server.on('listening', () => {
        log.info(
          `🌐 WebSocket 服务器启动于 ws://${this.config.host}:${this.config.port}${this.config.path}`,
        );
        this.setupEventHandlers();
        this.startHeartbeat();
        this.startCleanup();
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
        this.heartbeatTimer = undefined;
      }

      if (this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = undefined;
      }

      // 关闭所有客户端连接
      for (const client of this.clients.values()) {
        client.ws.close();
      }

      this.clients.clear();
      this.requestToClient.clear();

      if (this.server) {
        this.server.close(() => {
          log.info('🛑 WebSocket 服务器已停止');
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * 发送消息（Transport 接口实现）
   *
   * MCP 协议是请求-响应模式，响应应发送给发起请求的客户端。
   * 使用 JSON-RPC id 字段来正确路由响应到对应的客户端。
   */
  send(message: any): Promise<void> {
    const data = JSON.stringify(message);

    // 尝试从响应消息中获取请求 ID，查找对应的客户端
    let targetClientId: string | null = null;
    const responseId = this.extractResponseId(message);

    if (responseId !== null) {
      const requestKey = String(responseId);
      const mapping = this.requestToClient.get(requestKey);
      if (mapping) {
        targetClientId = mapping.clientId;
        // 响应发送后清理映射
        this.requestToClient.delete(requestKey);
      }
    }

    // 如果有目标客户端，只发送给该客户端
    if (targetClientId) {
      const client = this.clients.get(targetClientId);
      if (client && client.ws.readyState === WebSocket.OPEN) {
        return new Promise((resolve, reject) => {
          client.ws.send(data, (error) => {
            if (error) {
              log.error(`发送消息到客户端 ${client.id} 失败:`, error);
              reject(error);
            } else {
              resolve();
            }
          });
        });
      }
      // 客户端不存在或已断开，记录警告
      log.warn(`目标客户端 ${targetClientId} 不存在或已断开，消息丢弃`);
      return Promise.resolve();
    }

    // 没有目标客户端时广播（用于服务器主动推送通知的场景）
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
   * 从 JSON-RPC 响应消息中提取 id 字段
   */
  private extractResponseId(message: any): JsonRpcId {
    if (message && typeof message === 'object' && 'id' in message) {
      return message.id;
    }
    return null;
  }

  /**
   * Transport 接口回调属性
   * 由 Protocol.connect() 设置，用于将消息分发给 MCP 协议层
   */
  onmessage?: (message: any) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  /**
   * 设置事件处理器
   */
  private setupEventHandlers(): void {
    if (!this.server) return;

    this.server.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    // 注意: error 事件已在 start() 中处理，这里处理运行时错误
    this.server.on('error', (error) => {
      log.error('WebSocket 服务器错误:', error);
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  /**
   * 处理新连接
   */
  private handleConnection(ws: WebSocket, _request: any): void {
    // 检查连接数限制
    if (this.clients.size >= this.config.maxConnections) {
      ws.close(1013, 'Server capacity exceeded');
      return;
    }

    const clientId = this.generateClientId();
    const now = Date.now();

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

      // 记录请求 ID 到客户端 ID 的映射（用于响应路由）
      // 包含时间戳，支持超时清理
      const requestId = this.extractRequestId(message);
      if (requestId !== null) {
        this.requestToClient.set(String(requestId), {
          clientId,
          timestamp: Date.now(),
        });
      }

      // 调用消息处理器（由 Protocol.connect() 通过 onmessage 属性注册）
      if (this.onmessage) {
        this.onmessage(message);
      }
    } catch (error) {
      log.error(`解析客户端 ${clientId} 消息失败:`, error);
      client.ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32700, message: 'Parse error' },
          id: null,
        }),
      );
    }
  }

  /**
   * 从 JSON-RPC 请求消息中提取 id 字段
   */
  private extractRequestId(message: any): JsonRpcId {
    if (message && typeof message === 'object' && 'id' in message && 'method' in message) {
      return message.id;
    }
    return null;
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

    // 清理该客户端的请求映射
    for (const [requestId, mapping] of this.requestToClient.entries()) {
      if (mapping.clientId === clientId) {
        this.requestToClient.delete(requestId);
      }
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
          // 只调用 terminate()，由 close 事件触发 handleDisconnection 统一清理
          client.ws.terminate();
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

      // 清理超时的客户端连接
      // 只调用 ws.close()，由 close 事件触发 handleDisconnection 统一清理
      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastActivity > this.config.clientTimeout) {
          log.info(`⏰ 客户端 ${clientId} 超时，关闭连接`);
          client.ws.close(1000, 'Client timeout');
        }
      }

      // 清理过期的请求映射（防止内存泄漏）
      for (const [requestId, mapping] of this.requestToClient.entries()) {
        if (now - mapping.timestamp > REQUEST_MAPPING_TIMEOUT) {
          this.requestToClient.delete(requestId);
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
      averageConnectionDuration: this.clients.size > 0 ? totalDuration / this.clients.size : 0,
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
export function createWebSocketTransport(config: WebSocketConfig): WebSocketTransport {
  return new WebSocketTransport(config);
}
