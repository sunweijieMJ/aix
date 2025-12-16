# @aix/chat-ui

AI 聊天 UI 渲染组件库，提供可扩展的插件化内容渲染系统。

## 特性

- **插件化架构** - 按需加载渲染器，减少打包体积
- **内置渲染器** - 支持 Markdown、代码高亮、LaTeX 公式、ECharts 图表、Mermaid 流程图
- **流式渲染** - 支持打字动画效果，适配 AI 流式输出
- **主题支持** - 深浅主题切换，CSS 变量可定制
- **TypeScript** - 完整的类型定义

## 安装

```bash
pnpm add @aix/chat-ui
```

### Peer 依赖

核心依赖：
```bash
pnpm add vue@^3.5.0
```

可选依赖（按需安装）：
```bash
# 代码高亮
pnpm add shiki@^1.0.0

# LaTeX 公式
pnpm add katex@^0.16.0

# 图表
pnpm add echarts@^5.5.0

# 流程图
pnpm add mermaid@^11.0.0

# 图标（推荐）
pnpm add @aix/icons

# 主题变量（推荐）
pnpm add @aix/theme
```

## 快速开始

```vue
<script setup lang="ts">
import { ContentRenderer } from '@aix/chat-ui';

const content = `
# Hello World

这是一段 **Markdown** 内容。

\`\`\`typescript
const greeting = 'Hello, AI!';
console.log(greeting);
\`\`\`
`;
</script>

<template>
  <ContentRenderer :content="content" />
</template>
```

## 核心组件

### ContentRenderer

智能内容渲染组件，自动检测内容类型并选择合适的渲染器。

```vue
<ContentRenderer
  :content="content"
  :type="'markdown'"
  :streaming="true"
  :theme="'light'"
  @action="handleAction"
  @rendered="handleRendered"
  @error="handleError"
/>
```

**Props**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| content | `string` | 必填 | 原始内容 |
| type | `string` | - | 强制指定内容类型 |
| streaming | `boolean \| StreamingConfig` | `false` | 流式渲染配置 |
| theme | `'light' \| 'dark' \| 'auto'` | `'light'` | 主题 |
| className | `string` | - | 自定义样式类 |
| style | `CSSProperties` | - | 自定义样式 |
| parser | `Function` | - | 自定义解析器 |

**Events**

| 事件 | 参数 | 说明 |
|------|------|------|
| action | `{ blockId, action, data }` | 用户操作事件（如复制代码） |
| rendered | `ContentBlock[]` | 渲染完成 |
| error | `Error` | 渲染错误 |

### AnimationText

打字动画文本组件。

```vue
<AnimationText
  :text="content"
  :speed="30"
  :enabled="true"
/>
```

## 插件系统

### 预设集合

```typescript
import {
  basicPlugins,     // text, markdown
  standardPlugins,  // + code, latex
  fullPlugins,      // + chart
  installPlugins,
} from '@aix/chat-ui';

// 安装完整插件集
installPlugins(fullPlugins);
```

### 自定义插件预设

```typescript
import { createPluginPreset, chartPlugin } from '@aix/chat-ui';

// 基于 standard 预设，排除 latex，添加 chart
const myPlugins = createPluginPreset('standard', {
  exclude: ['latex'],
  extra: [chartPlugin],
});

installPlugins(myPlugins);
```

### 创建自定义渲染器

```typescript
import { createPlugin, installPlugin } from '@aix/chat-ui';
import MyRenderer from './MyRenderer.vue';

const myPlugin = createPlugin('my-renderer', {
  name: 'my-renderer',
  type: 'custom-type',
  component: MyRenderer,
  detector: (raw) => raw.startsWith(':::custom'),
  parser: (raw) => ({ parsed: raw }),
});

installPlugin(myPlugin);
```

## 内置渲染器

| 渲染器 | 类型 | 说明 | 依赖 |
|--------|------|------|------|
| text | `text` | 纯文本 | - |
| markdown | `markdown` | Markdown 渲染 | marked, dompurify |
| code | `code` | 代码高亮 | shiki (可选) |
| latex | `latex` | LaTeX 公式 | katex (可选) |
| chart | `chart` | ECharts 图表 | echarts (可选) |
| mermaid | `mermaid` | 流程图 | mermaid (可选) |

## Composables

### useContentRenderer

内容渲染 Hook。

```typescript
import { useContentRenderer } from '@aix/chat-ui';

const { blocks, loading, error, isMultiBlock } = useContentRenderer(
  contentRef,
  { type: 'markdown' }
);
```

### useTyping

打字动画 Hook。

```typescript
import { useTyping } from '@aix/chat-ui';

const { displayText, isTyping, start, stop } = useTyping(fullText, {
  speed: 30,
  enabled: true,
});
```

### useStreaming

流式渲染 Hook。

```typescript
import { useStreaming } from '@aix/chat-ui';

const { content, status, append, complete, reset } = useStreaming();

// 追加内容
append('Hello ');
append('World!');

// 完成流式
complete();
```

## 工具函数

```typescript
import {
  // 内容类型检测
  detectContentType,
  isLatex,
  isChartJson,
  isMermaid,
  isCodeBlock,
  isMarkdown,

  // 流式处理
  detectUnclosedTags,
  isCodeBlockUnclosed,
  autoCloseCodeBlock,
  getStreamStatus,

  // 其他
  generateId,
  sanitizeHtml,
} from '@aix/chat-ui';
```

## CSS 变量

组件使用 CSS 变量实现主题定制，优先读取 `@aix/theme` 提供的变量：

```css
:root {
  /* 色彩 */
  --aix-primary: var(--colorPrimary, #00a2ae);
  --aix-error: var(--colorError, #ff4d4f);
  --aix-link: var(--colorLink, #00a2ae);

  /* 背景 */
  --aix-bg-container: var(--colorBgContainer, #fff);
  --aix-bg-subtle: var(--colorBgLayout, #f5f5f5);

  /* 文本 */
  --aix-text-primary: var(--colorText, rgba(0, 0, 0, 0.88));
  --aix-text-secondary: var(--colorTextSecondary, rgba(0, 0, 0, 0.65));

  /* 边框 */
  --aix-border: var(--colorBorder, #d9d9d9);

  /* 间距 */
  --aix-space-1: var(--paddingXXS, 4px);
  --aix-space-2: var(--paddingXS, 8px);
  --aix-space-3: var(--paddingSM, 12px);
  --aix-space-4: var(--padding, 16px);

  /* 圆角 */
  --aix-radius-sm: var(--borderRadiusSM, 4px);
  --aix-radius-md: var(--borderRadius, 6px);
  --aix-radius-lg: var(--borderRadiusLG, 8px);
}
```

暗色主题通过 `[data-theme="dark"]` 或 `.dark` 类自动切换。

## TypeScript

```typescript
import type {
  // 内容类型
  ContentType,
  ContentBlock,
  ContentBlockStatus,

  // 渲染器
  RendererDefinition,
  RendererProps,
  RendererEmits,
  RendererActionEvent,

  // 流式
  StreamStatus,
  StreamingConfig,
  TypingAnimationConfig,

  // 主题
  ThemeType,
  ThemeConfig,

  // 插件
  ChatUIPlugin,
  PluginInstallOptions,
} from '@aix/chat-ui';
```

## License

MIT
