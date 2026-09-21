# @aix/ai-chat

## 0.0.29

### Patch Changes

- 266d161: 统一语言包导出命名，并修掉几处 SSR 与样式加载缺陷。
  
  - **语言包导出改名**：破坏性改动，但多语言尚无业务方使用，故按 patch 发布。三个包的语言包导出对齐 `menu` / `button` / `flow-graph` 的命名，
    统一为「包名前缀 + Locale / ZhCN / EnUS」
    - `@aix/rich-text-editor`：原先经 `export *` 导出的裸 `locale` / `zhCN` / `enUS`
      改为 `richTextEditorLocale` / `richTextEditorZhCN` / `richTextEditorEnUS`
    - `@aix/pdf-viewer`：裸 `locale` 改为 `pdfViewerLocale`，并新增导出 `pdfViewerZhCN` / `pdfViewerEnUS`
    - `@aix/ai-chat`：裸 `zhCN` / `enUS` 改为 `aiChatZhCN` / `aiChatEnUS`（`aiChatLocale` 不变）
    - `createLocale` 的切片名（`'rich-text-editor'` / `'pdf-viewer'` / `'ai-chat'`）不变
  - **`@aix/pdf-viewer` 的 `contextMenu` 事件补第二个参数**（签名变化，原来的单参数写法仍可用）：
    点击菜单项时一并给出被点击的 `ContextMenuItem`，业务侧据此实现复制、下载等动作
  - **`@aix/pdf-viewer` 新增 `config.workerSrc`**：pdf.js worker 默认取 jsDelivr CDN，内网部署可指向自托管副本
  - **`@aix/ai-chat` 修复 KaTeX 与 highlight.js 主题样式加载失败**：打包器对动态导入的纯 CSS 只产出指向空
    chunk 的引用，运行时 404、样式静默丢失；改为经 JS 壳模块加载，构建产物里样式随 chunk 正常注入
  - **SSR 安全**：`@aix/audio` 的 `BrowserTTS` / `BrowserASR` 不再在构造函数里读 `window`，
    `WaveformCanvas` 的设备像素比改为挂载后读取——服务端渲染不再因此整页失败

## 0.0.28

### Patch Changes

- Updated dependencies [018e4a2]
  - @aix/popper@0.0.10

## 0.0.27

### Patch Changes

- 统一升级，优化打包产物
- Updated dependencies
  - @aix/hooks@0.0.5
  - @aix/icons@0.0.3
  - @aix/popper@0.0.9
  - @aix/theme@0.0.4

## 0.0.26

### Patch Changes

- Updated dependencies
  - @aix/hooks@0.0.4
  - @aix/popper@0.0.8

## 0.0.25

### Patch Changes

- 增强定制化能力

## 0.0.24

### Patch Changes

- 优化增强自定义能力

## 0.0.23

### Patch Changes

- 优化边界问题

## 0.0.22

### Patch Changes

- 内容块类型注册表

## 0.0.21

### Patch Changes

- BubbleAction

## 0.0.20

### Patch Changes

- 优化修复bug

## 0.0.19

### Patch Changes

- 优化边界问题

## 0.0.18

### Patch Changes

- 优化中断生成，复制

## 0.0.17

### Patch Changes

- 默认滚动及失焦问题

## 0.0.16

### Patch Changes

- 监听滚动到底部

## 0.0.15

### Patch Changes

- 修改默认配置

## 0.0.14

### Patch Changes

- 插槽问题

## 0.0.13

### Patch Changes

- footer渲染

## 0.0.12

### Patch Changes

- 优化修复bug

## 0.0.11

### Patch Changes

- 增加image类型，增强图表

## 0.0.10

### Patch Changes

- 增加骨架效果

## 0.0.9

### Patch Changes

- 新增html预览、会话搜索

## 0.0.8

### Patch Changes

- 增加思考耗时

## 0.0.7

### Patch Changes

- 增强send配置功能

## 0.0.6

### Patch Changes

- 增强优化Send组件

## 0.0.5

### Patch Changes

- 增强ai-chat组件

## 0.0.4

### Patch Changes

- 重渲染

## 0.0.3

### Patch Changes

- Updated dependencies
  - @aix/hooks@0.0.3
  - @aix/theme@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @aix/hooks@0.0.2
  - @aix/theme@0.0.2
  - @aix/icons@0.0.2

## 0.0.1

### Patch Changes

- 首次发包
