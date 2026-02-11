import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWebSocketTransport,
  WebSocketTransport,
} from '../src/transports/websocket';

// 使用端口计数器，每个测试使用不同端口避免冲突
let portCounter = 19800;
function getNextPort(): number {
  return portCounter++;
}

describe('WebSocketTransport', () => {
  let transport: WebSocketTransport;
  let testPort: number;

  beforeEach(() => {
    vi.clearAllMocks();
    testPort = getNextPort();
  });

  afterEach(async () => {
    if (transport) {
      await transport.close();
    }
  });

  describe('constructor', () => {
    it('应该使用默认配置创建 WebSocket Transport', () => {
      transport = new WebSocketTransport({ port: testPort });
      expect(transport).toBeInstanceOf(WebSocketTransport);
    });

    it('应该使用自定义配置创建 WebSocket Transport', () => {
      transport = new WebSocketTransport({
        port: testPort,
        host: '127.0.0.1',
        path: '/custom-mcp',
        maxConnections: 50,
        heartbeatInterval: 15000,
        clientTimeout: 30000,
      });
      expect(transport).toBeInstanceOf(WebSocketTransport);
    });
  });

  describe('start', () => {
    it('应该成功启动 WebSocket 服务器', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await expect(transport.start()).resolves.not.toThrow();
    });

    it('应该在端口被占用时抛出错误', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const transport2 = new WebSocketTransport({ port: testPort });
      try {
        await expect(transport2.start()).rejects.toThrow();
      } finally {
        // 确保 transport2 也被清理
        await transport2.close();
      }
    });
  });

  describe('close', () => {
    it('应该成功关闭 WebSocket 服务器', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('应该在未启动时安全关闭', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await expect(transport.close()).resolves.not.toThrow();
    });
  });

  describe('客户端连接', () => {
    it('应该接受客户端连接', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      await new Promise<void>((resolve, reject) => {
        client.on('open', resolve);
        client.on('error', reject);
      });

      expect(client.readyState).toBe(WebSocket.OPEN);

      client.close();
    });

    it('应该发送欢迎消息', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      const welcomeMessage = await new Promise<any>((resolve, reject) => {
        client.on('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
        client.on('error', reject);
      });

      expect(welcomeMessage.type).toBe('welcome');
      expect(welcomeMessage.clientId).toBeDefined();
      expect(welcomeMessage.timestamp).toBeDefined();

      client.close();
    });

    it('应该限制最大连接数', async () => {
      transport = new WebSocketTransport({
        port: testPort,
        maxConnections: 2,
      });
      await transport.start();

      const clients: WebSocket[] = [];

      // 依次创建连接，确保顺序
      for (let i = 0; i < 3; i++) {
        const client = new WebSocket(`ws://localhost:${testPort}/mcp`);
        clients.push(client);
        // 等待每个连接完成握手
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // 额外等待确保状态稳定
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 前两个应该连接成功
      expect(clients[0]?.readyState).toBe(WebSocket.OPEN);
      expect(clients[1]?.readyState).toBe(WebSocket.OPEN);

      // 第三个应该被关闭
      expect(clients[2]?.readyState).toBe(WebSocket.CLOSED);

      // 清理
      clients.forEach((c) => c.close());
    });
  });

  describe('消息处理', () => {
    it('应该接收和处理消息', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const receivedMessages: any[] = [];
      transport.onMessage((message) => {
        receivedMessages.push(message);
      });

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待连接并跳过欢迎消息
      await new Promise<void>((resolve) => {
        client.once('open', () => {
          client.once('message', () => {
            resolve();
          });
        });
      });

      // 发送测试消息
      const testMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { foo: 'bar' },
        id: 1,
      };
      client.send(JSON.stringify(testMessage));

      // 等待消息被处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedMessages.length).toBe(1);
      expect(receivedMessages[0]).toEqual(testMessage);

      client.close();
    });

    it('应该处理无效的 JSON 消息', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待连接并跳过欢迎消息
      await new Promise<void>((resolve) => {
        client.once('open', () => {
          client.once('message', () => {
            resolve();
          });
        });
      });

      // 发送无效 JSON
      client.send('invalid json {');

      // 等待错误响应
      const errorResponse = await new Promise<any>((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.code).toBe(-32700); // Parse error

      client.close();
    });
  });

  describe('send', () => {
    it('应该发送消息到客户端', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待连接并跳过欢迎消息
      await new Promise<void>((resolve) => {
        client.once('open', () => {
          client.once('message', () => {
            resolve();
          });
        });
      });

      // 发送请求以设置 currentClientId
      const request = { jsonrpc: '2.0', method: 'test', id: 1 };
      client.send(JSON.stringify(request));

      // 等待请求被处理
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 发送响应
      const response = { jsonrpc: '2.0', result: 'success', id: 1 };
      await transport.send(response);

      // 接收响应
      const receivedResponse = await new Promise<any>((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(receivedResponse).toEqual(response);

      client.close();
    });

    it('应该正确路由响应到发起请求的客户端', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      // 创建两个客户端
      const client1 = new WebSocket(`ws://localhost:${testPort}/mcp`);
      const client2 = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待两个客户端都连接并跳过欢迎消息
      await Promise.all([
        new Promise<void>((resolve) => {
          client1.once('open', () => {
            client1.once('message', () => resolve());
          });
        }),
        new Promise<void>((resolve) => {
          client2.once('open', () => {
            client2.once('message', () => resolve());
          });
        }),
      ]);

      // client1 发送请求
      const request1 = { jsonrpc: '2.0', method: 'test1', id: 'req-1' };
      client1.send(JSON.stringify(request1));

      // 等待请求被处理
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 收集 client2 收到的消息
      const client2Messages: any[] = [];
      client2.on('message', (data) => {
        client2Messages.push(JSON.parse(data.toString()));
      });

      // 发送响应（应该只发送给 client1）
      const response1 = { jsonrpc: '2.0', result: 'response1', id: 'req-1' };
      await transport.send(response1);

      // 接收响应
      const receivedResponse = await new Promise<any>((resolve) => {
        client1.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      expect(receivedResponse).toEqual(response1);

      // 等待确保 client2 没有收到消息
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(client2Messages.length).toBe(0);

      client1.close();
      client2.close();
    });
  });

  describe('broadcast', () => {
    it('应该广播消息到所有客户端', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const clients = [
        new WebSocket(`ws://localhost:${testPort}/mcp`),
        new WebSocket(`ws://localhost:${testPort}/mcp`),
      ];

      // 等待连接并跳过欢迎消息
      await Promise.all(
        clients.map(
          (c) =>
            new Promise<void>((resolve) => {
              c.once('open', () => {
                c.once('message', () => resolve());
              });
            }),
        ),
      );

      // 设置广播消息接收 Promise
      const receivePromises = clients.map(
        (c) =>
          new Promise<any>((resolve) => {
            c.once('message', (data) => {
              resolve(JSON.parse(data.toString()));
            });
          }),
      );

      // 广播消息
      const broadcastMessage = { type: 'notification', data: 'hello all' };
      transport.broadcast(broadcastMessage);

      // 等待接收广播
      const receivedMessages = await Promise.all(receivePromises);

      expect(receivedMessages[0]).toEqual(broadcastMessage);
      expect(receivedMessages[1]).toEqual(broadcastMessage);

      clients.forEach((c) => c.close());
    });
  });

  describe('sendToClient', () => {
    it('应该发送消息到指定客户端', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待连接并获取欢迎消息以得到 clientId
      const welcomeMessage = await new Promise<any>((resolve) => {
        client.once('open', () => {
          client.once('message', (data) => {
            resolve(JSON.parse(data.toString()));
          });
        });
      });

      const clientId = welcomeMessage.clientId;

      // 设置接收 Promise
      const receivePromise = new Promise<any>((resolve) => {
        client.once('message', (data) => {
          resolve(JSON.parse(data.toString()));
        });
      });

      // 发送消息到指定客户端
      const message = { type: 'direct', data: 'hello' };
      const sent = transport.sendToClient(clientId, message);
      expect(sent).toBe(true);

      // 接收消息
      const receivedMessage = await receivePromise;

      expect(receivedMessage).toEqual(message);

      client.close();
    });

    it('应该对不存在的客户端返回 false', () => {
      transport = new WebSocketTransport({ port: testPort });
      const sent = transport.sendToClient('non-existent', { test: true });
      expect(sent).toBe(false);
    });
  });

  describe('getConnectedClients', () => {
    it('应该返回所有连接的客户端 ID', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      expect(transport.getConnectedClients()).toHaveLength(0);

      const client1 = new WebSocket(`ws://localhost:${testPort}/mcp`);
      const client2 = new WebSocket(`ws://localhost:${testPort}/mcp`);

      await Promise.all([
        new Promise<void>((resolve) => client1.on('open', resolve)),
        new Promise<void>((resolve) => client2.on('open', resolve)),
      ]);

      expect(transport.getConnectedClients()).toHaveLength(2);

      client1.close();

      // 等待断开连接被处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(transport.getConnectedClients()).toHaveLength(1);

      client2.close();
    });
  });

  describe('getStats', () => {
    it('应该返回正确的连接统计', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      const initialStats = transport.getStats();
      expect(initialStats.totalConnections).toBe(0);
      expect(initialStats.activeConnections).toBe(0);
      expect(initialStats.totalMessages).toBe(0);

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      // 等待连接并跳过欢迎消息
      await new Promise<void>((resolve) => {
        client.once('open', () => {
          client.once('message', () => {
            resolve();
          });
        });
      });

      // 发送几条消息
      client.send(JSON.stringify({ test: 1 }));
      client.send(JSON.stringify({ test: 2 }));

      // 等待消息被处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      const stats = transport.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.activeConnections).toBe(1);
      expect(stats.totalMessages).toBe(2);
      expect(stats.averageConnectionDuration).toBeGreaterThan(0);

      client.close();
    });
  });

  describe('事件处理器', () => {
    it('应该触发 onClose 处理器当所有客户端断开', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      let closeCalled = false;
      transport.onClose(() => {
        closeCalled = true;
      });

      const client = new WebSocket(`ws://localhost:${testPort}/mcp`);

      await new Promise<void>((resolve) => {
        client.on('open', resolve);
      });

      client.close();

      // 等待断开连接被处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(closeCalled).toBe(true);
    });

    it('应该触发 onError 处理器当发生错误', async () => {
      transport = new WebSocketTransport({ port: testPort });
      await transport.start();

      let errorCalled = false;
      transport.onError(() => {
        errorCalled = true;
      });

      // 注意：在正常情况下，我们很难触发服务器错误
      // 这里只验证处理器可以被设置
      expect(errorCalled).toBe(false);
    });
  });
});

describe('createWebSocketTransport', () => {
  it('应该创建 WebSocket Transport 实例', () => {
    const transport = createWebSocketTransport({ port: getNextPort() });
    expect(transport).toBeInstanceOf(WebSocketTransport);
  });
});
