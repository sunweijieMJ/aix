# @kit/sdk

通用前端工具 SDK，当前提供 **iframe 跨域消息通信**能力。

## 安装

```bash
pnpm add @kit/sdk
```

## 快速上手

### 1. 创建 SDK 实例

```ts
import { createSDK } from '@kit/sdk';

const sdk = createSDK({
  appId: 'my-platform', // 应用唯一标识，必填
  debug: true,          // 开启调试日志，默认 false
});
```

### 2. 父页面 → 子 iframe 发消息

```ts
const sender = sdk.iframe.createSender();
const iframe = document.querySelector('iframe')!;

sender.send(iframe, { userId: 'u123', token: 'abc' });
// targetOrigin 自动从 iframe.src 推导，无需手动传入
```

### 3. 子 iframe 接收父页面消息

```ts
// 在子 iframe 页面中
const receiver = sdk.iframe.createReceiver({
  allowedOrigins: ['https://main.example.com'], // origin 白名单，不传则接受所有来源
});

const stop = receiver.onMessage((payload, source) => {
  console.log('收到消息:', payload);
  console.log('发送方:', source.origin, source.appId);
});

// 取消单个监听
stop();

// 销毁整个 receiver（移除所有监听器）
receiver.destroy();
```

### 4. 子 iframe → 父页面发消息

```ts
// 在子 iframe 页面中
const sender = sdk.iframe.createSender();

sender.sendToParent({ status: 'ready' }, 'https://main.example.com');
// 第二个参数 targetOrigin 默认为 '*'
```

---

## API

### `createSDK(options)`

创建 SDK 实例，返回 `{ iframe }` 对象。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `appId` | `string` | 是 | 应用唯一标识，会附加在每条消息的信封中 |
| `debug` | `boolean` | 否 | 开启内部调试日志，默认 `false` |

---

### `sdk.iframe.createSender()` → `IframeSender`

每次调用返回一个新的 `IframeSender` 实例。

#### `sender.send(iframe, payload)`

向指定 iframe 发送消息（父页面使用）。

| 参数 | 类型 | 说明 |
|------|------|------|
| `iframe` | `HTMLIFrameElement` | 目标 iframe 元素 |
| `payload` | `T` | 要发送的数据，支持任意可序列化类型 |

- `targetOrigin` 自动从 `iframe.src` 推导；若 `iframe.src` 为空则使用 `*` 并打印警告
- `iframe.contentWindow` 为 `null` 时（iframe 未加载）静默丢弃并打印警告

#### `sender.sendToParent(payload, targetOrigin?)`

向父页面发送消息（子 iframe 使用）。

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `payload` | `T` | — | 要发送的数据 |
| `targetOrigin` | `string` | `'*'` | 父页面的 origin |

---

### `sdk.iframe.createReceiver(options?)` → `IframeReceiver`

每次调用返回一个新的 `IframeReceiver` 实例，独立管理自己的监听器。

| 参数 | 类型 | 说明 |
|------|------|------|
| `allowedOrigins` | `string[]` | origin 白名单；不传则接受所有来源 |

#### `receiver.onMessage(handler)` → `() => void`

注册消息处理器，返回取消该监听的函数。可多次调用以注册多个 handler。

```ts
type MessageHandler<T> = (payload: T, source: MessageSource) => void;
```

`source` 包含：
- `origin`：发送方页面的 origin
- `appId`：发送方 SDK 实例的 appId

#### `receiver.destroy()`

移除该实例注册的所有监听器，销毁后不可再使用。

---

## 消息安全

- 所有消息均使用内部信封格式（`__sdk: '@kit/sdk'`）封装，非 SDK 消息自动忽略
- 推荐在生产环境通过 `allowedOrigins` 限制消息来源
- `sender.send()` 自动推导 `targetOrigin`，避免向 `*` 发送含敏感数据的消息

## 类型导出

```ts
import type { SDKOptions, MessageSource, ReceiverOptions } from '@kit/sdk';
```
