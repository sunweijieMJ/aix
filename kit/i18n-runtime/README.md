# @kit/i18n-runtime

运行时 DOM 扫描机翻引擎：零业务代码侵入地为历史 Vue3 SPA 门户提供类 Google 翻译的国际化效果。

## 两种接入方式

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

### 2. script 标签（完全不能改动业务代码的历史页面）

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
| `sourceLang` | `string` | 默认 `'zh'` |
| `router` | `Router` | 可选，Vue Router 实例（仅插件接入方式） |
| `debounceMs` | `number` | 默认 `200` |
| `maxBatchSize` | `number` | 默认 `50` |
| `storage` | `'localStorage' \| 'indexedDB' \| PackStorageAdapter` | 默认 `'localStorage'` |
| `maxEntries` | `number` | 仅在 `storage: 'localStorage'`（默认）时生效，L2 单语言最大条目数，默认 `2000`，超出 LRU 淘汰；`storage: 'indexedDB'` 时该配置被忽略（并打印一次 console.warn），IndexedDB 容量远大于 localStorage 不需要淘汰兜底 |

## 排除翻译

- 标准属性：`<div translate="no">品牌名</div>`
- 自定义属性：`<div data-i18n-skip>不翻译</div>`

## 后端接口契约

详见设计文档 `docs/superpowers/specs/2026-07-15-i18n-runtime-design.md`「后端接口规范」一节：`POST {apiBase}/translate` 批量翻译并持久化、`GET {apiBase}/pack?lang=xx` 拉取语言包。hash 由前端本地计算并作为请求的一部分传给后端，后端只需原样存储、原样返回。
