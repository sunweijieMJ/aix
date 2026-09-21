---
'@aix/rich-text-editor': major
'@aix/pdf-viewer': major
'@aix/ai-chat': major
'@aix/audio': patch
---

统一语言包导出命名，并修掉几处 SSR 与样式加载缺陷。

- **语言包导出改名（破坏性）**：三个包的语言包导出对齐 `menu` / `button` / `flow-graph` 的命名，
  统一为「包名前缀 + Locale / ZhCN / EnUS」
  - `@aix/rich-text-editor`：原先经 `export *` 导出的裸 `locale` / `zhCN` / `enUS`
    改为 `richTextEditorLocale` / `richTextEditorZhCN` / `richTextEditorEnUS`
  - `@aix/pdf-viewer`：裸 `locale` 改为 `pdfViewerLocale`，并新增导出 `pdfViewerZhCN` / `pdfViewerEnUS`
  - `@aix/ai-chat`：裸 `zhCN` / `enUS` 改为 `aiChatZhCN` / `aiChatEnUS`（`aiChatLocale` 不变）
  - `createLocale` 的切片名（`'rich-text-editor'` / `'pdf-viewer'` / `'ai-chat'`）不变
- **`@aix/pdf-viewer` 的 `contextMenu` 事件补第二个参数**（破坏性：签名变化，单参数写法仍可用）：
  点击菜单项时一并给出被点击的 `ContextMenuItem`，业务侧据此实现复制、下载等动作
- **`@aix/pdf-viewer` 新增 `config.workerSrc`**：pdf.js worker 默认取 jsDelivr CDN，内网部署可指向自托管副本
- **`@aix/ai-chat` 修复 KaTeX 与 highlight.js 主题样式加载失败**：打包器对动态导入的纯 CSS 只产出指向空
  chunk 的引用，运行时 404、样式静默丢失；改为经 JS 壳模块加载，构建产物里样式随 chunk 正常注入
- **SSR 安全**：`@aix/audio` 的 `BrowserTTS` / `BrowserASR` 不再在构造函数里读 `window`，
  `WaveformCanvas` 的设备像素比改为挂载后读取——服务端渲染不再因此整页失败
