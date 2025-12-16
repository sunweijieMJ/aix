# @aix/chat-sdk

> Framework-agnostic AI Chat SDK - 框架无关的 AI 聊天 SDK

一个轻量级、高性能的 AI 聊天 SDK，提供核心类型、Provider 适配层、MCP 客户端和流式数据处理工具。

## 特性

- **框架无关** - 纯 TypeScript 实现，可与任何前端框架（Vue、React、Angular）配合使用
- **流式响应** - 原生支持 SSE (Server-Sent Events) 流式响应处理
- **多模态支持** - 完整支持文本、图片、文件等多模态内容
- **Provider 抽象** - 统一的服务商适配层，支持 OpenAI 及兼容 API
- **MCP 协议** - 内置 Model Context Protocol 客户端，支持工具调用
- **可观察状态** - 基于 Observable 模式的状态管理
- **自动重试** - 内置指数退避重试机制
- **类型安全** - 完整的 TypeScript 类型定义
- **零外部依赖** - 不依赖第三方库

## 安装

```bash
pnpm add @aix/chat-sdk
```

## 快速开始

### 基础使用

```typescript
import {
  ChatStore,
  AgentRunner,
  OpenAIChatProvider,
  type ChatMessage,
} from '@aix/chat-sdk';

// 1. 创建 Provider
const provider = new OpenAIChatProvider({
  baseURL: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-xxx',
  model: 'gpt-4',
});

// 2. 创建 Agent
const agent = new AgentRunner({
  request: async (info, callbacks) => {
    await provider.sendMessage(info.messages, callbacks);
  },
  timeout: 60000,
});

// 3. 创建 Store
const store = new ChatStore({ agent });

// 4. 发送消息
await store.sendMessage('Hello, AI!');

// 5. 获取消息列表
const messages = store.getMessages();
```

### 订阅状态变化

```typescript
// 订阅 Store 状态
const unsubscribe = store.subscribe((state) => {
  console.log('Messages:', state.messages);
  console.log('Loading:', state.isLoading);
});

// 取消订阅
unsubscribe();
```

## 核心模块

### ChatStore

聊天数据管理核心类，提供消息 CRUD、发送、重试等功能。

```typescript
import { ChatStore, createChatStore } from '@aix/chat-sdk';

const store = new ChatStore({
  agent: myAgent,
  defaultMessages: [],      // 初始消息
  maxMessages: 100,         // 最大消息数
  overflow: 'remove-oldest', // 溢出策略: 'remove-oldest' | 'prevent-add'
  storage: myStorageAdapter, // 持久化适配器
  storageKey: 'chat-history',
}, {
  onMessagesChange: (messages) => console.log('Messages changed'),
  onRequest: (content) => true, // 返回 false 取消发送
  onResponse: (message) => console.log('Response:', message),
  onError: (error) => console.error('Error:', error),
});

// 查询方法
store.getMessages();           // 获取所有消息
store.getMessageById(id);      // 根据 ID 获取
store.getLastMessage();        // 获取最后一条
store.getLastAssistantMessage(); // 获取最后一条 AI 消息
store.getMessagesByRole('user'); // 获取指定角色消息
store.getMessageCount();       // 消息总数
store.isEmpty();               // 是否为空

// 消息操作
store.addMessage({ role: 'user', content: 'Hi' });
store.insertMessage({ role: 'system', content: 'Prompt' }, 0);
store.updateMessage(id, { content: 'Updated' });
store.deleteMessage(id);
store.deleteMessages([id1, id2]);
store.batchUpdate([{ id, changes: { content: 'New' } }]);
store.clear();

// AI 交互
await store.sendMessage('Hello');  // 发送消息
store.stop();                      // 停止生成
await store.regenerate();          // 重新生成
await store.retry();               // 重试失败请求

// 快照和序列化
const snapshot = store.snapshot();
store.restore(snapshot);
const json = store.toJSON();
store.fromJSON(json);

// 持久化
await store.loadMessages();
await store.saveMessages();
await store.clearStorage();
```

### AgentRunner

AI 代理运行器，管理请求执行和 Tool Calls。

```typescript
import { AgentRunner, createAgentRunner } from '@aix/chat-sdk';

const agent = new AgentRunner({
  request: async (info, callbacks) => {
    // info.message - 当前消息
    // info.messages - 完整历史
    // info.context - 额外上下文

    callbacks.onUpdate?.('Partial response...');
    callbacks.onSuccess?.('Final response');
    // 或 callbacks.onError?.(new Error('Failed'));
  },
  model: 'gpt-4',
  timeout: 60000, // 60 秒超时
});

// 执行请求
await agent.run(
  { message: 'Hi', messages: [] },
  {
    onUpdate: (chunk) => console.log('Chunk:', chunk),
    onSuccess: (content) => console.log('Done:', content),
    onError: (error) => console.error('Error:', error),
    onToolCallStart: (toolCall) => console.log('Tool started:', toolCall),
    onToolCallEnd: (id, result) => console.log('Tool result:', result),
  }
);

// 状态查询
agent.getLoading();    // 是否正在加载
agent.getModel();      // 模型名称
agent.getToolCalls();  // Tool Calls 列表

// 控制
agent.stop();          // 停止请求
agent.clearToolCalls(); // 清空 Tool Calls
agent.destroy();       // 销毁实例
```

### Observable

可观察对象基类，提供统一的订阅/通知模式。

```typescript
import { Observable, createObservable, EventEmitter } from '@aix/chat-sdk';

// 继承使用
class MyStore extends Observable<{ count: number }> {
  constructor() {
    super({ count: 0 });
  }

  increment() {
    this.updateState({ count: this.state.count + 1 });
  }
}

// 组合使用
const counter = createObservable({ count: 0 });
counter.subscribe((state) => console.log('Count:', state.count));

// 事件发射器
interface MyEvents {
  connect: (url: string) => void;
  error: (error: Error) => void;
}

const emitter = new EventEmitter<MyEvents>();
emitter.on('connect', (url) => console.log('Connected:', url));
emitter.once('error', (err) => console.error('Error:', err));
emitter.emit('connect', 'ws://localhost');
```

### ErrorHandler

错误处理核心类，支持错误分类、日志记录和回调。

```typescript
import {
  ErrorHandler,
  createErrorHandler,
  ErrorType,
  ErrorLevel,
} from '@aix/chat-sdk';

const handler = new ErrorHandler({
  enableLogging: true,
  maxRecords: 50,
  onError: (record) => {
    // 发送到监控服务
    sendToMonitoring(record);
  },
});

// 处理错误
try {
  await fetchData();
} catch (error) {
  handler.handleError(
    error as Error,
    ErrorType.API,
    ErrorLevel.Error,
    { url: '/api/chat' }
  );
}

// 查询
handler.getErrors();      // 所有错误记录
handler.getLastError();   // 最后一个错误
handler.getErrorCount();  // 错误计数

// 清除
handler.clearError(id);
handler.clearAllErrors();
```

### RetryEngine

重试机制核心类，支持指数退避策略。

```typescript
import { RetryEngine, createRetryEngine, retryFetch } from '@aix/chat-sdk';

const retry = new RetryEngine({
  maxRetries: 3,
  initialDelay: 1000,      // 初始延迟 1 秒
  maxDelay: 30000,         // 最大延迟 30 秒
  backoffFactor: 2,        // 退避因子
  exponentialBackoff: true,
  shouldRetry: (error, count, max) => {
    // 自定义重试条件
    return count < max && error.name !== 'AuthError';
  },
  onRetry: (count, delay, error) => {
    console.log(`重试第 ${count} 次，延迟 ${delay}ms`);
  },
});

// 执行带重试的操作
const data = await retry.execute(async () => {
  return await fetch('/api/data');
});

// 快捷方法
const result = await retryFetch<MyData>('/api/data', {
  method: 'POST',
  body: JSON.stringify({ query: 'test' }),
}, { maxRetries: 3 });
```

## Providers

### OpenAIChatProvider

支持 OpenAI API 及兼容实现（Azure OpenAI、OneAPI 等）。

```typescript
import { OpenAIChatProvider, createOpenAIProvider } from '@aix/chat-sdk';

const provider = new OpenAIChatProvider({
  baseURL: 'https://api.openai.com/v1/chat/completions',
  apiKey: 'sk-xxx',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stop: ['\n\n'],
  timeout: 30000,
  streamTimeout: 5000, // 流超时
  stream: true,

  // 工具定义
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取天气信息',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: '城市名称' },
        },
        required: ['location'],
      },
    },
  }],
  toolChoice: 'auto', // 'none' | 'auto' | 'required'

  // 重试配置
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
  },

  // 中间件
  middlewares: {
    onRequest: async (url, options) => {
      // 添加自定义头
      const headers = new Headers(options.headers);
      headers.set('X-Request-ID', generateId());
      return [url, { ...options, headers }];
    },
    onResponse: async (response) => {
      // 处理响应
      return response;
    },
  },
});

// 发送消息
await provider.sendMessage(messages, {
  onUpdate: (content, headers) => console.log('Chunk:', content),
  onSuccess: (content, headers) => console.log('Done:', content),
  onError: (error, errorInfo) => console.error('Error:', error),
});

// 状态查询
provider.getState();        // { isRequesting, content, error }
provider.isRequesting();    // 是否正在请求
provider.getToolCalls();    // 获取 Tool Calls
provider.getResponseHeaders(); // 获取响应头
provider.getRetryState();   // 获取重试状态

// 控制
provider.abort();           // 中止请求
```

### DefaultChatProvider

默认 Provider，适用于完全自定义场景。

```typescript
import { DefaultChatProvider, createDefaultProvider } from '@aix/chat-sdk';

const provider = new DefaultChatProvider({
  baseURL: '/api/chat',

  // 自定义参数转换
  transformParams: (messages) => ({
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    custom_param: 'value',
  }),

  // 自定义响应解析
  parseResponse: (chunk) => {
    // chunk 是 SSE 事件对象
    if (chunk.data) {
      const data = JSON.parse(chunk.data);
      return data.text || '';
    }
    return '';
  },
});
```

### Provider 注册表

统一管理和创建 Provider 实例。

```typescript
import {
  ProviderRegistry,
  createProvider,
  setProviderGlobalConfig,
  createAgentFromProvider,
  createRequestAdapter,
} from '@aix/chat-sdk';

// 全局配置
setProviderGlobalConfig({
  headers: {
    'X-Custom-Header': 'value',
  },
  timeout: 30000,
  middlewares: {
    onRequest: async (url, options) => {
      // 全局请求拦截
      return [url, options];
    },
  },
});

// 注册自定义 Provider
ProviderRegistry.register('custom', CustomProvider);

// 使用注册表创建
const provider = ProviderRegistry.create('openai', {
  baseURL: '...',
  apiKey: '...'
});

// 便捷函数
const provider2 = createProvider('openai', { ... });

// 从 Provider 创建 Agent
const agent = createAgentFromProvider(provider, {
  model: 'gpt-4',
  timeout: 60000,
});

// 创建请求适配器
const requestAdapter = createRequestAdapter(provider);
await requestAdapter(messages, callbacks);
```

## MCP Client

Model Context Protocol 客户端，支持工具调用、资源读取和提示模板。

```typescript
import { MCPClient, createMCPClient } from '@aix/chat-sdk';

const client = new MCPClient({
  baseURL: 'http://localhost:3000/mcp',
  headers: { 'Authorization': 'Bearer token' },
  timeout: 30000,
  reconnect: {
    enabled: true,
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
  },
}, {
  onConnect: (serverInfo) => console.log('Connected:', serverInfo),
  onDisconnect: () => console.log('Disconnected'),
  onToolsUpdate: (tools) => console.log('Tools:', tools),
  onError: (error) => console.error('Error:', error),
  onReconnect: (attempt, delay) => console.log(`Reconnecting ${attempt}...`),
  onReconnectSuccess: () => console.log('Reconnected'),
  onReconnectFailed: (error) => console.error('Reconnect failed:', error),
});

// 连接
const serverInfo = await client.connect();

// 获取工具列表
const tools = await client.listTools();

// 调用工具
const result = await client.callTool({
  name: 'search',
  arguments: { query: 'hello' },
});

// 获取资源列表
const resources = await client.listResources();

// 读取资源
const resource = await client.readResource('file:///path/to/file');

// 获取提示模板
const prompts = await client.listPrompts();
const prompt = await client.getPrompt('summarize', { text: '...' });

// 查找
const tool = client.findTool('search');
const res = client.findResource('file:///...');
const prm = client.findPrompt('summarize');

// 转换为 OpenAI 工具格式
const openaiTools = client.toOpenAITools();

// 状态
client.getState();     // 完整状态
client.isConnected();  // 是否已连接
client.isLoading();    // 是否正在加载
client.getTools();     // 工具列表
client.getResources(); // 资源列表
client.getPrompts();   // 提示列表

// 控制
client.abort();        // 中止当前请求
await client.reconnect(); // 手动重连
client.stopReconnect(); // 停止重连
client.disconnect();   // 断开连接
client.destroy();      // 销毁实例
```

## 流式数据处理

### XStreamClient

流式请求客户端，支持 SSE、NDJSON 等格式。

```typescript
import {
  XStreamClient,
  streamRequest,
  streamSSE,
  createStreamIterator,
  XStream,
} from '@aix/chat-sdk';

// 使用 XStreamClient
const client = new XStreamClient();

const chunks = await client.request({
  url: '/api/chat',
  method: 'POST',
  headers: { 'Authorization': 'Bearer token' },
  body: { message: 'Hello' },
  timeout: 30000,        // 请求超时
  streamTimeout: 5000,   // 流超时（无数据）
  middlewares: { ... },

  // 动态转换流
  transformStream: (info) => {
    if (info.contentType.includes('application/json')) {
      return createNDJSONTransformer();
    }
    return undefined; // 使用默认 SSE 解析
  },

  onChunk: (chunk, headers) => console.log('Chunk:', chunk),
  onSuccess: (chunks, headers) => console.log('Done'),
  onError: (error) => console.error('Error:', error),
});

// 状态查询
client.isRequesting;  // 是否正在请求
client.aborted;       // 是否已中止
client.isTimeout;     // 是否请求超时
client.isStreamTimeout; // 是否流超时

// 中止
client.abort();

// 便捷函数
const events = await streamSSE('/api/events', {
  onChunk: (event) => console.log(event.data),
});

// 从 Response 创建迭代器
const response = await fetch('/api/chat');
for await (const event of createStreamIterator(response)) {
  console.log(event.data);
}

// 低级 API
const stream = XStream({
  readableStream: response.body!,
});
for await (const event of stream) {
  console.log(event.data);
}
```

### 流转换器

```typescript
import {
  createSSEStream,
  createJSONLinesTransformer,
  createNDJSONTransformer,
  createCustomStream,
  splitStream,
  splitPart,
} from '@aix/chat-sdk';

// 创建 SSE 流
const sseStream = createSSEStream(response);

// 创建 JSON Lines 转换器
const jsonLinesTransformer = createJSONLinesTransformer();

// 创建 NDJSON 转换器
const ndjsonTransformer = createNDJSONTransformer();

// 自定义流处理
const customStream = createCustomStream(
  response.body!,
  myCustomTransformer
);

// 分割流
const parts = splitStream(text, { separators: ['\n'] });
```

## 类型定义

### 消息类型

```typescript
import type {
  // 基础类型
  MessageRole,        // 'user' | 'assistant' | 'system' | 'tool'
  MessageStatus,      // 'local' | 'loading' | 'streaming' | 'success' | 'error' | 'cancelled'
  MessageContent,     // string | ContentType[]
  ChatMessage,        // 聊天消息

  // 多模态内容
  TextContent,        // { type: 'text', text: string }
  ImageContent,       // { type: 'image_url', image_url: { url, detail? } }
  FileContent,        // { type: 'file', file: { url, name, size?, mimeType? } }
  ContentType,        // TextContent | ImageContent | FileContent

  // OpenAI 兼容
  OpenAIMessage,
  OpenAIContentPart,
  OpenAIToolCall,
} from '@aix/chat-sdk';
```

### Agent 类型

```typescript
import type {
  AgentContext,
  AgentRequestInfo,
  AgentCallbacks,
  AgentRequest,
  AgentConfig,
  AgentState,
} from '@aix/chat-sdk';
```

### Tool Call 类型

```typescript
import type {
  ToolCallStatus,   // 'pending' | 'running' | 'success' | 'error'
  ToolCallArgs,     // Record<string, any>
  ToolCall,
} from '@aix/chat-sdk';
```

### 错误类型

```typescript
import {
  ErrorType,          // 枚举
  ErrorLevel,         // 枚举
  type ErrorRecord,
  type ErrorHandlerConfig,
} from '@aix/chat-sdk';

// ErrorType 值
ErrorType.Network     // 'network'
ErrorType.Timeout     // 'timeout'
ErrorType.Auth        // 'auth'
ErrorType.Validation  // 'validation'
ErrorType.Server      // 'server'
ErrorType.API         // 'api'
ErrorType.Abort       // 'abort'
ErrorType.Unknown     // 'unknown'

// ErrorLevel 值
ErrorLevel.Info       // 'info'
ErrorLevel.Warning    // 'warning'
ErrorLevel.Error      // 'error'
ErrorLevel.Fatal      // 'fatal'
```

### MCP 类型

```typescript
import type {
  MCPClientConfig,
  MCPTool,
  MCPResource,
  MCPPrompt,
  MCPToolCallRequest,
  MCPToolCallResponse,
  MCPServerInfo,
  MCPServerCapabilities,
  MCPContent,
  MCPTextContent,
  MCPImageContent,
  MCPResourceContent,
} from '@aix/chat-sdk';
```

## 工具函数

### 类型守卫

```typescript
import {
  isStringContent,
  isMultiModalContent,
  getMessageContent,
  toStringContent,
} from '@aix/chat-sdk';

// 检查内容类型
if (isStringContent(message.content)) {
  console.log('String:', message.content);
} else if (isMultiModalContent(message.content)) {
  console.log('Multimodal:', message.content);
}

// 获取字符串内容
const text = getMessageContent(message); // 多模态返回 '[多模态内容]'
const text2 = toStringContent(message.content); // 提取所有文本并合并
```

### 错误检测

```typescript
import {
  detectErrorType,
  isRetryable,
  shouldRetryError,
  isNetworkError,
  isTimeoutError,
  isAuthError,
  isValidationError,
  isServerError,
  isAPIError,
  isAbortError,
} from '@aix/chat-sdk';

// 检测错误类型
const errorType = detectErrorType(error); // ErrorType

// 检查是否可重试
if (isRetryable(error)) {
  await retry();
}

// 检查是否应该重试（考虑重试次数）
if (shouldRetryError(error, retryCount, maxRetries)) {
  await retry();
}
```

### 日志工具

```typescript
import {
  logger,
  configureLogger,
  getLoggerConfig,
  silentMode,
  enableLogs,
  LogLevel,
} from '@aix/chat-sdk';

// 配置日志
configureLogger({
  level: LogLevel.Debug,
  enabled: true,
  prefix: '[my-app]',
  handler: {
    debug: (msg, ...args) => myLogger.debug(msg, ...args),
    info: (msg, ...args) => myLogger.info(msg, ...args),
    warn: (msg, ...args) => myLogger.warn(msg, ...args),
    error: (msg, ...args) => myLogger.error(msg, ...args),
  },
});

// 使用日志
logger.debug('Debug message');
logger.info('Info message');
logger.warn('Warning message');
logger.error('Error message');

// 静默模式
silentMode();

// 启用日志
enableLogs(LogLevel.Warn);
```

### ID 生成

```typescript
import { uid } from '@aix/chat-sdk';

const id = uid();      // 默认 21 位
const shortId = uid(8); // 指定长度
```

### Provider 工具函数

```typescript
import {
  toOpenAIMessages,
  toOpenAIContentParts,
  buildOpenAIParams,
  parseSSEData,
  extractDeltaContent,
  mergeMiddlewares,
  normalizeMiddlewares,
  executeRequestMiddlewares,
  executeResponseMiddlewares,
} from '@aix/chat-sdk';

// 转换消息格式
const openaiMessages = toOpenAIMessages(chatMessages);

// 构建请求参数
const params = buildOpenAIParams(
  { model: 'gpt-4', temperature: 0.7 },
  openaiMessages,
  true // stream
);

// 解析 SSE 数据
const data = parseSSEData<MyType>(sseDataString);

// 提取 delta content
const content = extractDeltaContent(streamResponse);
```

## 存储适配器

实现 `StorageAdapter` 接口以支持消息持久化：

```typescript
import type { StorageAdapter, ChatMessage } from '@aix/chat-sdk';

// LocalStorage 适配器示例
const localStorageAdapter: StorageAdapter = {
  async load(key: string): Promise<ChatMessage[] | null> {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  },

  async save(key: string, messages: ChatMessage[]): Promise<void> {
    localStorage.setItem(key, JSON.stringify(messages));
  },

  async clear(key: string): Promise<void> {
    localStorage.removeItem(key);
  },
};

// 使用
const store = new ChatStore({
  storage: localStorageAdapter,
  storageKey: 'chat-history',
});

// 加载历史消息
await store.loadMessages();

// 保存消息
await store.saveMessages();
```

## 与 Vue 集成

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
import { ChatStore, AgentRunner, OpenAIChatProvider } from '@aix/chat-sdk';

export function useChat() {
  const messages = ref<ChatMessage[]>([]);
  const loading = ref(false);
  let unsubscribe: (() => void) | null = null;

  const provider = new OpenAIChatProvider({ ... });
  const agent = new AgentRunner({
    request: (info, callbacks) => provider.sendMessage(info.messages, callbacks),
  });
  const store = new ChatStore({ agent });

  onMounted(() => {
    unsubscribe = store.subscribe((state) => {
      messages.value = state.messages;
      loading.value = state.isLoading;
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
    agent.destroy();
  });

  const send = (content: string) => store.sendMessage(content);
  const stop = () => store.stop();
  const regenerate = () => store.regenerate();
  const clear = () => store.clear();

  return { messages, loading, send, stop, regenerate, clear };
}
```

## API 参考

### 导出列表

```typescript
// 核心类
export {
  Observable,
  EventEmitter,
  createObservable,
  ChatStore,
  createChatStore,
  AgentRunner,
  createAgentRunner,
  ErrorHandler,
  createErrorHandler,
  RetryEngine,
  createRetryEngine,
  retryFetch,
} from '@aix/chat-sdk';

// Provider
export {
  AbstractChatProvider,
  OpenAIChatProvider,
  createOpenAIProvider,
  DefaultChatProvider,
  createDefaultProvider,
  ProviderRegistry,
  createProvider,
  createAgentFromProvider,
  createRequestAdapter,
  setProviderGlobalConfig,
  getProviderGlobalConfig,
  resetProviderGlobalConfig,
} from '@aix/chat-sdk';

// MCP
export {
  MCPClient,
  createMCPClient,
} from '@aix/chat-sdk';

// 流式处理
export {
  XStreamClient,
  XStream,
  streamRequest,
  streamSSE,
  createStreamIterator,
  createSSEStream,
  createJSONLinesTransformer,
  createNDJSONTransformer,
  createCustomStream,
  splitStream,
  splitPart,
} from '@aix/chat-sdk';

// 工具函数
export {
  logger,
  configureLogger,
  silentMode,
  enableLogs,
  uid,
  detectErrorType,
  isRetryable,
  shouldRetryError,
  isNetworkError,
  isTimeoutError,
  isAuthError,
  isValidationError,
  isServerError,
  isAPIError,
  isAbortError,
  isStringContent,
  isMultiModalContent,
  getMessageContent,
  toStringContent,
  toOpenAIMessages,
  buildOpenAIParams,
  parseSSEData,
  extractDeltaContent,
} from '@aix/chat-sdk';

// 版本
export { VERSION } from '@aix/chat-sdk';
```

## 许可证

MIT
