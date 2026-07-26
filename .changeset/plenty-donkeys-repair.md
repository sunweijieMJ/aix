---
'@kit/i18n-runtime': patch
---

修复运行时翻译的 9 个缺陷，其中两类影响数据正确性：

- 空/纯空白译文不再写回 DOM（机翻返回空串会把页面文本和 placeholder 直接抹掉），统一在 PackStore 数据入口拦截；`'0'` 等合法译文不受影响
- `<textarea>` 文本内容与无 `value` 属性的 `<option>` 不再篡改表单提交值（textarea 跳过文本、保留属性翻译；option 写回前把原文固化进 `value`）
- `data-i18n-skip` / `translate="no"` 现在在三种此前失效的场景生效：挂在扫描根自身（`<body data-i18n-skip>` 整页关闭）、挂在 shadow host 上对其 shadow 内部、以及 shadow host 作为新增节点进入 DOM 时
- 同一个 shadow root 不再被重复 observe（`v-if` / `keep-alive` 反复切换会线性堆积 MutationObserver、候选成倍放大）
- `addRoot(element)` 不再静默失效：此前既不采集元素自身的属性，也扫不到它挂着的 shadow root
- `stop()` 之后在途的翻译请求返回不再改写 DOM，`stop()` 后立刻 `start()` 的场景也已隔离（新增 runId 标识运行轮次）
- `provider` / `fallbackProvider` 传入无法识别的值时 fail-fast 抛错，不再静默降级成另一个 provider 发出 URL 为 `undefined` 的请求

文档同步修正：`debounceMs` 默认值为 `50`（原文档写 `200`）、补充 `scanShadowDOM` 配置项、语言包 `version` 变化时是**合并**而非整包替换（并说明远端删除词条不会同步删除的取舍）。
