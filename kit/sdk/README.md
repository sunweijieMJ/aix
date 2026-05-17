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
const channel = sdk.crossWindow.asHost(iframeEl, {
  allowedOrigins: ['https://guest.example.com'], // 也可用 '*' 或 'https://*.example.com'
});

channel.send({ type: 'init', config });
channel.onMessage((payload, source) => {
  console.log('from guest:', payload, source.origin);
});
```

**Guest 侧**（被嵌入或被打开的页面）：

```ts
const channel = sdk.crossWindow.asGuest({
  expectedHostOrigin: 'https://host.example.com', // 生产环境强烈建议指定
});

channel.onMessage((payload) => {
  console.log('from host:', payload);
});

channel.send({ status: 'loaded' });
```

> 默认 `autoReady: true`，构造后会通过 microtask 自动发起握手，业务侧只需在同步代码里注册 `onMessage` / `onRequest` 即可。
> 需要延迟握手（如等待外部数据）可传 `autoReady: false`，再手动调用 `channel.ready()`。
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
const channel = sdk.crossWindow.asHost(iframeEl, {
  heartbeat: { interval: 5000, timeout: 15000 },
});

channel.onDisconnect((reason) => {
  // reason: 'heartbeat-timeout' | 'peer-reconnect' | 'handshake-timeout'
  console.warn('对端失联:', reason);
});

channel.onConnect(({ reconnected }) => {
  // 首次握手 reconnected=false；guest 重载重新握手 reconnected=true
  channel.send({ type: 'sync-state', payload: latestState });
});
```

不传 `heartbeat` 则不启用，行为与关闭心跳时一致。

---

## API

### createSDK(options)

创建 SDK 实例，返回 `{ crossWindow }`。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| appId | `string` | - | ✅ | 应用唯一标识，用于握手阶段区分多实例 |
| debug | `boolean` | `false` | ❌ | 开启调试日志。注：`warn` 级别不受此开关控制，始终输出 |

---

### sdk.crossWindow.asHost(target, options?) → HostChannel

创建 Host 侧通道，立即开始监听 guest 握手信号。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| target | `HTMLIFrameElement \| Window` | - | ✅ | iframe 元素或 `window.open()` 返回值 |
| options.allowedOrigins | `string[]` | - | ❌ | 允许握手的 guest origin 白名单；支持精确匹配、glob 通配符（`'https://*.example.com'`）及 `'*'`（接受所有来源）；不传则接受所有来源 |
| options.handshakeTimeout | `number` | - | ❌ | 首次握手超时阈值（毫秒）。未设置或 ≤0 时不启用；超时后触发 `onDisconnect('handshake-timeout')` |
| options.heartbeat | `HeartbeatOptions` | - | ❌ | 心跳配置，不传则不启用 |

> guest 重载后重新握手通过 `onConnect({ reconnected: true })` 感知，无需单独的 `onReconnect`。

### sdk.crossWindow.asGuest(options?) → GuestChannel

创建 Guest 侧通道。默认 `autoReady: true`，构造后通过 microtask 自动发起握手。

| 参数 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| options.expectedHostOrigin | `string` | `'*'` | ❌ | host 页面的 origin，生产强烈建议明确指定；`'*'` 跳过校验，仅推荐开发使用 |
| options.autoReady | `boolean` | `true` | ❌ | 是否在构造后自动通过 microtask 发起握手；设为 `false` 时需要手动调用 `ready()` |
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
| onConnect | `(handler: (event: { reconnected: boolean }) => void) => () => void` | 订阅连接建立；首次握手 `reconnected=false`，guest 重载重新握手 `reconnected=true` |
| onDisconnect | `(handler: (reason: DisconnectReason) => void) => () => void` | 订阅断连事件（`'heartbeat-timeout'` \| `'peer-reconnect'` \| `'handshake-timeout'`） |
| onDispose | `(handler: () => void) => () => void` | 订阅通道销毁事件；注册时若已 disposed 立即同步触发 |
| dispose | `() => void` | 销毁频道，幂等 |

### Guest 专有

#### channel.ready(targetOrigin?)

通知 host 页面 guest 已初始化完成，发起握手。`autoReady: true`（默认）时构造期已自动调用，业务侧通常无需手动触发；仅在 `autoReady: false` 或需要重新握手时使用。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| targetOrigin | `string` | 构造时的 `expectedHostOrigin`（未指定则 `'*'`） | 覆盖期望的 host origin，仅用于测试/特殊场景 |

可重复调用：已连接时会关闭旧 port 并重新握手，handlers / connectListeners / requestHandler 保留。

---

### RequestOptions

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| timeout | `number` | `10000` | 单次请求超时时间（毫秒）。`retry` 启用时每次重试独立计时 |
| retry | `number` | `0` | 失败重试次数。可重试场景：① 单次超时 ② 远端 `onRequest` 返回 `{ ok: false, retryable: true }`。不可重试：handler 抛异常、通道 dispose、响应未带 `retryable` |
| retryBackoff | `number \| (attempt: number) => number` | `0` | 每次重试前的退避（毫秒）。可传固定值或函数，`attempt` 从 1 开始 |

> 远端 `onRequest` handler 显式返回 `{ ok: false, retryable: true, error? }` 即可让 SDK 自动触发重试；handler 抛出的异常一律视为不可重试。

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
