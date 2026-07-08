# @aix/ai-chat

Vue 3 AI 对话组件库。提供可组合、可扩展的 AI 对话 UI：**原子组件** + **组合预设** + **逻辑 hooks**，逻辑与 UI 解耦。

- **原子组件**：`Bubble` / `BubbleList` / `Sender` / `Welcome` / `Prompts` / `Thinking` / `MarkdownRenderer`
- **组合预设**：`AiChat`（开箱即用的整套对话界面）
- **逻辑 hooks**：`useChat` / `useXStream` / `useTypewriter` / `useAutoScroll` / `useConversations` / `useAttachments` / `useVoiceInput`（ASR 语音输入）/ `useSpeech`（TTS 语音播报）/ `useAiChatConfig`
- **协议无关**：`useChat` 不绑死请求实现，传入 `request` 函数 + 可选 `parseChunk`，换模型/协议只改 `parseChunk`
- **样式隔离**：`.aix-` BEM 命名空间，颜色/间距/圆角全部走 `@aix/theme` 的 `var(--aix-*)` CSS 变量
- **按需加载**：Markdown 渲染相关依赖随包自动安装、运行时动态 `import` 渐进加载——未用到的能力不进入首屏（`mermaid` 仅在 mermaid 围栏、`echarts` 仅在 ` ```chart ` 围栏 / 结构化图表块出现时才加载）；个别环境安装失败时对应能力自动降级，不阻断安装

## 安装

```bash
pnpm add @aix/ai-chat
```

Markdown 渲染的六个增强依赖（`markdown-it` / `highlight.js` / `katex` / `@vscode/markdown-it-katex` / `mermaid` / `echarts`）声明为 `optionalDependencies`，pnpm/npm 会**随包自动安装、开箱即用**，无需手动添加；运行时按需动态加载（详见下文「Markdown 渲染」），个别环境某项安装失败时仅该项能力静默降级（如 `markdown-it` 缺失 → 纯文本），不阻断安装、互不连累。

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

`AiChat` 默认按 **SSE 事件**解析流（`streamMode: 'sse'`，空行切事件 + 解析 `event`/`data`/`id`），并以**扁平结构**预设读取 `data` 顶层 `delta` / `content`。对接 OpenAI / Anthropic 等只需换内置预设 `openaiParseChunk` / `anthropicParseChunk`，或自定义 `parseChunk`（见下文）。`AiChat` 还支持 `v-model:messages` 受控消息列表，并通过 `defineExpose` 暴露 `messages` / `isLoading` / `onSend` / `onReload` / `abort` / `setMessages` / `updateBlock` / `resume`（工具调用 HITL 续流，见「工具调用（tool_use）」），以及透传 Sender 的 `focus` / `clear`，可用模板 ref 获取。

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
| `AiChat` | 组合预设，整套对话界面 | `request` / `parseChunk?` / `defaultMessages?` / `welcomeTitle?` / `welcomeDescription?` / `placeholder?` / `blockRenderers?` / `toolRenderers?`（工具调用按 toolName 路由）/ `voice?`（ASR 语音输入）/ `speech?`（TTS 语音播报）/ `triggers?`（@提及/斜杠命令触发菜单，见「触发菜单」）/ `suggestions?`（追问建议，见「追问建议」）；`v-model:messages` 受控；emit `send`/`finish`/`error`/`abort`/`copy`/`edit`/`feedback`/`block-action`/`typing-complete`/`suggestion-select`；slot `header`/`header-icon`/`header-extra`/`welcome-icon`/`welcome-title`/`welcome-description`/`welcome-extra`/`content`/`footer` + 块插槽穿透（见「块渲染与富内容插槽穿透」） |
| `BubbleList` | 消息列表容器（virtua 虚拟滚动 + 跟随策略 + roles 映射） | `items` / `roles?` / `autoScroll?` / `shouldFollow?` / `maxHeight?` / `typing?` / `blockRenderers?` / `toolRenderers?`；slot `content` |
| `Bubble` | 单条气泡 | `content` / `role` / `status` / `placement` / `variant` / `shape` / `avatar` / `loading` / `typing` / `contentRender` / `blockRenderers?` / `toolRenderers?`；slot `avatar`/`header`/`content`/`footer` |
| `Sender` | 输入框 | `modelValue?` / `placeholder?` / `loading?` / `disabled?` / `submitType?` / `attachments?` / `voice?`（ASR 语音输入）/ `triggers?`（@提及/斜杠命令触发菜单）；emit `submit`（第三参 `meta?: SubmitMeta` 携带 mention 实体，见「触发菜单」）/`cancel`/`update:modelValue`；expose `focus`/`clear`/`setValue`；作用域插槽 `prefix`/`header`/`toolbar`/`footer` 回传 `{ send, cancel, clear, loading, disabled, recording, value }`（见「Sender 工具栏作用域插槽」） |
| `Welcome` | 欢迎/空态 | `icon?` / `title?` / `description?`；slot `icon`/`extra` |
| `Prompts` | 提示词列表 | `items`；emit `select` |
| `Thinking` | 可折叠的思考过程 | `content?` / `title?` / `expanded?`；slot 默认 |
| `MarkdownRenderer` | Markdown 渲染（缺依赖降级纯文本） | `content` / `streaming?`（流式防闪烁整修）/ `markdownRenderers?` / `allowHtml?` / `mdPlugins?`（注入 markdown-it 插件） |
| `Conversations` | 会话列表（可分组 + 行内重命名 + 删除） | `items` / `groupable?` / `newButtonText?`；`v-model:activeKey` 受控选中；emit `create`/`rename`/`delete` |
| `ModelSelector` | 模型下拉选择器（roving tabindex 键盘导航） | `options` / `placeholder?` / `placement?`；`v-model` 绑定选中 value |
| `AttachmentCard` | 单个附件卡（输入区预览 / 气泡回显共用） | `item` / `removable?`；emit `remove`/`retry` |
| `Suggestions` | 追问建议 chips（可独立使用，也内置于 `AiChat`） | `items: SuggestionItem[]`；emit `select`；slot 默认（覆盖单项文案渲染） |
| `TriggerMenu` | 触发菜单受控展示层（Sender 内置使用；导出供自定义触发 UI 复用） | `items` / `loading` / `activeIndex` / `menuId` / `getAnchorRect` |

## 自定义协议 / 换模型

默认 `streamMode: 'sse'`：按 SSE 规范以**空行（`\n\n`）切事件**、解析 `event` / `data` / `id` 字段，`parseChunk` 收到结构化 `SSEChunk`（`{ event?, data, id?, retry? }`）。换模型/协议只需替换 `parseChunk` 或换内置预设：

- `flatParseChunk`（默认）：读 `data` 顶层 `delta` / `content`，识别 `[DONE]`
- `openaiParseChunk`：读 `choices[0].delta.content`，`reasoning_content` 归 reasoning 块，`delta.tool_calls` 归工具事件
- `anthropicParseChunk`：**按 `event` 字段路由**（`content_block_delta` 的 text/thinking 分流、`tool_use` 块的 start/`input_json_delta`/stop、`message_stop` 结束）——SSE 事件单元让 `event` 与 `data` 正确关联
- 三个预设均已支持工具调用解析（`tool_use` 块），自定义后端可用 `createParseChunk({ pickTool })` 接入——详见「工具调用（tool_use）」

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

### 便利工厂：`createOpenAIRequest`（可选）

`request` 完全由你掌控以保证**协议无关**，但对接 OpenAI 兼容后端（OpenAI / DeepSeek / 通义等）时，可用 `createOpenAIRequest` 便利工厂免去手写 fetch——传 `baseURL` / `model` / `apiKey` 即得到符合 `request` 签名的流式请求函数（自动拼 `/chat/completions`、注入 `Authorization: Bearer`、置 `stream:true`，并把 `ChatMessage[]` 映射为 OpenAI `messages`），配合内置 `openaiParseChunk` 使用：

```ts
import { useChat, createOpenAIRequest, openaiParseChunk } from '@aix/ai-chat';

const chat = useChat({
  request: createOpenAIRequest({ baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', apiKey }),
  parseChunk: openaiParseChunk,
});
```

> ⚠️ 浏览器端直连会暴露 `apiKey`，仅适用于本地调试 / 受信内网；生产请走自有后端代理（此时仍自行实现 `request` 指向代理即可）。可传 `headers` 追加鉴权头、`transformMessages` 自定义消息映射、以及 `temperature` 等任意 OpenAI 兼容参数。

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

### Sender 工具栏作用域插槽（自定义动作按钮）

`Sender` 的 `prefix` / `header` / `toolbar` / `footer` 插槽都是**作用域插槽**，回传动作句柄与受控状态 `SenderSlotScope`：`{ send, cancel, clear, loading, disabled, recording, value }`。业务可在官方发送/停止键旁加自定义按钮（模型选择、联网开关、深度思考开关等）并**复用发送/停止/清空逻辑与 loading 态**，无需自己实现：

```vue
<Sender placeholder="输入消息…" @submit="onSend">
  <template #toolbar="{ send, clear, loading, value }">
    <button @click="webSearch = !webSearch">🌐 联网</button>
    <span style="flex:1" />
    <button :disabled="!value" @click="clear">清空</button>
    <button :disabled="loading || !value" @click="send">发送</button>
  </template>
</Sender>
```

> `send()` 复用了点击发送键的全部守卫（loading / disabled / 上传中 / 空内容时不发）；`cancel()` 等价 loading 态点停止键。

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
- **保留插槽不参与穿透**（各层自身消费）：`AiChat` 的 `header` / `header-icon` / `header-extra` / `welcome-icon` / `welcome-title` / `welcome-description` / `welcome-extra` / `content` / `footer`、`BubbleList` 的 `content` / `footer`、`Bubble` 的 `avatar` / `header` / `content` / `footer`。其余具名插槽一律向下透传——为自定义块起名时避免与上述保留名冲突。
- **不提供则无副作用**：未提供该插槽时不会向块内部注入空插槽（例如不会让 `ThoughtChain` 误判「有正文」而强制展开步骤）。
- **扩展自有块**：自定义块渲染器若想暴露内部插槽，只需在其模板中按同样约定接收并转发（`<template v-if="$slots['<块类型>-xxx']" #xxx="sp"><slot name="<块类型>-xxx" v-bind="sp" /></template>`）。

## 工具调用（tool_use）

面向「**后端跑 agentic 循环**」的部署形态：前端一次 AI 回复里会陆续收到 `text` / `reasoning` / `tool_use` / `tool_result` 混合的连续流，组件负责**解析、装配、渲染、承载交互**（前端不执行工具、不自驱循环）。工具调用是消息 `content` 里的一等公民块 `tool_use`（内置渲染器 `ToolUseBlock`，可折叠卡片），随对话树持久化、刷新/切会话完整还原。

### 数据模型

`tool_use` 块把「调用 + 结果」合并进同一个块（后端已完成 `toolCallId ↔ tool_result` 配对）：

```ts
{ id, type: 'tool_use';
  toolCallId: string;   // 协议侧调用 id（toolu_xxx / call_xxx）：配对结果、并行去重、resume 关联
  toolName: string;     // 工具名：toolRenderers 按它路由
  state: ToolUseState;  // input-streaming | input-available | awaiting-approval | executing | output-available | output-error
  argsText?: string;    // 流式拼参时的原始未闭合 JSON（展示用，parse 失败不影响）
  input?: unknown;      // 参数对象（整体给时直接落 / 流式拼参齐全后解析出）
  output?: unknown;     // 工具结果（字符串或结构化对象）
  errorText?: string;  }
```

`awaiting-approval` / `executing` 为前端执行/审批（Layer 2）预留，本期数据模型留形、行为不依赖。

### 协议接入：`parseChunk` 产出工具增量

内置预设已支持工具解析，`parseChunk` 保持**纯翻译**，跨事件累积由内部纯 reducer 完成：

- `anthropicParseChunk`：`content_block_start`(tool_use) → 建块；`input_json_delta` → 拼参分片；`content_block_stop` → 参数结束。
- `openaiParseChunk`：`delta.tool_calls[i]` → 拼参；`finish_reason:'tool_calls'` → 参数结束（多并行工具收尾建议由后端显式事件驱动，见下方限制）。
- **自定义后端**：`createParseChunk({ pickTool })` 传一个 `(json) => ToolEventDelta | undefined`，或自行在 `parseChunk` 里返回 `{ tool }`。「请求含参先到、结果后到」的后端直接映射：工具请求 → `{ index, toolCallId, toolName, input }`、工具结果 → `{ index, toolCallId, output }`（结果事件**须带 `toolCallId`** 以支持跨请求/续流命中已建的块）。

`parseChunk` 可返回**单个** `ParsedChunk` 或**数组**（一个流事件表达多件事，如 text + tool 同帧），内部统一归一，旧的单对象返回照常工作。装配纯函数 `applyToolEvent` / 类型 `ToolReduceCtx` 也对外导出，供完全自定义的流水线复用。

### 按 toolName 路由自定义渲染器：`toolRenderers`

与 `blockRenderers`（按 `block.type`）平行的一层注册表（按 `toolName`）。`ToolUseBlock` 命中 `toolRenderers[toolName]` 则整块委托、未命中落默认可折叠卡片。合并优先级同 `blockRenderers`：全局 `provideAiChatConfig.toolRenderers` < 组件 `props.toolRenderers`。

```vue
<script setup lang="ts">
import { markRaw } from 'vue';
import { AiChat } from '@aix/ai-chat';
import QuizCard from './QuizCard.vue'; // 拿到 { block, info, onBlockAction }，用 block.output 渲染业务卡片
const toolRenderers = { generate_quiz: markRaw(QuizCard) };
</script>

<template>
  <AiChat :request="request" :parse-chunk="parseChunk" :tool-renderers="toolRenderers" />
</template>
```

自定义渲染器拿到完整 `tool_use` 块（`input`/`output`/`state`）+ `info` + `onBlockAction`，学生作答等交互经 `onBlockAction({ blockId, type, patch })` 回写——与既有交互块同一套管线（`AiChat` 内部先 `updateBlock` 命中才向上 emit `block-action`）。

### 人工确认（HITL）+ `resume` 续流

组件不内置确认表单 schema，只提供 `resume` 一个原语：**向已存在的 AI 消息续写，不新建节点**。适用于「后端在确认点关流①、前端确认后带续跑参数重发流②、接着写同一条 AI 消息」的**分段流**后端。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AiChat, type BlockActionPayload } from '@aix/ai-chat';
const chatRef = ref<InstanceType<typeof AiChat>>();

// 用户在确认块作答 → onBlockAction 上抛 → 按 messageKey 续流（payload 由业务与后端约定：traceId / 上次事件 id / 用户填写内容等）
const onBlockAction = (p: BlockActionPayload) => {
  chatRef.value?.resume(String(p.messageKey), { approved: p.action.type === 'approve' });
};
</script>

<template>
  <AiChat ref="chatRef" :request="request" :parse-chunk="parseChunk"
    :tool-renderers="toolRenderers" @block-action="onBlockAction" />
</template>
```

`request` 的 ctx 会带 `resume` 载荷（fresh 请求恒为 `undefined`），业务据此改打续跑接口：`request: ({ messages, signal, resume }) => resume ? postResume(resume) : postFresh(...)`。

约束与语义：

- **单写者不变量**：`resume` 靠 `isLoading===false` 守卫，只可能在上一段流完全落定后启动，两段请求永不并发写同一条消息；`isLoading` 时 / id 未命中 / 非 AI 消息 → 返回 `false` 且不做任何改动。
- **仅分段流需要**：确认期间不关流的「单条长流」后端全程 `isLoading=true`，工具块经内部装配持续更新，用不上也不能用 `resume`。
- **`onFinish` 按流段触发**（含每次 `resume` 段完成），**≠「整个 AI 回合结束」**。需要区分「最终完成 vs 段完成」的业务应以后端自身 done 语义判定。

### 跨轮历史序列化（可选）

仅当后端**无状态、每轮回传完整历史**时需要：`createOpenAIRequest` 的默认 `transformMessages` 会把历史里的 tool_use 块还原成 `tool_calls` + `role:'tool'` 消息（顺序 `assistant(tool_calls) → tool → tool`）。若后端按会话 id 自存历史（前端只送新用户消息），无需关心。

> ⚠️ 若历史里含**尚未产出结果**（`output == null`）的 tool_use（如中断在工具执行前的回合），默认序列化会生成有 `tool_calls` 却无配对 `role:'tool'` 的 assistant 消息，OpenAI 会报错——此形态请自定义 `transformMessages` 跳过未完成回合。

### 已知限制（设计权衡）

- **OpenAI 并行工具收尾**：`openaiParseChunk` 从 `finish_reason:'tool_calls'` 无法精确给出各 index，仅对 index 0 发参数结束信号；多并行工具请由后端显式事件驱动收尾，或改用带 `.done` 语义的 Responses API 事件自定义 `parseChunk`。
- **超大 output 持久化**：默认全量随树持久化，超大结果需业务侧截断/omit，避免撑爆 localStorage。

## 触发菜单（@提及 / 斜杠命令）

`Sender`（及透传的 `AiChat`）的 `triggers` prop（opt-in）：按字符触发的候选菜单，用于 @提及协作者、/ 斜杠命令等场景。视为静态配置（setup 快照），运行时切换不生效，与 `attachments`/`voice` 同约定。

### 配置：`TriggerConfig` / `TriggerItem`

```ts
import type { TriggerConfig } from '@aix/ai-chat';

const triggers: TriggerConfig[] = [
  // @ 提及：items 传数组走本地过滤，传函数走同步/异步搜索（Promise 期间菜单展示 loading 态）
  {
    char: '@',
    items: async (query) => {
      const list = await searchMembers(query);
      return list.map((m) => ({ value: m.id, label: m.name, icon: m.avatar, description: m.title }));
    },
  },
  // / 斜杠命令：insertText 回填文本 / onSelect 命令式行为，二者可并存
  {
    char: '/',
    items: [
      { value: 'translate', label: '/翻译', insertText: '请翻译：' },
      { value: 'clear', label: '/清空', onSelect: ({ clear }) => clear() },
    ],
  },
];
```

```vue
<AiChat :request="request" :triggers="triggers" @send="onSend" />
```

- **候选来源**：`items` 为数组时按 `label` / `value` 对检索词做忽略大小写的本地过滤；为函数时同步/异步均可——异步期间菜单展示 loading 态，检索词变化时用竞态令牌丢弃过期结果，加载失败静默关闭菜单并 console.warn 一次。
- **回填规则**：选中项最终插入串 = `(keepTrigger ? 触发字符 : '') + (insertText ?? 缺省值)`；`insertText` 缺省值 `'@'` → `` `${label} ` ``、其余触发字符 → `''`（等价「仅清除已键入的触发段」）；`keepTrigger` 缺省 `'@'` → `true`、其余 → `false`。`onSelect` 可与 `insertText` 并存，用于命令式副作用（清空输入、打开弹窗等），回调拿到 `{ item, trigger, query, clear, setValue }`。
- **触发位置（`position`）**：缺省规则 `'@'` → `'anywhere'`（要求触发字符前一字符是空白或行首，防邮箱地址误触）、其余字符（含 `'/'`）→ `'start'`——**仅行首触发**，正文中键入不弹菜单；可显式传 `position` 覆盖缺省。
- **重复 `char`**：同一 `char` 在 `triggers` 数组中出现多次，后者覆盖前者，并在开发环境 console.warn 一次。

### `meta.mentions` 契约

`@` 触发选中的候选会记录为 mention 实体，随消息一并提交：`Sender` 的 `submit` 事件与 `AiChat` 的 `send` 事件都新增第三个可选参数 `meta?: SubmitMeta`（`{ mentions?: MentionEntity[] }`，`MentionEntity = { value, label, trigger }`）：

```ts
const onSend = (text: string, attachments?: AttachmentItem[], meta?: SubmitMeta) => {
  meta?.mentions?.forEach((m) => console.log(m.trigger, m.value, m.label));
};
```

- **提交文本经 `trim()`**：若 mention 位于文本末尾，回填时自动追加的尾随空格**不会**保留在提交文本里；`meta.mentions` 不受影响——即便可见文本（回填瞬间的输入框内容）与提交文本相差一个尾随空格，mention 实体仍完整随 `meta` 上抛。
- **配额校验**：mention 按「文本中完整出现次数」计数，手动删改/重复文本时超额条目按选中顺序先进先出保留、后进先出丢弃。
- **整体删除**：光标（无选区）恰在完整 mention token 末尾时，Backspace 整体删除该 token（含自动追加的尾随空格），而非逐字符删除。

### 已知权衡：textarea 路线无 token 高亮

`Sender` 仍是原生 `<textarea>`，mention token（如 `@张三`）以**纯文本**形式存在于输入框内，不做富文本高亮 / 不可编辑整体。已知影响与缓解：

- 用户可以把光标插入 token 中间手动编辑，破坏 token 完整性——配额校验按「完整出现次数」计数，被破坏的 token 自然不再计入 `meta.mentions`。
- 光标在完整 token 末尾按 Backspace 会整体删除该 token（含尾随空格），缓解逐字删除产生半截 token 的体验问题。
- 如需真正的富文本 @ 提及（不可拆分拖拽的 token、高亮着色等），需业务自行实现富文本编辑器替换 `Sender`，本包当前不提供该形态（见「能力范围」）。

## 追问建议（Follow-up Suggestions）

`AiChat` 的 `suggestions` prop（opt-in）：`true` 为全默认，或传对象 `{ fillOnly?, max? }` 细配。展示为消息列表下方、输入框上方的 chips，点击可发送或回填。

### 双通道

- **通道②（持久化）**：`parseChunk` 返回的 `suggestions` 字段（`Array<string | SuggestionItem>`）随任意帧下发，收到即整体覆盖写入该条 AI 消息（后到覆盖先到，含 resume 分段流），随对话树持久化，刷新 / 切会话可还原。

```ts
// parseChunk 收尾帧携带 suggestions（字符串条目会被内部 normalizeSuggestions 归一为 { text }）
const parseChunk = (chunk): ParsedChunk => ({ ...parseDelta(chunk), suggestions: chunk.suggestions });
```

- **通道①（临时）**：`AiChat` 通过 `defineExpose` 暴露 `setSuggestions(items)`，命令式立即展示，不持久化、发送即清（含点击建议本身触发的发送）、优先于通道②。

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AiChat } from '@aix/ai-chat';
const chatRef = ref<InstanceType<typeof AiChat>>();
chatRef.value?.setSuggestions(['能再展开讲讲吗？', '有相关文档吗？']);
</script>
<template><AiChat ref="chatRef" :request="request" suggestions /></template>
```

### 展示规则

- 仅取**最后一条 AI 消息**的建议（通道②）或临时建议（通道①，优先级更高）。
- `isLoading` 期间抑制：流式回复进行中不展示建议，避免遮挡打字机；流结束后出现。
- 发送后立即清空（含点击建议本身触发的发送）；通道①临时建议同样被清除。

### `fillOnly` / `max`

- `fillOnly`（默认 `false`）：点击建议默认直接发送；设为 `true` 后点击只把文本回填进输入框，交由用户编辑后再手动发送。
- `max`（默认 `5`）：可见建议条数上限，超出部分仅在展示层截断（不影响已持久化的完整列表）。
- 独立使用 `Suggestions` 组件（脱离 `AiChat`）时无 `fillOnly` / `max` 语义，纯受控展示：传 `items: SuggestionItem[]`，监听 `select` 自行处理点击（发送 / 回填 / 埋点等）。

## 组合式 hooks

| Hook | 说明 |
|------|------|
| `useChat(options)` | 消息流托管。返回 `messages` / `parsedMessages`（经 `parser` 映射的渲染消息）/ `isLoading` / `onSend` / `onReload` / `onEdit`（编辑并重新生成）/ `abort` / `setMessages` / `updateBlock`（按 id 回写块补丁）/ `setFeedback`（赞/踩）/ `resume`（工具调用 HITL 续流，见「工具调用（tool_use）」）/ `exportTree` / `importTree` / `switchBranch` 等。`options`: `request` / `streamMode?`（`'sse'` 默认 / `'line'`）/ `parseChunk?` / `parser?` / `defaultMessages?` / `onFinish?` / `onError?` / `onAbort?` / `retryTimes?` / `retryInterval?` / `streamTimeout?`（流静默超时） |
| `sseStream(stream, signal?)` | 按 SSE 规范把字节流解析为结构化事件（空行切事件 + `event`/`data`/`id` 字段）的异步生成器，支持中断；`useChat` 的 `sse` 模式（默认）用它 |
| `xStream(stream, signal?)` | 将 `ReadableStream<Uint8Array>` 解码并按行（`\n`）切分的异步生成器，支持中断；`useChat` 的 `line` 模式用它 |
| `useXStream()` | `xStream` 的响应式封装：`lines` / `isStreaming` / `error` / `start` / `cancel` |
| `useTypewriter(source, options?)` | 打字机逐字渲染（保留前缀），返回 `displayed` / `stop`。已内置到 `Bubble`（见 `typing` prop），`options.enabled` 支持响应式开关 |
| `useAutoScroll(scrollEl, options?)` | 滚动状态机 + 跟随策略（own-message / new-message / streaming 三分流） |
| `useAiChatConfig()` / `provideAiChatConfig(config)` | provide/inject 全局配置 |
| `useConversations(options?)` | 多会话托管（SSOT + 可选持久化）。返回 `conversations` / `activeKey` / `active` / `activeMessages`（绑 `AiChat` 的 `v-model:messages`）/ `items`（绑 `Conversations`）/ `isLoading`（`storage.load()` 解析完成前为 `true`，未提供 `storage` 时恒为 `false`）/ `create` / `remove` / `rename`。`storage.load`/`save` 可返回同步值或 `Promise`（内部统一用 `Promise.resolve(...).then(...)` 处理），配合内置 `localStorageConversationStorage` 或自定义异步适配器（对接真实后端）持久化 |
| `useAttachments(options)` | 附件上传托管。返回 `items` / `add` / `remove` / `retry` / `clear` / `isUploading` / `drain`（取出已完成项随消息发送）。`options`: `upload` / `accept?` / `maxCount?` / `maxSize?` |
| `useVoiceInput(options)` | 语音识别输入（ASR）。返回 `status` / `isSupported` / `start` / `stop` / `toggle`。缺省用浏览器 Web Speech API，可注入自定义 `recognizer` 对接讯飞/阿里云等 ASR |
| `useSpeech(options)` | 语音播报（TTS）。返回 `speakingId` / `isSupported` / `toggle`（手动点读：再点同条停、点别条切）/ `feed`（autoPlay 流式增量分句朗读）/ `stop` / `resolveText`。缺省用浏览器 `speechSynthesis`，可注入自定义 `synthesizer` 对接讯飞/阿里云等云端 TTS |

### 打字机效果

打字机已内置到渲染链路：`AiChat` 默认开启（`provideAiChatConfig` 的 `enableTyping`，默认 `true`），流式更新中（`status === 'updating'`）的 AI 气泡会逐字显示，完成后立即全显。可全局关闭：

```ts
import { provideAiChatConfig } from '@aix/ai-chat';
provideAiChatConfig({ enableTyping: false });
```

单独使用 `Bubble` / `BubbleList` 时通过 `typing` prop 控制（默认 `false`）。`typing` 除布尔外还可传**配置对象** `{ step, interval }` 细化逐字节奏（`step` 为每帧字符数，支持 `[min,max]` 区间随机；`interval` 为帧间隔 ms）：

```vue
<!-- 更快节奏：每帧 4 字、间隔 16ms -->
<Bubble :content="blocks" :typing="{ step: 4, interval: 16 }" status="updating" @typing-complete="onDone" />
```

逐字追平源文本时触发 `typing-complete` 事件（`Bubble` 携带 `{ messageKey }`，`BubbleList` / `AiChat` 携带消息 `id`），可用于动画结束后再渲染操作条等。注意流式下源持续增长，每追平一次都会触发，最终一次即「整段打完」。也可直接用 `useTypewriter(source, { enabled, step, interval, onComplete })` 组合到自定义渲染中（`enabled` 支持响应式）。

### 语音输入与播报（ASR / TTS）

语音能力**双向对称、均为 opt-in**：输入侧 `voice`（ASR，麦克风转文字）、输出侧 `speech`（TTS，朗读 AI 回复）。两者默认走浏览器原生 API，也都可注入自定义引擎对接讯飞 / 阿里云等云端服务——不传对应 prop 则完全无开销、不渲染任何按钮。

```vue
<template>
  <AiChat
    :request="request"
    voice
    :speech="{ autoPlay: true, rate: 1.1 }"
  />
</template>
```

**语音输入 `voice`（ASR）**——`true` 用浏览器 Web Speech API，对象可配 `recognizer`（自定义识别器）/ `lang` / `onError`。`Sender` 会显示麦克风按钮，识别中间结果实时回填输入框、定稿追加：

```ts
import type { VoiceConfig } from '@aix/ai-chat';
// 对接自定义 ASR：recognizer 工厂启动识别并返回 { stop }
const voice: VoiceConfig = {
  recognizer: (ctx) => {
    const sdk = startMyAsr({ lang: ctx.lang });
    sdk.on('partial', (t) => ctx.onResult(t, false)); // 中间结果（可被覆盖）
    sdk.on('final', (t) => ctx.onResult(t, true)); // 一段定稿
    sdk.on('error', ctx.onError);
    sdk.on('close', ctx.onEnd);
    return { stop: () => sdk.stop() };
  },
};
```

**语音播报 `speech`（TTS）**——`true` 用浏览器 `speechSynthesis`，对象可配 `synthesizer`（自定义合成器）/ `lang` / `rate` / `pitch` / `volume` / `voice`（音色）/ `getText`（自定义朗读文本，默认 `stripMarkdownForSpeech` 剥离 markdown 标记）/ `autoPlay` / `onError`。启用后 ai 消息操作条自动追加**朗读按钮**（内置 `speak` 项，再点停止）：

- **手动点读**：点朗读按钮整段一次性朗读；点另一条切换、点同一条停止。
- **`autoPlay: true`**：流式 AI 回复**边收边读**——内部按句末边界（中英标点 / 换行 / 分号，且不切断小数）分句，只朗读完整句，`status: 'success'` 时 flush 余下文本；用户手动停止后不会被下个 chunk 重启。
- **自定义合成器**：`synthesizer` 是会话式工厂，返回 `{ enqueue, finish, stop }`，框架按句 `enqueue`、流结束 `finish`：

```ts
import type { SpeechConfig } from '@aix/ai-chat';
const speech: SpeechConfig = {
  autoPlay: true,
  synthesizer: (ctx) => {
    const player = createMyTtsPlayer({ lang: ctx.lang, voice: ctx.voice, rate: ctx.rate });
    player.on('start', ctx.onStart); // 首段发声 → UI 起播态
    player.on('drained', ctx.onEnd); // 队列放空且已 finish → 自然播完
    player.on('error', ctx.onError);
    return {
      enqueue: (text) => player.push(text),
      finish: () => player.markEnd(),
      stop: () => player.dispose(),
    };
  },
};
```

> 仅用 hook 自行拼装时：`useVoiceInput` / `useSpeech` 可脱离 `AiChat` 单独使用；`createSpeechSynthesisSynthesizer()` 导出了内置 speechSynthesis 合成器工厂、`stripMarkdownForSpeech(text)` 导出了默认朗读文本提取，可在自定义实现中复用。
>
> ⚠️ 流式 + 默认 `getText`（每次对增长原文重新 `stripMarkdown`）下，若某 markdown 标记跨已朗读句末边界、后续 chunk 才闭合，个别字符理论上可能重读/漏读——概率低且已作为设计权衡接受。

### ⚠️ 扩展点说明

- **`Thinking`**：`reasoning` 块**已内置**经 `<Thinking>` 折叠渲染（流式中自动展开），无需额外接入；`Thinking` 同时作为独立工具组件导出，可在自定义块渲染器或 `Bubble` 的 content slot 中单独复用，数据来源由业务决定。
- **`useXStream`（响应式封装版）**：`AiChat`/`useChat` 内部直接使用底层生成器 `xStream`，不使用这个组合式封装。它供你在自定义请求逻辑里单独使用。

## Markdown 渲染

`MarkdownRenderer` 用 `markdown-it` 把富文本解析为 **token 流**，再经自研 walker 渲染为 **Vue 节点**（而非整串 `v-html`）：

- 七个增强依赖随包自动安装、开箱即用；个别环境 `markdown-it` 安装失败时自动降级为纯文本并控制台提示一次。
- **块级增量渲染**：按顶层块（段落/标题/代码/公式/表格…）渲染，已完成的块冻结不重渲染，流式时**新块经 `<TransitionGroup>` 淡入**（公式/代码等原子块完成时平滑出现，文字仍逐字打字机），长流式不整段重解析。
- **渐进加载，不阻塞首帧**：依赖均为动态 `import`、不打进主 chunk。基础引擎（`markdown-it` 等轻量项）就绪即渲染富文本骨架；`highlight.js` / `katex` 后台加载、就绪后已渲染内容自动补上高亮/公式排版；`mermaid` 仅在 ` ```mermaid ` 围栏、`echarts` 仅在 ` ```chart ` 围栏或结构化图表块出现时才加载——未用到的能力不会进入首屏。

### 代码高亮与代码块头部（highlight.js）

`highlight.js` 随包自动安装，代码块在**块固化后**自动语法高亮（流式期先纯码逐字、避免逐帧重高亮闪烁）；其加载在后台进行、不阻塞首帧，就绪前固化的代码块会在就绪后自动补上高亮。固化的代码块顶部带**标准头部**：左侧语言标签 + 右侧一键复制按钮（复制原始代码，带「已复制」反馈）；流式未固化时不显示复制按钮，避免复制到半截代码。复制兼容 **HTTP / 旧浏览器**——`navigator.clipboard` 仅在 HTTPS/localhost 可用，不可用时自动降级 `document.execCommand`（此复制能力经导出的 `copyText(text)` 工具实现，可在自定义渲染器中复用）。需自定义代码块外观（如换主题、加行号）时，用 `markdownRenderers.fence` 覆盖即可。

### 数学公式（KaTeX）

KaTeX 及其 markdown-it 插件随包自动安装，LaTeX 公式开箱渲染为排版结果（AI 在理工科场景常输出公式）。支持两套定界符：行内 `$...$` / 块级 `$$...$$`，以及 OpenAI 系常用的行内 `\(...\)` / 块级 `\[...\]`（内部归一化为 `$`/`$$` 后渲染，并自动把 KaTeX 不支持的 `align*` 修正为 `aligned`）。

**KaTeX 样式会在后台加载 katex 时自动注入**，无需手动引入。仅当你的打包器不支持动态 CSS import（个别 SSR / 非常规构建）时，才需在应用入口手动兜底引入一次：

```ts
import 'katex/dist/katex.min.css';
```

- 正常情况 → `$...$` / `$$...$$` 渲染为公式（残缺/非法公式以提示形式呈现，不会中断整段渲染）；katex 库在后台加载，就绪前公式暂以原文呈现、就绪后自动补上排版。
- 个别环境 katex 安装失败 → 公式原样保留为文本，markdown 其余部分照常渲染（与 `markdown-it` 缺失时同样的降级风格）。
- 流式渲染时未闭合的 `$$` 残片会被自动隐藏，闭合后再呈现为公式，避免半截裸 LaTeX 闪烁。

**化学方程式（mhchem）**：`\ce{...}`（化学式/反应式）与 `\pu{...}`（带单位物理量）开箱支持——写在 `$...$` / `$$...$$` 内即可，如 `$\ce{2H2 + O2 -> 2H2O}$`、离子 `$\ce{SO4^2-}$`、`$\pu{123 J/mol}$`。mhchem 是 `katex` 包内置的 contrib 扩展，随 katex 一同按需加载、无需额外依赖；个别环境加载失败时仅化学式降级、普通公式不受影响。注意 `\ce`/`\pu` 须包裹在数学定界符内（裸写不渲染，与其它裸 LaTeX 行为一致）。

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

默认 `allowHtml=false`：源码中的原始 HTML 标签**被转义为文本**，零风险面。需要渲染原始 HTML（含交互脚本）时，开启 `allowHtml` 即可——块级 HTML（`html_block` / ```html 围栏）经沙箱 `<iframe sandbox="allow-scripts">` 渲染，**不消毒、不注入当前页面 DOM**：

```vue
<AiChat :request="request" allow-html />
```

- iframe **不带** `allow-same-origin`：脚本可执行，但拿不到父页面的 DOM / cookie / localStorage，也无法跳转顶层页面或弹窗——安全边界来自隔离，而非内容净化。
- 仅隔离**块级** HTML；行内裸标签（`<b>` 等）当前丢弃保留文本。
- 内容高度经 `postMessage` 自适应；渲染块提供代码/预览切换、新窗口打开。
- 无需额外依赖（不再需要 `dompurify`）。也可经 `provideAiChatConfig({ allowHtml: true })` 全局开启（组件 `allow-html` prop 优先）。

## 主题

所有样式基于 `@aix/theme` 的语义 token CSS 变量（颜色 `--aix-color*`、间距 `--aix-padding*`/`--aix-size*`、圆角 `--aix-borderRadius*`、动效 `--aix-motionDuration*`）。切换 `@aix/theme` 的明暗主题即可联动，无需额外配置。

## 能力范围

已实现：上述原子组件、组合预设与逻辑 hooks，以及**会话列表**（`Conversations` + `useConversations`，含 localStorage 持久化）、**工具调用 tool_use**（内置 `ToolUseBlock` + `toolRenderers` 按 toolName 路由 + `useChat.resume` HITL 续流，面向「后端跑循环」形态）、**附件上传**（`useAttachments` + `AttachmentsPanel`/`AttachmentCard`）、**语音输入 ASR**（`useVoiceInput` + `AiChat`/`Sender` 的 `voice` prop，可对接自定义识别器）、**语音播报 TTS**（`useSpeech` + `AiChat` 的 `speech` prop，手动点读 + autoPlay 流式增量朗读，可对接自定义合成器）、**模型切换**（`ModelSelector`）、**@ 提及/斜杠命令（textarea 触发菜单）**（`Sender`/`AiChat` 的 `triggers` prop：本地过滤或异步搜索候选、`insertText`/`onSelect` 双行为、`meta.mentions` 结构化回传，见「触发菜单」）、**追问建议**（`AiChat` 的 `suggestions` prop：`parseChunk` 下发 + `setSuggestions` 命令式注入双通道，chips 点击发送或回填，见「追问建议」）、**Mermaid 流程图**（`mermaid` 随包自动安装，仅在内容出现 ` ```mermaid ` 围栏时才按需加载并渲染成图；个别环境安装失败时围栏维持代码块展示）、**ECharts 图表**（`echarts` 随包自动安装；` ```chart ` 围栏承载 ECharts option JSON、或结构化 `chart` 块，按需加载并以 canvas 活实例渲染统计图（柱/折/饼/散点/雷达）；虚拟列表滚动按活实例 `dispose`/重建而非缓存静态图；缺失时围栏维持代码块、结构化块降级为 `alt` 文字。数学函数图像 function-plot 分期接入）。

**暂未包含**：结构化输入（SlotConfig）、多 Provider class 等，后续版本迭代。
