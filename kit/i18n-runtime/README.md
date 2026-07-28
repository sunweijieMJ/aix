# @kit/i18n-runtime

运行时 DOM 扫描机翻引擎：零业务代码侵入地为历史 Vue3 SPA 门户提供类 Google 翻译的国际化效果。

## 三种接入方式

### 1. npm + Vue 插件（推荐，能修改 main.ts 的项目）

```ts
import { createApp } from 'vue';
import { createI18nRuntimePlugin } from '@kit/i18n-runtime/vue';
import router from './router';

const app = createApp(App);
app.use(router);
app.use(
  createI18nRuntimePlugin({
    provider: 'backend',
    apiBase: '/api/i18n',
    languages: ['en', 'ja', 'ko'],
    router, // 传入后用 router.afterEach 监听路由切换，比 history monkey-patch 更干净
    initialLanguage: 'en', // 可选，不传则保持显示原文，由业务自行调用 setLanguage
  }),
);
app.mount('#app');
```

组件内切换语言：

```ts
import { useI18nRuntime } from '@kit/i18n-runtime/vue';

const i18nRuntime = useI18nRuntime();
i18nRuntime.setLanguage('ja');
```

### 2. npm + React Provider（能修改入口文件的 React 项目）

```tsx
import { createRoot } from 'react-dom/client';
import { I18nRuntimeProvider } from '@kit/i18n-runtime/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <I18nRuntimeProvider
    provider="backend"
    apiBase="/api/i18n"
    languages={['en', 'ja', 'ko']}
    initialLanguage="en" // 可选，不传则保持显示原文，由业务自行调用 setLanguage
  >
    <App />
  </I18nRuntimeProvider>,
);
```

组件内切换语言：

```tsx
import { useI18nRuntime } from '@kit/i18n-runtime/react';

function LanguageSwitcher() {
  const i18nRuntime = useI18nRuntime();
  return <button onClick={() => i18nRuntime.setLanguage('ja')}>日本語</button>;
}
```

> React 路由方案分散（React Router / TanStack Router / Next.js 等），没有统一的钩子可用，`I18nRuntimeProvider` 不提供 router 集成，统一走 `history.pushState`/`popstate` 监听（对任何 SPA 路由方案都生效）。该封装面向纯客户端 SPA，不做 SSR/RSC 适配；如需在 Next.js 里使用，请在自己的入口文件按需加 `'use client'`。

### 3. script 标签（完全不能改动业务代码的历史页面）

```html
<script
  src="https://your-cdn/i18n-runtime.global.iife.js"
  data-provider="backend"
  data-api-base="/api/i18n"
  data-languages="en,ja,ko"
  data-initial-language="en"
></script>
```

页面加载后可通过 `window.I18nRuntime.setLanguage('ja')` 切换语言。

## 配置项

| 字段 | 类型 | 说明 |
|------|------|------|
| `provider` | `'backend' \| 'libretranslate'` | 主翻译服务 |
| `fallbackProvider` | `'backend' \| 'libretranslate'` | 可选，主 provider 报错时降级调用一次 |
| `apiBase` | `string` | `provider`/`fallbackProvider` 为 `backend` 时必填 |
| `libretranslateUrl` | `string` | `provider`/`fallbackProvider` 为 `libretranslate` 时必填 |
| `languages` | `string[]` | 支持的目标语言列表 |
| `sourceLang` | `string` | 页面原文语言，默认 `'zh'`。`setLanguage(sourceLang)` 是纯本地还原操作，见下方「切回源语言」 |
| `router` | `Router` | 可选，Vue Router 实例（仅插件接入方式） |
| `debounceMs` | `number` | 攒批防抖间隔，默认 `50` |
| `maxBatchSize` | `number` | 默认 `50` |
| `storage` | `'localStorage' \| 'indexedDB' \| PackStorageAdapter` | 默认 `'localStorage'`。L2 只是缓存层，读写抛异常（隐私模式禁用 storage、配额耗尽等）时会打印 warn 并降级为「仅用 L1 + 远端」，不影响翻译本身 |
| `maxEntries` | `number` | 仅约束 **L2 持久化层**且仅在 `storage: 'localStorage'`（默认）时生效，单语言最大条目数，默认 `2000`，超出 LRU 淘汰；`storage: 'indexedDB'` 时该配置被忽略（并打印一次 console.warn），IndexedDB 容量远大于 localStorage 不需要淘汰兜底。**L1 内存缓存不受此参数约束，也没有淘汰** |
| `extraAttrs` | `string[]` | 除 `placeholder` / `title` / `alt` 之外，额外需要翻译的 HTML 属性名，如 `['data-placeholder']` |
| `glossary` | `string[]` | 全局术语表，翻译时传给后端，防止品牌名/专有名词被翻译 |
| `shouldTranslate` | `(text: string, node: Node) => boolean` | 按内容/DOM 位置决定是否翻译，返回 `false` 的候选既不出网也不改写 DOM。用于个人信息脱敏，见「数据流向与隐私」 |
| `scanShadowDOM` | `boolean` | 是否扫描 open shadow root 内的文本，默认 `true`；设为 `false` 关闭所有 shadow DOM 翻译（script 标签方式对应 `data-scan-shadow-dom="false"`） |
| `getCurrentPath` | `() => string` | 获取当前路由路径的回调函数，返回值随**翻译请求**传给后端（后端可据此按页面分组缓存翻译结果）；不随语言包请求下发，原因见 `/pack` 一节；不传则路径为空 |
| `backendOptions` | `object` | backend provider 的接口自定义配置，见下方详细说明 |

### backendOptions 配置项（仅 provider 为 'backend' 时生效）

| 字段 | 类型 | 说明 |
|------|------|------|
| `translatePath` | `string` | 翻译接口路径，默认 `'/translate'` |
| `packPath` | `string` | 语言包接口路径，默认 `'/pack'` |
| `headers` | `Record<string, string>` | 附加到所有请求的自定义 headers |
| `transformRequest` | `(req) => unknown` | 自定义翻译请求入参转换，返回值作为请求体 |
| `transformResponse` | `(raw) => TranslateBatchResult` | 自定义翻译响应出参转换 |
| `translateFetcher` | `(req) => Promise<TranslateBatchResult>` | 完全自定义翻译请求函数（设置后 translatePath/headers/transform 对翻译均无效） |
| `transformPackResponse` | `(raw) => RemotePack \| null` | 自定义语言包响应解析；不传则按默认 `{code, data}` 格式解析 |
| `packFetcher` | `(lang) => Promise<RemotePack \| null>` | 完全自定义语言包请求函数（设置后 packPath/headers/transformPackResponse 对语言包请求均无效） |

## engine 实例 API

三种接入方式拿到的都是同一套实例（Vue `useI18nRuntime()` / React `useI18nRuntime()` / script 标签 `window.I18nRuntime`）。

| 方法 | 说明 |
|------|------|
| `setLanguage(lang)` | 切换语言。传 `sourceLang` 是纯本地还原，见「切回源语言」 |
| `getLanguage()` | 当前语言，`start()` 后未切换过则为 `sourceLang` |
| `clearCache(lang?)` | 清空语言包缓存（L1 + L2），不传则清所有已缓存语言。见「数据流向与隐私」 |
| `addRoot(node)` | 手动注册额外的扫描根。用于 closed shadow root，以及**宿主元素已在 DOM 中、之后才 `attachShadow()` 的组件**——`attachShadow()` 不产生 MutationObserver 记录，这类 shadow 树扫不到，需要业务显式注册 |
| `on('node-translated', cb)` | 监听文本节点被写入译文，返回取消订阅函数 |
| `stop()` | 停止扫描与观察。不会回滚页面上已写入的译文 |

## 排除翻译

手动排除（整棵子树，含元素自身的属性）：

- 标准属性：`<div translate="no">品牌名</div>`
- 自定义属性：`<div data-i18n-skip>不翻译</div>`

标记挂在 shadow host 上时对其 shadow root 内部同样生效。

默认自动排除：

- `<script>` / `<style>` / `<noscript>` 整棵子树
- `<textarea>` 和 `contenteditable` 元素的**文本内容**（那是用户表单值，翻译会篡改待提交的数据）；但它们的 `placeholder` / `title` 等属性仍会正常翻译
- 不含任何 Unicode 字母的文本（纯数字、纯符号、纯空白）

## 数据流向与隐私（接入前必读）

本运行时的工作方式是**扫描整个 DOM，把所有含字母的可见文本 POST 到 `apiBase` 配置的翻译服务**。这意味着页面上渲染了什么，翻译服务就会收到什么——包括用户姓名、邮箱、地址、订单备注等个人信息：

```
POST /translate
{"items":[
  {"text":"订单联系人：张伟"},
  {"text":"邮箱 zhangwei@example.com"},
  {"text":"收货地址：北京市朝阳区某某路 {N0} 号"}
]}
```

> 纯数字（手机号、身份证号、金额等）会被占位符归一化成 `{N0}` 不出网，但**姓名、邮箱、地址这类文本会原样发送**。

接入前请按下面三层做好收敛：

**1. 按区域静态排除**（最省事，优先用）

```html
<div data-i18n-skip>
  <p>收货人：张伟</p>
  <p>13800138000</p>
</div>
```

**2. 按内容动态排除** —— `shouldTranslate` 钩子

```ts
createI18nRuntimePlugin({
  // 返回 false 的文本既不会发给翻译服务，也不会被写回 DOM
  shouldTranslate: (text, node) => !/@|\d{11}|身份证/.test(text),
  // ...
});
```

`node` 参数：文本候选传 `Text` 节点，属性候选传属性所在的 `Element`，可据此按 DOM 位置判断。

**3. 清理本地缓存** —— 译文会持久化到 localStorage / IndexedDB，用户登出时应主动清掉

```ts
await engine.setLanguage('zh'); // 可选：先把页面还原成原文
await engine.clearCache(); // 清空所有语言的 L1 + L2；也可传单个语言 clearCache('en')
```

另外：`provider: 'libretranslate'` 指向的是你自托管的服务，`provider: 'backend'` 指向你自己的后端；两者都不会把数据发给本包作者或任何第三方。数据最终流向哪里，完全取决于你配置的 `apiBase` / `libretranslateUrl`。

## 切回源语言

`setLanguage(sourceLang)`（默认 `setLanguage('zh')`）是**纯本地操作**：文本节点的原文记在 `NodeRegistry` 里、属性原文记在 `data-i18n-orig-*` 上，还原直接从这两处取，不会发起任何翻译请求，也就不依赖翻译服务对「源语言翻译成源语言」这种输入的返回值。因此语言下拉框里把源语言和目标语言并列即可：

```ts
engine.setLanguage('en'); // 走翻译服务
engine.setLanguage('zh'); // 本地还原成页面原文，零网络
```

同理，若希望页面在 `stop()` 前回到原文状态，先 `await setLanguage(sourceLang)` 再 `stop()`——`stop()` 本身只是停止扫描，不会回滚已经写入的译文。

## 后端接口契约

`provider: 'backend'` 时，需要后端实现以下两个接口（实现见 `src/core/translator/backend.ts` 与 `src/core/engine.ts`）。

### `POST {apiBase}/translate` — 批量翻译并持久化

请求体：

```json
{
  "items": [{ "hash": "1a2b3c4d", "text": "共 {N0} 条" }],
  "sourceLang": "zh",
  "targetLang": "en",
  "path": "/home",
  "glossary": ["PolyMas", "智慧树"]
}
```

- `hash` 由前端本地计算（FNV-1a 32 位），后端只需原样存储、原样返回，不需要也不应该重新计算或用它反查原文
- `text` 是归一化后的原文——数字/日期序列已被替换成 `{N0}`、`{N1}` 这类占位符（实现见 `src/core/normalizer.ts`，目的是避免同一模板因分页/计数等数字不同被当成不同原文反复翻译），后端调用机翻引擎时应原样传入，返回的译文也必须原样保留这些占位符 token，前端会在写回 DOM 前做占位符回填
- `path`（可选）：当前页面路径，由前端通过 `getCurrentPath()` 回调提供，后端可据此按页面分组缓存翻译结果
- `glossary`（可选）：术语表，后端在翻译时应确保这些词不被翻译
- HTTP 状态码非 `2xx`，或响应体 `code !== 0`，均视为本次批量翻译失败；失败不影响页面正常显示原文，前端会在下次扫描时自动重试

响应体：

```json
{
  "code": 0,
  "data": {
    "translations": [{ "hash": "1a2b3c4d", "translation": "{N0} in total" }]
  }
}
```

- 失败时可用 `message` 字段描述错误原因（仅用于前端 `console.error` 日志，不会展示给用户）
- `translations` 里缺失的 hash（比如翻译引擎跳过了某条）会被视为未翻译，等下次扫描自然重新入队重试，不会用原文顶替译文写入缓存

### `GET {apiBase}/pack?lang=xx` — 拉取语言包

响应体：

```json
{
  "code": 0,
  "data": {
    "version": "2026-07-16T10:00:00Z",
    "entries": { "1a2b3c4d": "{N0} in total" }
  }
}
```

- `version` 由后端自行生成（时间戳、自增号、内容 hash 均可），前端只做字符串比较：与本地缓存（L2）已有的 version 相同就直接跳过，不同则把整包 `entries` **合并**进本地缓存（同 hash 以远端为准），不做语义解析
- 注意合并语义的取舍：本地不会因为远端少了某个 hash 就删掉它（并发的 `/translate` 结果可能还没落盘，整包覆盖会把它们冲掉）。因此**修改**译文能即时生效，**删除**译文不会同步到已有客户端，只会等 `maxEntries` LRU 淘汰。需要强制清除时请换一个 `hash`（即改动原文）或提升 `maxEntries` 之外的手段
- 译文为空字符串的词条会被丢弃、不进缓存（写回 DOM 等于抹掉页面内容），等同于该 hash 未翻译
- `entries` 是该语言的全量 `hash -> translation` 映射
- **语言包不按路由分片**，请求上不会带 `path`：前端的 L2 只按 `lang` 存储、`version` 也只按 `lang` 比对。若后端按 `path` 返回子集，第二个页面的整包会因为 `version` 与第一个页面相同而被静默丢弃。需要按页面拆分翻译工作量时，请在 `/translate` 上用 `path`（那里是有意支持的），而不是在 `/pack` 上
- HTTP 状态码非 `2xx`，或响应体 `code !== 0`，均视为拉取失败；此时静默降级使用本地已有的 L1/L2 缓存，不阻塞、不抛出未捕获异常
