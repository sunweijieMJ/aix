# @kit/sdk

基于**双向握手 + MessageChannel** 的跨窗口消息通信 SDK，支持 iframe 嵌入和 `window.open()` 打开的新窗口两种场景。通信通道私有隔离，第三方脚本无法监听。

## 特性

- **私有通道** - 握手后切换 MessageChannel，外部脚本无法监听消息内容
- **消息队列缓冲** - 握手完成前调用 `send()` / `request()` 自动入队，握手后按序投递
- **请求-应答 RPC** - 基于 Promise 的 `request()` / `onRequest()`，内置超时和错误传递
- **自动重连** - guest 页面重载后自动重新握手，handlers 保留
- **心跳检测** - opt-in 心跳超时触发 `onDisconnect`，感知对端页面崩溃
- **来源隔离** - `allowedOrigins` 白名单 + `appId` 多实例隔离 + `event.source` 防伪造

---

## 快速开始

### 安装

```bash
pnpm add @kit/sdk
```

### 基础用法

```ts
import { createSDK } from '@kit/sdk';

const sdk = createSDK({
  appId: 'my-platform', // 应用唯一标识，必填
  debug: true,          // 开启调试日志，默认 false
});
```

**Host 侧**（持有目标窗口引用的一方）：

```ts
const channel = sdk.iframe.asHost(iframeEl, {
  allowedOrigins: ['https://guest.example.com'],
});

channel.send({ type: 'init', config });
channel.onMessage((payload, source) => {
  console.log('from guest:', payload, source.origin);
});
```

**Guest 侧**（被嵌入或被打开的页面）：

```ts
const channel = sdk.iframe.asGuest();

channel.onMessage((payload) => {
  console.log('from host:', payload);
});

// 页面初始化完成后调用 ready() 发起握手
channel.ready('https://host.example.com');

channel.send({ status: 'loaded' });
```

> `ready()` 自动识别运行环境：优先 `window.opener`（新窗口），回退 `window.parent`（iframe）。

### 请求-应答（RPC）

```ts
// Guest 侧注册 handler
guestChannel.onRequest<{ id: number }, User>(async (req) => {
  return await fetchUser(req.id);
});

// Host 侧发起请求
try {
  const user = await hostChannel.request<{ id: number }, User>(
    { id: 42 },
    { timeout: 3000 },
  );
} catch (err) {
  // 超时 / 对端抛错 / 通道断开
}
```

同一通道最多注册一个 `onRequest` handler，重复注册会 warn 并覆盖。handler 的同步/异步返回值都会包装成响应回发，异常会序列化为 error 响应。

### 心跳 / 断连检测

```ts
const channel = sdk.iframe.asHost(iframeEl, {
  heartbeat: { interval: 5000, timeout: 15000 },
});

channel.onDisconnect((reason) => {
  // reason: 'heartbeat-timeout'
  console.warn('对端失联:', reason);
});

channel.onConnect(() => {
  // 首次握手成功和每次重连成功都触发
  channel.send({ type: 'sync-state', payload: latestState });
});
```

不传 `heartbeat` 则不启用，行为与关闭心跳时一致。

---

## API

### createSDK(options)

创建 SDK 实例，返回 `{ iframe }`。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| appId | `string` | - | ✅ | 应用唯一标识，用于握手阶段区分多实例 |
| debug | `boolean` | `false` | ❌ | 开启调试日志。注：`warn` 级别不受此开关控制，始终输出 |

---

### sdk.iframe.asHost(target, options?) → HostChannel

创建 Host 侧通道，立即开始监听 guest 握手信号。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| target | `HTMLIFrameElement \| Window` | - | ✅ | iframe 元素或 `window.open()` 返回值 |
| options.allowedOrigins | `string[]` | - | ❌ | 允许握手的 guest origin 白名单 |
| options.onReconnect | `() => void` | - | ❌ | guest 重载重新握手完成时触发 |
| options.heartbeat | `HeartbeatOptions` | - | ❌ | 心跳配置，不传则不启用 |

### sdk.iframe.asGuest(options?) → GuestChannel

创建 Guest 侧通道，需显式调用 `ready()` 发起握手。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| options.heartbeat | `HeartbeatOptions` | - | ❌ | 心跳配置，不传则不启用 |

### HeartbeatOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| interval | `number` | `5000` | 心跳间隔（毫秒） |
| timeout | `number` | `15000` | 判定断连的超时时间（毫秒），必须 > `interval` |

---

### Channel 通用 API

Host 和 Guest 共享的方法 / 属性：

| 成员 | 签名 | 说明 |
|------|------|------|
| connected | `boolean` | 是否已完成握手并绑定 port |
| send | `(payload: T) => void` | 发送普通消息，握手前自动入队 |
| request | `(payload: Req, options?: RequestOptions) => Promise<Res>` | 发起请求，等待对端响应 |
| onMessage | `(handler: MessageHandler<T>) => () => void` | 订阅普通消息，返回取消函数 |
| onRequest | `(handler: RequestHandler<Req, Res>) => () => void` | 注册请求处理器，每通道最多 1 个 |
| onConnect | `(handler: () => void) => () => void` | 订阅连接建立（首次 + 每次重连） |
| onDisconnect | `(handler: (reason) => void) => () => void` | 订阅断连事件（当前仅 `'heartbeat-timeout'`） |
| dispose | `() => void` | 销毁频道，幂等 |

### Guest 专有

#### channel.ready(targetOrigin?)

通知 host 页面 guest 已初始化完成，发起握手。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| targetOrigin | `string` | `'*'` | host 页面的 origin，生产环境推荐明确指定 |

可重复调用：已连接时会关闭旧 port 并重新握手，handlers 和 connectListeners 保留。

---

### RequestOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| timeout | `number` | `10000` | 请求超时时间（毫秒），超时后 Promise reject |

### MessageSource（handler 第二个参数）

| 属性 | 类型 | 说明 |
|------|------|------|
| origin | `string` | 握手时确认的对端 origin |
| appId | `string` | 应用 id（握手保证两端相等） |

---

## 类型导出

```ts
import type {
  SDKOptions,
  HostChannelOptions,
  GuestChannelOptions,
  HeartbeatOptions,
  RequestOptions,
  MessageHandler,
  RequestHandler,
  MessageSource,
  DisconnectReason,
  HostChannel,
  GuestChannel,
  WindowTarget,
} from '@kit/sdk';
```

---

## 开发

```bash
pnpm dev        # watch 构建
pnpm build      # 产出 dist/
pnpm test       # 单元测试
pnpm lint       # ESLint
```
