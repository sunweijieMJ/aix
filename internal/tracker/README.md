# @kit/tracker

基于适配器模式的前端埋点数据采集组件包，为 Vue 3 应用提供声明式和命令式的行为追踪能力。核心层与分析平台解耦，内置企点营销云 QDTracker SDK 适配器，支持同时上报多个分析平台。

## 特性

- **适配器模式** - 核心层与分析平台解耦，业务代码零改动即可切换或新增上报目标
- **TypeScript 类型安全** - 完整的事件/属性类型定义，支持泛型约束
- **Vue 3 深度集成** - Plugin 安装 + Composables + 自定义指令，声明式埋点
- **事件缓冲队列** - SDK 未就绪前自动缓存事件，就绪后按适配器粒度回放
- **曝光检测** - 基于 IntersectionObserver，支持可见时长阈值和 once 模式
- **Vue Router 集成** - 自动 pageview/pageclose 上报，支持路由排除和自定义页面名
- **调试与校验** - 开发环境 console 输出上报详情 + 事件名/属性命名规范校验

---

## 快速开始

### 安装

Monorepo 内已配置，无需额外安装。独立使用时：

```bash
pnpm add @kit/tracker
```

### 基础用法

```typescript
// main.ts
import { createApp } from 'vue';
import { createTrackerPlugin, QDTrackerAdapter, ConsoleAdapter } from '@kit/tracker';
import router from './router';

const app = createApp(App);

app.use(createTrackerPlugin({
  appkey: 'your_appkey',
  url: 'https://report.example.com/event',
  sdkUrl: 'https://cdn.example.com/QDTracker.js',
  debug: import.meta.env.DEV,
  validation: import.meta.env.DEV,
  router,
  autoPageview: true,
  adapters: import.meta.env.DEV
    ? [new ConsoleAdapter()]
    : [new QDTrackerAdapter()],
  commonProperties: {
    global_product_type: 'Web',
    global_product_name: '应用名称',
    global_app_version: __APP_VERSION__,
  },
}));
```

---

## API

### createTrackerPlugin

创建 Vue 插件，`install()` 内部依次：

1. 创建 `Tracker` 实例并 `app.provide()` 注入
2. 注册 `v-track-click` / `v-track-exposure` 自定义指令
3. 如传入 `router` + `autoPageview`，安装 Router 守卫
4. 异步调用 `tracker.init()` 初始化适配器（事件由 EventQueue 缓冲）

```typescript
const plugin = createTrackerPlugin(options: TrackerPluginOptions);
app.use(plugin);
```

#### TrackerPluginOptions

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| appkey | `string` | - | ✅ | 企点 appkey |
| adapters | `ITrackerAdapter[]` | `[]` | ❌ | 适配器列表，需显式传入 |
| url | `string` | - | ❌ | 上报地址 |
| sdkUrl | `string` | - | ❌ | QDTracker SDK CDN 地址 |
| tid | `string` | `''` | ❌ | 工号 |
| debug | `boolean` | `false` | ❌ | 调试模式，控制台输出上报详情 |
| validation | `boolean \| ValidatorConfig` | `false` | ❌ | 事件校验（开发环境） |
| queue | `QueueConfig` | `{ maxSize: 50 }` | ❌ | 事件缓冲配置 |
| commonProperties | `CommonPropertyMap` | - | ❌ | 初始公共属性 |
| qdOptions | `QDTrackerOptions` | - | ❌ | 企点 SDK 特有配置 |
| router | `Router` | - | ❌ | Vue Router 实例 |
| autoPageview | `boolean \| AutoPageviewConfig` | - | ❌ | 自动 pageview 配置 |

#### AutoPageviewConfig

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| exclude | `(string \| RegExp)[]` | `[]` | 排除的路由（路由名称或路径正则） |
| getPageName | `(to) => string` | - | 自定义获取页面名称 |
| includeQuery | `boolean` | `false` | 是否在 pageview 中包含 route.query |

---

### Composables

#### useTracker

核心 Composable，通过 `inject()` 获取 Tracker 实例。

```vue
<script setup lang="ts">
import { useTracker } from '@kit/tracker';

const { track, identify, setCommonData } = useTracker();

// 登录后设置用户身份
function onLogin(user: User) {
  identify({
    uin: user.id,
    mobile: user.phone,
    diy_id: { customId: user.studentId },
  });
}

// 手动上报事件
function onClickApp(item: AppItem, index: number) {
  track('app_zdydmh_home_top_app_ck', {
    content_title: item.name,
    content_pos: index + 1,
    content_id: item.id,
  });
}
</script>
```

**返回值：**

| 属性 | 类型 | 说明 |
|------|------|------|
| track | `(eventName, properties?) => void` | 上报自定义事件 |
| identify | `(account: AccountInfo) => void` | 设置用户身份 |
| setCommonData | `(data: CommonPropertyMap) => void` | 更新公共属性 |
| tracker | `Tracker` | Tracker 实例（高级用法） |

#### useExposure

基于 IntersectionObserver 的曝光检测。元素进入视口且可见时长超过阈值后触发上报。

```vue
<script setup lang="ts">
import { useExposure } from '@kit/tracker';

const { elementRef: bannerRef, isExposed } = useExposure({
  event: 'app_zdydmh_home_banner_imp',
  properties: () => ({
    content_title: props.item.name,
    content_pos: props.index + 1,
    content_id: props.item.id,
  }),
  threshold: 0.5,
  once: true,
  minVisibleTime: 300,
});
</script>

<template>
  <div ref="bannerRef">{{ item.name }}</div>
</template>
```

**UseExposureOptions：**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| event | `string` | - | ✅ | 事件名 |
| properties | `BaseEventProperties \| () => BaseEventProperties` | - | ❌ | 事件属性（支持动态函数） |
| threshold | `number` | `0.5` | ❌ | IntersectionObserver 可见阈值 |
| once | `boolean` | `true` | ❌ | 是否仅上报一次 |
| minVisibleTime | `number` | `300` | ❌ | 最小可见时长（毫秒） |

**返回值：**

| 属性 | 类型 | 说明 |
|------|------|------|
| elementRef | `Ref<HTMLElement \| null>` | 绑定到目标元素的 ref |
| isExposed | `Ref<boolean>` | 是否已曝光 |
| reset | `() => void` | 重置曝光状态，允许再次触发 |

#### usePageTracker

组件级页面埋点。`onMounted` 上报 `$pageview`，`onBeforeUnmount` 上报 `$pageclose`（携带停留时长 `dr`）。

> **注意：** 与 `autoPageview` Router Guard 互斥，二者只能启用一个，否则会重复上报。

```vue
<script setup lang="ts">
import { usePageTracker } from '@kit/tracker';

usePageTracker({
  pageName: '详情页',
  enterProperties: { content_id: '123' },
  leaveProperties: { function_name: '返回' },
});
</script>
```

---

### 自定义指令

#### v-track-click

点击埋点指令。`mounted` 时绑定 click 事件，`updated` 时重新绑定以捕获最新 properties，`beforeUnmount` 时清理。

```html
<!-- 基础用法 -->
<button v-track-click="{ event: 'app_zdydmh_home_btn_ck', properties: { content_title: '按钮' } }">
  点击
</button>

<!-- 动态属性（v-for 场景） -->
<div
  v-for="(item, index) in list"
  :key="item.id"
  v-track-click="{
    event: 'app_zdydmh_search_result_ck',
    properties: { content_title: item.title, content_pos: index + 1 }
  }"
>
  {{ item.title }}
</div>

<!-- 仅触发一次 -->
<button v-track-click="{ event: 'web_zdydmh_guide_start_ck', once: true }">
  开始引导
</button>
```

**TrackClickBinding：**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| event | `string` | - | ✅ | 事件名 |
| properties | `BaseEventProperties` | - | ❌ | 事件属性 |
| once | `boolean` | `false` | ❌ | 是否仅触发一次 |

#### v-track-exposure

曝光埋点指令。基于 IntersectionObserver，元素可见超过阈值时长后触发上报。

```html
<div
  v-for="(item, index) in list"
  :key="item.id"
  v-track-exposure="{
    event: 'app_zdydmh_home_app_imp',
    properties: { content_title: item.name, content_pos: index + 1, content_id: item.id },
    threshold: 0.5,
    once: true,
    minVisibleTime: 300
  }"
>
  {{ item.name }}
</div>
```

**TrackExposureBinding：**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| event | `string` | - | ✅ | 事件名 |
| properties | `BaseEventProperties \| () => BaseEventProperties` | - | ❌ | 事件属性 |
| threshold | `number` | `0.5` | ❌ | 可见阈值 |
| once | `boolean` | `true` | ❌ | 是否仅上报一次 |
| minVisibleTime | `number` | `300` | ❌ | 最小可见时长（毫秒） |

---

### 适配器

#### ITrackerAdapter 接口

所有适配器必须实现此接口：

```typescript
interface ITrackerAdapter {
  readonly name: string;
  init(options: TrackerInitOptions): void | Promise<void>;
  track(eventName: string, properties: Record<string, unknown>): void;
  identify(account: AccountInfo): void;
  setCommonData(data: Record<string, unknown>): void;
  isReady(): boolean;
  destroy?(): void;
}
```

#### QDTrackerAdapter

企点 QDTracker SDK 适配器。通过 CDN `<script>` 标签异步加载 SDK，支持 AES 加密和点击全埋点。

```typescript
import { QDTrackerAdapter } from '@kit/tracker';

const adapter = new QDTrackerAdapter();
// init 时通过 sdkUrl 动态加载 SDK，无需预装依赖
```

**QDTrackerOptions（企点特有配置）：**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| encrypt_mode | `'close' \| 'aes'` | `'close'` | 加密模式 |
| aesUrl | `string` | - | AES 加密脚本地址 |
| enable_compression | `boolean` | `false` | 数据压缩 |
| track_interval | `number` | `0` | 上报间隔（毫秒） |
| batch_max_time | `number` | `1` | 批量上报最大等待时间（秒） |
| preventAutoTrack | `boolean` | `true` | 阻止自动采集预置事件 |
| pagestay | `boolean` | `false` | 页面停留时长采集 |
| heatmap | `Record<string, unknown>` | - | 热力图/点击全埋点配置 |
| autoTrackUrl | `string` | - | 全埋点脚本地址 |

#### SensorsAdapter

神策数据 SDK 适配器。支持 CDN 和 npm 两种加载方式。

```typescript
import { SensorsAdapter } from '@kit/tracker';

// CDN 方式
const adapter = new SensorsAdapter({
  serverUrl: 'https://xxx.datasink.sensorsdata.cn/sa',
  sdkUrl: 'https://static.sensorsdata.cn/sdk/1.26.4/sensorsdata.min.js',
  showLog: import.meta.env.DEV,
  sendType: 'beacon',
});

// npm 方式（需自行安装 sa-sdk-javascript）
import sensors from 'sa-sdk-javascript';
const adapter = new SensorsAdapter({
  serverUrl: 'https://xxx.datasink.sensorsdata.cn/sa',
  sdk: sensors,
});
```

**SensorsAdapterConfig：**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| serverUrl | `string` | - | ✅ | 数据接收地址 |
| sdkUrl | `string` | - | ❌ | CDN 加载地址（与 sdk 二选一） |
| sdk | `unknown` | - | ❌ | npm 安装的 SDK 实例（与 sdkUrl 二选一） |
| showLog | `boolean` | `false` | ❌ | 是否显示日志 |
| sendType | `'image' \| 'ajax' \| 'beacon'` | `'beacon'` | ❌ | 发送方式 |
| isSinglePage | `boolean` | `false` | ❌ | 单页应用模式 |
| heatmap | `Record<string, unknown>` | - | ❌ | 热力图配置 |

#### GrowingIOAdapter

GrowingIO SDK 适配器。支持 CDN 和 npm 两种加载方式。

```typescript
import { GrowingIOAdapter } from '@kit/tracker';

// CDN 方式
const adapter = new GrowingIOAdapter({
  accountId: 'your_account_id',
  dataSourceId: 'your_datasource_id',
  host: 'https://api.growingio.com',
  sdkUrl: 'https://assets.giocdn.com/sdk/webjs/cdp/gdp-full.js',
  version: '1.0.0',
});

// npm 方式（需自行安装 gio-webjs-sdk-cdp）
import gdp from 'gio-webjs-sdk-cdp/gdp-full';
const adapter = new GrowingIOAdapter({
  accountId: 'your_account_id',
  dataSourceId: 'your_datasource_id',
  host: 'https://api.growingio.com',
  sdk: gdp,
});
```

**GrowingIOAdapterConfig：**

| 属性 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|:----:|------|
| accountId | `string` | - | ✅ | 项目 accountId |
| dataSourceId | `string` | - | ✅ | 数据源 ID |
| host | `string` | - | ✅ | API 服务器地址 |
| sdkUrl | `string` | - | ❌ | CDN 加载地址（与 sdk 二选一） |
| sdk | `unknown` | - | ❌ | npm 安装的 SDK 实例（与 sdkUrl 二选一） |
| version | `string` | - | ❌ | 网站版本 |

#### ConsoleAdapter

开发/测试环境使用的调试适配器。`init()` 同步完成，将每次上报通过 `console.groupCollapsed` + `console.table` 输出到控制台。

```typescript
import { ConsoleAdapter } from '@kit/tracker';

// 开发环境使用
const adapters = import.meta.env.DEV
  ? [new ConsoleAdapter()]
  : [new QDTrackerAdapter()];
```

#### 多平台同时上报

适配器列表支持多个，可同时上报到多个平台：

```typescript
createTrackerPlugin({
  appkey: 'your_appkey',
  adapters: [
    new QDTrackerAdapter(),
    new SensorsAdapter({ serverUrl: 'https://...' , sdkUrl: '...' }),
    new GrowingIOAdapter({ accountId: '...', dataSourceId: '...', host: '...' , sdkUrl: '...' }),
  ],
});
```

#### 自定义适配器

实现 `ITrackerAdapter` 接口即可接入自建分析平台：

```typescript
import type { ITrackerAdapter, AccountInfo, TrackerInitOptions } from '@kit/tracker';

class MyAnalyticsAdapter implements ITrackerAdapter {
  readonly name = 'my-analytics';
  private ready = false;

  init(options: TrackerInitOptions): void {
    // 初始化自建 SDK
    this.ready = true;
  }

  track(eventName: string, properties: Record<string, unknown>): void {
    // 上报到自建平台
    fetch('/api/analytics', {
      method: 'POST',
      body: JSON.stringify({ event: eventName, properties }),
    });
  }

  identify(account: AccountInfo): void { /* ... */ }
  setCommonData(data: Record<string, unknown>): void { /* ... */ }
  isReady(): boolean { return this.ready; }
}
```

---

## 公共属性

公共属性通过 `commonProperties` 配置或 `setCommonData()` 方法管理，每次 `track()` 时自动合并到事件属性中（事件属性优先级更高）。

属性值支持三种形式：

| 形式 | 说明 | 示例 |
|------|------|------|
| 静态值 | 直接设置 | `global_product_type: 'Web'` |
| 动态函数 | 每次上报时执行 | `event_time: () => new Date().toISOString()` |
| `null` | 删除该属性 | `global_page_name: null` |

```typescript
// 初始化时设置
createTrackerPlugin({
  commonProperties: {
    global_product_type: 'Web',
    global_app_version: '1.0.0',
    event_time: () => new Date().toISOString(), // 动态属性
  },
});

// 运行时更新
const { setCommonData } = useTracker();
setCommonData({
  global_is_login: true,
  global_id: userId,
});

// 删除属性
setCommonData({ global_temp_flag: null });
```

**按企点 BA 平台数据模型分为 4 类：**

| 类别 | 前缀 | 示例字段 |
|------|------|---------|
| TimeProperties | `event_` | `event_time` |
| UserProperties | `global_` | `global_id`, `global_name`, `global_gender` |
| ContextProperties | `global_` | `global_is_login`, `global_device_type`, `global_os` |
| PageProperties | `global_` | `global_product_type`, `global_page_name`, `global_from_page_name` |

---

## 事件校验

仅在开发环境启用（`validation: true` 或传入 `ValidatorConfig`），帮助发现事件命名和属性问题。

```typescript
createTrackerPlugin({
  validation: {
    // 事件名正则，默认要求 app_/mp_/web_ 前缀 + 小写下划线
    eventNamePattern: /^(app|mp|web)_[a-z0-9]+(_[a-z0-9]+){1,5}$/,
    // 属性白名单（global_ 前缀的公共属性自动跳过）
    allowedProperties: ['content_title', 'content_pos', 'content_id', 'function_name'],
    // warn: 仅警告（默认） | block: 阻止上报
    onViolation: 'warn',
  },
});
```

**校验规则：**

- 预置事件（`$` 开头如 `$pageview`）自动跳过校验
- 事件名不匹配正则 → 警告/阻止
- 属性不在白名单中（`global_` 前缀的公共属性除外）→ 警告/阻止

---

## 调试模式

当 `debug: true` 时，控制台输出每次上报的详细信息：

```
▸ [Track] app_zdydmh_home_top_app_ck           ← 可折叠
  时间: 2024-03-28T10:30:00.000Z
  ┌──────────────────┬─────────────┐
  │ content_title    │ 校园地图     │
  │ content_pos      │ 3           │
  │ content_id       │ map_001     │
  │ global_product   │ Web         │
  └──────────────────┴─────────────┘
```

---

## 架构

```
internal/tracker/
├── src/
│   ├── index.ts                      # 统一导出入口
│   ├── types.ts                      # 所有公共 TypeScript 类型
│   ├── core/                         # 核心层（框架无关）
│   │   ├── tracker.ts                # Tracker 主类
│   │   ├── queue.ts                  # 事件缓冲队列
│   │   ├── common-properties.ts      # 公共属性管理
│   │   ├── validator.ts              # 事件校验器
│   │   └── logger.ts                 # 调试日志
│   ├── adapters/                     # 适配器层
│   │   ├── qdtracker.adapter.ts      # 企点 QDTracker SDK 适配器
│   │   └── console.adapter.ts        # Console 调试适配器
│   ├── composables/                  # Vue Composition API
│   │   ├── use-tracker.ts            # 核心 hook
│   │   ├── use-exposure.ts           # 曝光检测 hook
│   │   └── use-page-tracker.ts       # 页面级埋点 hook
│   ├── directives/                   # Vue 自定义指令
│   │   ├── v-track-click.ts          # 点击埋点指令
│   │   └── v-track-exposure.ts       # 曝光埋点指令
│   └── plugin/                       # Vue 插件
│       └── index.ts                  # app.use() 安装入口
├── __test__/                         # 单元测试（12 个文件 63 个用例）
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

**数据流：**

```
业务代码 → Composable/Directive → Tracker.track()
  → 合并公共属性
  → 开发环境校验 (Validator)
  → 调试日志 (Logger)
  → 已就绪适配器 → 立即上报
  → 未就绪适配器 → EventQueue 缓冲 → SDK 就绪后 flush 回放
```

---

## 开发

```bash
# 开发模式（watch）
pnpm dev

# 构建
pnpm build

# 单元测试
pnpm test

# ESLint 检查
pnpm lint
```

---

## 设计文档

详细设计方案参见 [RFC: 埋点数据采集](../../docs/rfcs/tracker.md)
