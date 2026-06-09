# @aix/ai-chat

Vue 3 AI 对话组件库。提供可组合、可扩展的 AI 对话 UI：**原子组件** + **组合预设** + **逻辑 hooks**，逻辑与 UI 解耦。

- **原子组件**：`Bubble` / `BubbleList` / `Sender` / `Welcome` / `Prompts` / `Thinking` / `MarkdownRenderer`
- **组合预设**：`AiChat`（开箱即用的整套对话界面）
- **逻辑 hooks**：`useChat` / `useXStream` / `useTypewriter` / `useAutoScroll` / `useMarkdownRenderer` / `useAiChatConfig`
- **协议无关**：`useChat` 不绑死请求实现，传入 `request` 函数 + 可选 `parseChunk`，换模型/协议只改 `parseChunk`
- **样式隔离**：`.aix-` BEM 命名空间，颜色/间距/圆角全部走 `@aix/theme` 的 `var(--aix-*)` CSS 变量
- **按需渲染**：`markdown-it` 为 `optionalDependencies` + 动态 `import`，未安装时自动降级为纯文本

## 安装

```bash
pnpm add @aix/ai-chat
# 可选：启用 Markdown 渲染（不装则降级为纯文本）
pnpm add markdown-it
```

组件样式依赖 `@aix/theme` 的 CSS 变量，使用前需引入主题样式：

```ts
import '@aix/theme/es/index.css';
```

## 快速开始

`AiChat` 组合预设内置了 `useChat` + `Welcome` + `BubbleList` + `Sender`，传入一个 `request` 即可：

```vue
<script setup lang="ts">
import { AiChat } from '@aix/ai-chat';
import '@aix/theme/es/index.css';
import type { ChatMessage } from '@aix/ai-chat';

// request 返回字节流（ReadableStream）或 Response；signal 用于中断
const request = ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
  fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages }),
    signal,
  });
</script>

<template>
  <div style="height: 600px">
    <AiChat
      :request="request"
      welcome-title="你好，我是助手"
      welcome-description="问我任何问题"
      placeholder="输入消息…"
    />
  </div>
</template>
```

`AiChat` 默认按 **SSE 事件**解析流（`streamMode: 'sse'`，空行切事件 + 解析 `event`/`data`/`id`），并以**扁平结构**预设读取 `data` 顶层 `delta` / `content`。对接 OpenAI / Anthropic 等只需换内置预设 `openaiParseChunk` / `anthropicParseChunk`，或自定义 `parseChunk`（见下文）。`AiChat` 还支持 `v-model:messages` 受控消息列表，并通过 `defineExpose` 暴露 `messages` / `isLoading` / `onSend` / `onReload` / `abort` / `setMessages`，可用模板 ref 获取。

## 全局注册（插件）

默认导出是一个 Vue 插件，`install` 时会以 **`Aix` 前缀**全局注册所有组件（具名导出本身不带前缀）：

```ts
import { createApp } from 'vue';
import AiChat from '@aix/ai-chat';
import '@aix/theme/es/index.css';

const app = createApp(App);
app.use(AiChat); // 注册 <AixBubble> <AixSender> <AixAiChat> …
```

```ts
// 按需具名导入（不带 Aix 前缀）
import { Bubble, Sender, AiChat, useChat } from '@aix/ai-chat';
```

## 组件一览

| 组件 | 说明 | 关键 props |
|------|------|-----------|
| `AiChat` | 组合预设，整套对话界面 | `request` / `parseChunk?` / `defaultMessages?` / `welcomeTitle?` / `welcomeDescription?` / `placeholder?` / `blockRenderers?`；`v-model:messages` 受控；slot `welcome-extra`/`content`/`footer` + 块插槽穿透（见「块渲染与富内容插槽穿透」） |
| `BubbleList` | 消息列表容器（virtua 虚拟滚动 + 跟随策略 + roles 映射） | `items` / `roles?` / `autoScroll?` / `shouldFollow?` / `maxHeight?` / `typing?`；slot `content` |
| `Bubble` | 单条气泡 | `content` / `role` / `status` / `placement` / `variant` / `shape` / `avatar` / `loading` / `typing` / `contentRender`；slot `avatar`/`header`/`content`/`footer` |
| `Sender` | 输入框 | `modelValue?` / `placeholder?` / `loading?` / `disabled?` / `submitType?`；emit `submit`/`cancel`/`update:modelValue`；expose `focus`/`clear` |
| `Welcome` | 欢迎/空态 | `icon?` / `title?` / `description?`；slot `icon`/`extra` |
| `Prompts` | 提示词列表 | `items`；emit `select` |
| `Thinking` | 可折叠的思考过程 | `content?` / `title?` / `expanded?`；slot 默认 |
| `MarkdownRenderer` | Markdown 渲染（缺依赖降级纯文本） | `content` |
| `Conversations` | 会话列表（可分组 + 行内重命名 + 删除） | `items` / `groupable?` / `newButtonText?`；emit `create`/`rename`/`delete` |
| `ModelSelector` | 模型下拉选择器（roving tabindex 键盘导航） | `options` / `placeholder?` / `placement?`；`v-model` 绑定选中 value |
| `AttachmentCard` | 单个附件卡（输入区预览 / 气泡回显共用） | `item` / `removable?`；emit `remove`/`retry` |

## 自定义协议 / 换模型

默认 `streamMode: 'sse'`：按 SSE 规范以**空行（`\n\n`）切事件**、解析 `event` / `data` / `id` 字段，`parseChunk` 收到结构化 `SSEChunk`（`{ event?, data, id?, retry? }`）。换模型/协议只需替换 `parseChunk` 或换内置预设：

- `flatParseChunk`（默认）：读 `data` 顶层 `delta` / `content`，识别 `[DONE]`
- `openaiParseChunk`：读 `choices[0].delta.content`，`reasoning_content` 归 reasoning 块
- `anthropicParseChunk`：**按 `event` 字段路由**（`content_block_delta` 的 text/thinking 分流、`message_stop` 结束）——SSE 事件单元让 `event` 与 `data` 正确关联

```ts
import { useChat, openaiParseChunk, createParseChunk } from '@aix/ai-chat';

// 直接用预设
const a = useChat({ request, parseChunk: openaiParseChunk });

// 或用工厂适配自定义字段名 / 结束信号
const b = useChat({
  request,
  parseChunk: createParseChunk({
    doneSignal: '<END>',
    pickDelta: (json) => (json as { text?: string }).text,
  }),
});
```

**纯文本 / ndjson 流**（非 SSE）用 `streamMode: 'line'`：按 `\n` 切行、`parseChunk` 收到原始字符串：

```ts
const c = useChat({
  request,
  streamMode: 'line',
  parseChunk: (line) => (line === 'event: end' ? { done: true } : { delta: line }),
});
```

## 进阶：自行组合原子组件

`AiChat` 是约定优先的预设，只透出常用配置。需要自定义角色样式、滚动跟随策略、重发（`onReload`）或直接管理消息（`setMessages`）时，用 `useChat` + `BubbleList` + `Sender` 自行拼装：

```vue
<script setup lang="ts">
import { BubbleList, Sender, useChat } from '@aix/ai-chat';

const { messages, isLoading, onSend, onReload, abort, setMessages } = useChat({ request });

const roles = {
  user: { placement: 'end' as const, variant: 'filled' as const },
  ai: { placement: 'start' as const, variant: 'outlined' as const },
};
</script>

<template>
  <BubbleList :items="messages" :roles="roles" max-height="500px" />
  <Sender :loading="isLoading" @submit="onSend" @cancel="abort" />
</template>
```

## 块渲染与富内容插槽穿透

一条消息的 `content` 是**有序内容块**（`ContentBlock[]`）。`Bubble` 内部用单一**块渲染器注册表**按 `block.type` 分发渲染，内置 `text` / `reasoning` / `sources` / `thought-chain` / `attachment` 五类，可通过 `blockRenderers` 扩展或覆盖（业务自定义块如选择题卡片即走此扩展点）：

```ts
// 扩展新块类型 / 覆盖内置渲染器（组件级 props.blockRenderers，或全局 provideAiChatConfig.blockRenderers）
<AiChat :request="request" :block-renderers="{ 'my-card': MyCardRenderer }" />
```

### 命名插槽穿透块内部（`<块类型>-<内部slot名>`）

某些块渲染器（如 `thought-chain`）内部组件暴露了作用域插槽（`ThoughtChain` 的 `item-content`，用于步骤内嵌检索卡片等富内容）。你**无需替换整个渲染器**，只要在顶层 `<AiChat>`（或 `<BubbleList>` / `<Bubble>`）按命名约定 `<块类型>-<内部slot名>` 提供具名插槽，框架会逐层透明转发（`AiChat → BubbleList → Bubble → 块渲染器 → 内部组件`），作用域参数原样上抛：

```vue
<AiChat :request="request" :default-messages="messages">
  <!-- 落到 thought-chain 每个步骤的 item-content，携带 { item, index } -->
  <template #thought-chain-item-content="{ item, index }">
    <MyRetrievalCard :title="item.title" :index="index" />
  </template>
</AiChat>
```

约定与边界：

- **命名规则**：消费方插槽名 = `<块类型>-<块内部 slot 名>`，如 `thought-chain-item-content`。
- **保留插槽不参与穿透**（各层自身消费）：`AiChat` 的 `welcome-extra` / `content` / `footer`、`BubbleList` 的 `content` / `footer`、`Bubble` 的 `avatar` / `header` / `content` / `footer`。其余具名插槽一律向下透传。
- **不提供则无副作用**：未提供该插槽时不会向块内部注入空插槽（例如不会让 `ThoughtChain` 误判「有正文」而强制展开步骤）。
- **扩展自有块**：自定义块渲染器若想暴露内部插槽，只需在其模板中按同样约定接收并转发（`<template v-if="$slots['<块类型>-xxx']" #xxx="sp"><slot name="<块类型>-xxx" v-bind="sp" /></template>`）。

## 组合式 hooks

| Hook | 说明 |
|------|------|
| `useChat(options)` | 消息流托管。返回 `messages` / `isLoading` / `onSend` / `onReload` / `abort` / `setMessages`。`options`: `request` / `streamMode?`（`'sse'` 默认 / `'line'`）/ `parseChunk?` / `defaultMessages?` |
| `sseStream(stream, signal?)` | 按 SSE 规范把字节流解析为结构化事件（空行切事件 + `event`/`data`/`id` 字段）的异步生成器，支持中断；`useChat` 的 `sse` 模式（默认）用它 |
| `xStream(stream, signal?)` | 将 `ReadableStream<Uint8Array>` 解码并按行（`\n`）切分的异步生成器，支持中断；`useChat` 的 `line` 模式用它 |
| `useXStream()` | `xStream` 的响应式封装：`lines` / `isStreaming` / `error` / `start` / `cancel` |
| `useTypewriter(source, options?)` | 打字机逐字渲染（保留前缀），返回 `displayed` / `stop`。已内置到 `Bubble`（见 `typing` prop），`options.enabled` 支持响应式开关 |
| `useAutoScroll(scrollEl, options?)` | 滚动状态机 + 跟随策略（own-message / new-message / streaming 三分流） |
| `loadMarkdownRenderer()` | 动态加载 `markdown-it`，未安装返回 `null`（调用方降级纯文本） |
| `useAiChatConfig()` / `provideAiChatConfig(config)` | provide/inject 全局配置 |
| `useConversations(options?)` | 多会话托管（SSOT + 可选持久化）。返回 `conversations` / `activeKey` / `active` / `activeMessages`（绑 `AiChat` 的 `v-model:messages`）/ `items`（绑 `Conversations`）/ `create` / `remove` / `rename`。配合 `localStorageConversationStorage` 持久化 |
| `useAttachments(options)` | 附件上传托管。返回 `items` / `add` / `remove` / `retry` / `clear` / `isUploading` / `drain`（取出已完成项随消息发送）。`options`: `upload` / `accept?` / `maxCount?` / `maxSize?` |
| `useVoiceInput(options)` | 语音识别输入。返回 `status` / `isSupported` / `start` / `stop` / `toggle`。缺省用浏览器 Web Speech API，可注入自定义 `recognizer` 对接讯飞/阿里云等 ASR |

### 打字机效果

打字机已内置到渲染链路：`AiChat` 默认开启（`provideAiChatConfig` 的 `enableTyping`，默认 `true`），流式更新中（`status === 'updating'`）的 AI 气泡会逐字显示，完成后立即全显。可全局关闭：

```ts
import { provideAiChatConfig } from '@aix/ai-chat';
provideAiChatConfig({ enableTyping: false });
```

单独使用 `Bubble` 时通过 `typing` prop 控制（默认 `false`）；也可直接用 `useTypewriter(source, { enabled })` 组合到自定义渲染中（`enabled` 支持响应式）。

### ⚠️ 关于扩展点（需业务侧自行接入）

- **`Thinking`**：定位为**独立工具组件**，未内置到默认气泡渲染链。展示思考过程时请显式使用 `<Thinking>`（可放进 `Bubble` 的 content slot，或作为独立块），思维链数据来源由业务决定。
- **`useXStream`（响应式封装版）**：`AiChat`/`useChat` 内部直接使用底层生成器 `xStream`，不使用这个组合式封装。它供你在自定义请求逻辑里单独使用。

## Markdown 渲染

`MarkdownRenderer` 用 `markdown-it` 把富文本解析为 **token 流**，再经自研 walker 渲染为 **Vue 节点**（而非整串 `v-html`）：

- 安装了 `markdown-it` → 渲染为富文本；未安装 → 自动降级为纯文本并控制台提示一次。
- **块级增量渲染**：按顶层块（段落/标题/代码/公式/表格…）渲染，已完成的块冻结不重渲染，流式时**新块经 `<TransitionGroup>` 淡入**（公式/代码等原子块完成时平滑出现，文字仍逐字打字机），长流式不整段重解析。
- 依赖为动态 `import`，不打进主 chunk，未使用时零额外体积。

### 数学公式（KaTeX，可选）

额外安装 KaTeX 及其 markdown-it 插件后，LaTeX 公式将渲染为排版结果（AI 在理工科场景常输出公式）。支持两套定界符：行内 `$...$` / 块级 `$$...$$`，以及 OpenAI 系常用的行内 `\(...\)` / 块级 `\[...\]`（内部归一化为 `$`/`$$` 后渲染，并自动把 KaTeX 不支持的 `align*` 修正为 `aligned`）：

```bash
pnpm add katex @vscode/markdown-it-katex
```

装好即可——**KaTeX 样式会在加载 katex 时自动注入**，无需手动引入。仅当你的打包器不支持动态 CSS import（个别 SSR / 非常规构建）时，才需在应用入口手动兜底引入一次：

```ts
import 'katex/dist/katex.min.css';
```

- 已安装 → `$...$` / `$$...$$` 渲染为公式（残缺/非法公式以提示形式呈现，不会中断整段渲染）。
- 未安装 → 公式原样保留为文本，markdown 其余部分照常渲染（与 `markdown-it` 缺失时同样的降级风格，零额外体积）。
- 流式渲染时未闭合的 `$$` 残片会被自动隐藏，闭合后再呈现为公式，避免半截裸 LaTeX 闪烁。

### 自定义 markdown 渲染器（`markdownRenderers`）

每种 markdown token（`paragraph` / `heading` / `fence` / `math_block` / `table` / …）都对应一个渲染器，可通过 `AiChat` / `MarkdownRenderer` 的 `markdownRenderers` 扩展或覆盖（优先级高于内置，与 `provideAiChatConfig.markdownRenderers` 全局配置合并）：

```vue
<script setup lang="ts">
import { h } from 'vue';
import { AiChat, type MarkdownRenderers } from '@aix/ai-chat';

// 覆盖代码块为带复制按钮的自定义组件、扩展 ```mermaid 等
const markdownRenderers: MarkdownRenderers = {
  fence: ({ token }) => h(MyCodeBlock, { code: token.content, lang: token.info }),
};
</script>

<template>
  <AiChat :request="request" :markdown-renderers="markdownRenderers" />
</template>
```

渲染器签名：`({ token, renderChildren, info }) => VNode | VNode[] | string`。`renderChildren()` 递归渲染子节点。未注册的 token 类型安全降级（容器渲染子节点、叶子渲染文本）。

### 原始 HTML（`allowHtml`，默认关闭）

默认 `allowHtml=false`：源码中的原始 HTML 标签**被转义为文本**，零 XSS 面。需要渲染后端可信的富 HTML 时，开启 `allowHtml` 并安装 `dompurify`（块级 HTML 经 DOMPurify 消毒后渲染）：

```bash
pnpm add dompurify
```

```vue
<AiChat :request="request" allow-html />
```

- 仅消毒**块级** HTML（如 `<div>`/`<details>`/`<table>`）；行内裸标签（`<b>` 等）当前丢弃保留文本。
- 安全兜底：开启 `allowHtml` 但**未安装 `dompurify` 时绝不输出未消毒 HTML**，自动降级为转义文本并告警。
- 也可经 `provideAiChatConfig({ allowHtml: true })` 全局开启（组件 `allow-html` prop 优先）。

## 主题

所有样式基于 `@aix/theme` 的语义 token CSS 变量（颜色 `--aix-color*`、间距 `--aix-padding*`/`--aix-size*`、圆角 `--aix-borderRadius*`、动效 `--aix-motionDuration*`）。切换 `@aix/theme` 的明暗主题即可联动，无需额外配置。

## 能力范围

已实现：上述原子组件、组合预设与逻辑 hooks，以及**会话列表**（`Conversations` + `useConversations`，含 localStorage 持久化）、**附件上传**（`useAttachments` + `AttachmentsPanel`/`AttachmentCard`）、**语音输入**（`useVoiceInput`，可对接自定义 ASR）、**模型切换**（`ModelSelector`）、**Mermaid 流程图**（装 `mermaid` 后 ` ```mermaid ` 代码块自动渲染，未装则维持代码块）。

**暂未包含**：结构化输入（SlotConfig）、富文本 @ 提及、多 Provider class 等，后续版本迭代。
