---
title: AiChat AI 对话
outline: deep
---

<script setup>
import { ref } from 'vue'
import { AiChat, Conversations, useConversations, flatParseChunk, textMessage, messageText } from '@aix/ai-chat'

const enc = new TextEncoder()

function streamFrames(frames, signal, stepMs = 40) {
  return new ReadableStream({
    start(controller) {
      let i = 0
      const finish = () => {
        clearInterval(timer)
        try { controller.close() } catch {}
      }
      const timer = setInterval(() => {
        if (signal?.aborted) return finish()
        if (i >= frames.length) {
          controller.enqueue(enc.encode('data: [DONE]\n\n'))
          return finish()
        }
        controller.enqueue(enc.encode(`data: ${JSON.stringify(frames[i++])}\n\n`))
      }, stepMs)
      signal?.addEventListener('abort', finish)
    },
  })
}

const splitText = (text, size = 3, key = 'delta') => {
  const frames = []
  for (let i = 0; i < text.length; i += size) frames.push({ [key]: text.slice(i, i + size) })
  return frames
}

const lastQuestion = (messages) => {
  const user = [...messages].reverse().find((m) => m.role === 'user')
  return user ? messageText(user) : ''
}

const ANSWER_CODE = [
  '一个 **Python 快速排序** 实现：',
  '',
  '```python',
  'def quicksort(arr):',
  '    if len(arr) <= 1:',
  '        return arr',
  '    pivot = arr[len(arr) // 2]',
  '    left = [x for x in arr if x < pivot]',
  '    right = [x for x in arr if x > pivot]',
  '    return quicksort(left) + [pivot] + quicksort(right)',
  '```',
  '',
  '平均时间复杂度 `O(n log n)`，数据量很大时建议改用迭代版本。',
].join('\n')

const ANSWER_FALLBACK = [
  '我是文档站里的演示助手，回复由本地 mock 分片吐出，不依赖任何后端。',
  '',
  '- 支持 **Markdown**：代码块、表格、列表都能渲染',
  '- 回复中途可以点「停止」中断，出错后可以重试',
  '',
  '试试问我：`帮我写一段快速排序`。',
].join('\n')

const pickAnswer = (question) => (/代码|快速排序|算法|python/i.test(question) ? ANSWER_CODE : ANSWER_FALLBACK)

const basicRequest = async ({ messages, signal }) =>
  streamFrames(splitText(pickAnswer(lastQuestion(messages))), signal)

const prompts = [
  { key: 'code', label: '帮我写一段快速排序' },
  { key: 'intro', label: '你能做什么？' },
]

const failedOnce = new Set()
const flakyRequest = async ({ messages, signal }) => {
  const question = lastQuestion(messages)
  if (/报错|失败|出错/.test(question) && !failedOnce.has(question)) {
    failedOnce.add(question)
    throw new Error('mock: 模拟网络错误')
  }
  const text = '这条回复刻意放慢了速度，方便你在中途点击「停止」。' + '中断后的内容会保留在气泡里，操作条上会多出一个「继续生成」入口。'.repeat(3)
  return streamFrames(splitText(text, 2), signal, 60)
}
const flakyPrompts = [
  { key: 'slow', label: '给我一段慢慢输出的回复' },
  { key: 'fail', label: '模拟一次请求报错' },
]

const reasoningRequest = async ({ messages, signal }) => {
  const question = lastQuestion(messages) || '这个问题'
  const thinking = `用户想了解「${question}」。先判断它属于概念解释还是操作步骤，再决定是否给代码示例。结论：给一段简短说明加要点列表即可。`
  const answer = [
    `关于「${question}」，可以从三点理解：`,
    '',
    '1. 先明确目标，再选工具',
    '2. 小步验证，每一步都能回退',
    '3. 把结论写成可复用的清单',
  ].join('\n')
  const frames = [
    ...splitText(thinking, 4, 'reasoning'),
    ...splitText(answer, 3),
    { suggestions: ['能举个具体例子吗？', '有推荐的阅读材料吗？', '换成表格形式总结一下'] },
  ]
  return streamFrames(frames, signal)
}

function reasoningParseChunk(chunk) {
  if (chunk.data === '[DONE]') return { done: true }
  const json = JSON.parse(chunk.data)
  if (json.reasoning) return { delta: json.reasoning, blockType: 'reasoning' }
  if (json.suggestions) return { suggestions: json.suggestions }
  return flatParseChunk(chunk)
}

const conv = useConversations({
  defaultConversations: [
    {
      id: 'vue',
      label: 'Vue 相关问题',
      timestamp: Date.now(),
      messages: [textMessage('user', '什么是组合式函数？'), textMessage('ai', '把一段可复用的有状态逻辑封装成 `useXxx` 函数，在多个组件里调用。')],
    },
    { id: 'empty', label: '新会话', timestamp: Date.now() - 86400000, messages: [] },
  ],
})
const convRequest = async ({ messages, signal }) => {
  const text = `这条回复属于「${conv.active.value?.label ?? '当前会话'}」。切到别的会话再切回来，消息会被保留；切换时若还在生成会自动中断。`
  return streamFrames(splitText(text), signal)
}
</script>

<style>
.ai-chat-demo {
  height: 480px;
  padding: 0;
  overflow: hidden;
}

.ai-chat-demo > * + * {
  margin-left: 0;
}

.ai-chat-demo--split {
  display: flex;
}

.ai-chat-demo__aside {
  flex: none;
  width: 220px;
  border-right: 1px solid var(--aix-colorBorderSecondary);
}

.ai-chat-demo__main {
  flex: 1;
  min-width: 0;
}
</style>

# AiChat AI 对话

开箱即用的 AI 对话界面：欢迎页、消息列表、输入框与流式请求编排装在一个组件里，传入一个 `request` 即可对话。协议无关，换模型 / 换后端只改 `request` 与 `parseChunk`。

## 何时使用

- 需要在业务里快速嵌入一个完整的 AI 助手对话面板
- 后端以 SSE / ndjson 流式返回回复，需要打字机、中断、重试、重新生成等标准交互
- 回复里包含 Markdown、代码块、表格、深度思考过程等富内容

单独定制角色样式、滚动策略或自行拼装界面时，请改用 `useChat` + `BubbleList` + `Sender` 原子组件（见包内 README「进阶：自行组合原子组件」）。

## 安装

```bash
pnpm add @aix/ai-chat
```

组件样式与主题变量需要在应用入口各引入一次：

```ts
import '@aix/ai-chat/style';
import '@aix/theme/style';
```

Markdown 渲染的增强依赖（`markdown-it` / `highlight.js` / `katex` / `mermaid` / `echarts`）声明为 `optionalDependencies`，随包自动安装、运行时按需加载。

## 代码演示

### 基础用法

`request` 接收 `{ messages, signal }`，返回 `ReadableStream` 或 `Response`。默认按 SSE 解析，每个事件的 `data` 是 `{ delta }` 形式的 JSON，`[DONE]` 结束。下方演示的 `request` 是本地 mock，按关键词挑一段 Markdown 分片吐出；`prompts` 是欢迎页的快捷问题。

<ClientOnly>
<div class="demo-block ai-chat-demo">
  <AiChat
    :request="basicRequest"
    :prompts="prompts"
    welcome-title="你好，我是演示助手"
    welcome-description="选一个快捷问题，或直接输入"
    placeholder="输入消息，Enter 发送，Shift+Enter 换行"
  />
</div>
</ClientOnly>

```vue
<template>
  <div style="height: 480px">
    <AiChat
      :request="request"
      :prompts="prompts"
      welcome-title="你好，我是助手"
      welcome-description="问我任何问题"
      placeholder="输入消息…"
    />
  </div>
</template>

<script setup lang="ts">
import { AiChat, type ChatMessage, type PromptItem } from '@aix/ai-chat';

const prompts: PromptItem[] = [{ key: 'intro', label: '介绍一下你自己' }];

// 生产环境指向自己的后端；signal 用于「停止」按钮中断请求
const request = ({ messages, signal }: { messages: ChatMessage[]; signal: AbortSignal }) =>
  fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
    signal,
  });
</script>
```

后端对接 OpenAI / Anthropic 兼容协议时不必自己写解析，换内置预设即可：`:parse-chunk="openaiParseChunk"` 或 `anthropicParseChunk`。

### 中断、出错与重试

流式进行中发送键变为「停止」，点击后中断本轮（`abort`），已输出的内容保留，操作条出现「继续生成」。`request` 抛错时气泡进入出错态并显示「重试」按钮；`retryTimes` 可在此之前先自动重试。下方 mock 把回复放慢到 60ms/帧，含「报错」的问题首次必失败、重试放行。

<ClientOnly>
<div class="demo-block ai-chat-demo">
  <AiChat
    :request="flakyRequest"
    :prompts="flakyPrompts"
    welcome-title="中断与重试"
    welcome-description="点第一个问题后在中途按「停止」；点第二个问题看出错态与重试"
    :actions="['copy', 'regenerate']"
  />
</div>
</ClientOnly>

```vue
<template>
  <AiChat
    ref="chatRef"
    :request="request"
    :retry-times="1"
    :retry-interval="800"
    :error-text="(m) => (m.extra?.error as Error)?.message || '服务开小差了，请重试'"
    @abort="onAbort"
    @error="onError"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { AiChat } from '@aix/ai-chat';

// 路由离开等场景可从外部命令式中断：chatRef.value?.abort()
const chatRef = ref<InstanceType<typeof AiChat>>();
</script>
```

`errorText` 只改错误条文案，重试按钮与样式保留；要整块接管出错态才用 `#error` 插槽。

### 深度思考与追问建议

`parseChunk` 返回 `{ delta, blockType: 'reasoning' }` 时增量进入可折叠的「深度思考」块，`reasoningVariant="capsule"` 用胶囊头形态。任意一帧返回 `suggestions` 数组，流结束后消息下方出现追问 chips，点击直接发送（`suggestions: { fillOnly: true }` 改为只回填输入框）。下方 mock 先吐思考过程，再吐正文，最后一帧带三条建议。

<ClientOnly>
<div class="demo-block ai-chat-demo">
  <AiChat
    :request="reasoningRequest"
    :parse-chunk="reasoningParseChunk"
    reasoning-variant="capsule"
    suggestions
    welcome-title="深度思考 + 追问建议"
    welcome-description="随便问一句，先看思考过程展开，再看回复下方的追问建议"
  />
</div>
</ClientOnly>

```vue
<template>
  <AiChat :request="request" :parse-chunk="parseChunk" reasoning-variant="capsule" suggestions />
</template>

<script setup lang="ts">
import { AiChat, flatParseChunk, type ParsedChunk, type SSEChunk } from '@aix/ai-chat';

// 后端每帧 data 形如 { reasoning } / { delta } / { suggestions: string[] }
function parseChunk(chunk: SSEChunk): ParsedChunk {
  if (chunk.data === '[DONE]') return { done: true };
  const json = JSON.parse(chunk.data) as { reasoning?: string; delta?: string; suggestions?: string[] };
  if (json.reasoning) return { delta: json.reasoning, blockType: 'reasoning' };
  if (json.suggestions) return { suggestions: json.suggestions };
  return flatParseChunk(chunk);
}
</script>
```

`parseChunk` 与 `request` 一样在用到那一刻才读取，运行时替换即刻生效，对话中途换模型不需要 `:key` 重建组件。

### 会话列表

`useConversations` 托管多会话的单一数据源：`items` 喂给 `Conversations`，`activeTree` 绑到 `AiChat` 的 `v-model:tree`（分支感知，保留「重新生成」产生的多个版本）。新建、切换、重命名、删除都由它处理，切换时若还在生成会自动中断。传入 `storage: localStorageConversationStorage('key')` 即可落到 localStorage。

<ClientOnly>
<div class="demo-block ai-chat-demo ai-chat-demo--split">
  <div class="ai-chat-demo__aside">
    <Conversations
      :items="conv.items.value"
      v-model:activeKey="conv.activeKey.value"
      @create="conv.create()"
      @delete="conv.remove"
      @rename="conv.rename"
    />
  </div>
  <div class="ai-chat-demo__main">
    <AiChat
      :request="convRequest"
      v-model:tree="conv.activeTree.value"
      welcome-title="新会话"
      welcome-description="发一条消息，再新建或切换会话"
    />
  </div>
</div>
</ClientOnly>

```vue
<template>
  <div class="layout">
    <Conversations
      :items="conv.items.value"
      v-model:activeKey="conv.activeKey.value"
      @create="conv.create()"
      @delete="conv.remove"
      @rename="conv.rename"
    />
    <AiChat :request="request" v-model:tree="conv.activeTree.value" :history-loading="conv.isLoading.value" />
  </div>
</template>

<script setup lang="ts">
import { AiChat, Conversations, useConversations, localStorageConversationStorage } from '@aix/ai-chat';

const conv = useConversations({
  storage: localStorageConversationStorage('demo-conversations'),
});
</script>
```

`v-model:tree` 与 `v-model:messages` 择一使用；只需要当前路径的扁平消息数组时绑 `v-model:messages="conv.activeMessages.value"`。`update:tree` 只在结构变化、请求落终态、交互块回写、赞踩写回四个时刻触发，流式逐 chunk 不触发。

## 主题变量定制

配色跟随 `@aix/theme` 的语义 token（`--aix-colorPrimary` 等），切换明暗主题自动联动。布局尺寸由下表的组件级变量控制，在任意祖先元素上设值即可生效，全局或局部皆可：

```css
/* 全局：宽屏布局放宽气泡与输入框 */
:root {
  --aix-bubble-max-width: 900px;
  --aix-sender-max-height: 320px;
}

/* 局部：侧栏里的会话用紧凑尺寸、通栏输入框 */
.sidebar-chat {
  --aix-bubble-max-width: 100%;
  --aix-bubble-avatar-size: 24px;
  --aix-ai-chat-sender-margin: 0;
}
```

| 变量                            | 默认值                      | 作用                                       |
| ------------------------------- | --------------------------- | ------------------------------------------ |
| `--aix-bubble-max-width`        | `min(680px, 100%)`          | 气泡内容区最大宽度                         |
| `--aix-bubble-avatar-size`      | `36px`                      | 头像尺寸                                   |
| `--aix-bubble-content-radius`   | `--aix-borderRadiusLG`      | 气泡内容区圆角                             |
| `--aix-sender-max-height`       | `160px`                     | 输入框自适应高度上限，超出后内部滚动       |
| `--aix-sender-min-height`       | `0`                         | 输入框自适应高度下限                       |
| `--aix-sender-send-width`       | `--aix-controlHeight`       | 发送按钮宽度（高度为 `-send-height`）      |
| `--aix-sender-send-icon-size`   | `16px`                      | 发送 / 停止图标尺寸                        |
| `--aix-sender-padding`          | `paddingXS … paddingSM`     | 输入框容器内边距                           |
| `--aix-sender-input-padding`    | `--aix-paddingXS`           | 文本域自身内边距                           |
| `--aix-ai-chat-sender-margin`   | `paddingSM padding padding` | 输入框相对面板的外边距，置 `0` 即左右贴边  |
| `--aix-chart-block-height`      | `300px`                     | 图表高度                                   |
| `--aix-attachment-card-width`   | `248px`                     | 附件卡片宽度                               |
| `--aix-tool-use-max-height`     | `320px`                     | 工具调用入参 / 结果区滚动上限              |

完整清单（发送 / 停止图标的 mask 图源、工具栏内边距、触发菜单高度等）见包内 README「组件级尺寸变量」。这些变量在组件内只以 `var(--x, 默认值)` 读取、从未被声明，因此 `:root` 上的设值不会被组件自身覆盖。容器视觉用 `senderVariant="plain"`（通栏输入框）与 `reasoningVariant="capsule"` 两个形态旋钮切换，不需要覆写 `.aix-sender`。

## API

::: warning 自动生成的 API 文档
以下内容由 `pnpm docs:gen` 从组件源码生成，请勿手动编辑。

需要修改时：改组件源码里的类型声明与 JSDoc，然后运行 `pnpm docs:gen`。
:::

**AttachmentCard** — 待发送附件的单张卡片：缩略图 / 文件名 / 上传进度，失败可重试，可移除。

### AttachmentCard Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `item` | `AttachmentItem & Partial<Pick<PendingAttachment, 'status' \| 'percent' \| 'error'>>` | - | ✅ | 附件条目（含上传状态与缩略图信息） |
| `removable` | `boolean` | `false` | - | 是否显示删除按钮（输入区预览 true / 气泡回显 false），默认 false |

### AttachmentCard Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `remove` | - | 点击删除按钮 |
| `retry` | - | 上传失败态点击重试 |

---

**AttachmentsPanel** — 待发送附件面板：承载附件卡片列表，支持点选、拖拽投放与整体收起。

### AttachmentsPanel Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `PendingAttachment[]` | - | ✅ | 待发附件列表（含上传过程态） |
| `icons` | `AttachmentsPanelIcons` | - | - | 覆盖内置图标（上传占位 / 收起按钮），见 `AttachmentsPanelIcons` |

### AttachmentsPanel Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `pick` | - | 点击占位区：请求打开文件选择器 |
| `drop` | `files: FileList \| File[]` | 拖放落入面板的文件 |
| `remove` | `id: string` | 移除指定条目 |
| `retry` | `id: string` | 重试失败条目 |
| `close` | - | 收起面板 |

### AttachmentsPanel Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `placeholder` | `props: SenderAttachmentsPlaceholderSlotScope` | 上传占位区（点击 / 拖放触发区），作用域给出 pick 与 dragIn；拖放高亮与键盘可达性仍由面板负责 |

---

**Bubble** — 单条消息气泡：按 role / status 决定朝向与配色，内容区由块渲染器装配。

### Bubble Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `content` | `ContentBlock[]` | `[]` | - | 内容块列表（有序），由各 block 渲染器分发渲染 |
| `role` | `'user' \| 'ai' \| 'system' \| (string & {})` | `'ai'` | - | 角色：决定默认头像 / 位置 / 样式（user/ai/system 或自定义），默认 'ai' |
| `status` | `'local' \| 'loading' \| 'updating' \| 'success' \| 'error' \| 'abort'` | - | - | 消息状态：loading 显示加载点、error 显示重试入口等，影响渲染分支 |
| `placement` | `'start' \| 'end'` | `'start'` | - | 气泡位置：'start' 左 / 'end' 右，默认 'start' |
| `variant` | `'filled' \| 'outlined' \| 'borderless' \| 'shadow'` | `'filled'` | - | 气泡样式变体：filled / outlined / borderless / shadow，默认 'filled' |
| `shape` | `'round' \| 'corner'` | `'round'` | - | 气泡圆角形状：round / corner，默认 'round' |
| `avatar` | `string` | - | - | 头像图片地址（URL / data-URI），不传则不渲染头像 |
| `loading` | `boolean` | `false` | - | 是否加载态：显示加载点而非内容，默认 false |
| `contentRender` | `(blocks: ContentBlock[], info: BubbleContentInfo) => unknown` | - | - | 自定义整条内容区渲染（优先级低于 content slot） |
| `itemKey` | `string \| number` | - | - | 虚拟列表 / block-action 回传所用的消息 key（通常为消息 id） |
| `typing` | `boolean \| BubbleTypingConfig` | `false` | - | 打字机效果：`true` 用默认节奏逐字显示；传配置对象 `{ step, interval }` 细化节奏；默认 `false`（不逐字）。适合流式回复中的 AI 气泡。 |
| `blockRenderers` | `Record<string, Component>` | `{}` | - | block 渲染器注册表：块类型 → 组件，用于扩展新块类型或覆盖内置 text/reasoning 渲染 |
| `toolRenderers` | `Record<string, Component>` | - | - | 工具渲染器注册表：toolName → 组件，透传给内置 ToolUseBlock 做按名路由 |
| `tailBreathing` | `boolean \| { idleMs?: number }` | `false` | - | 末尾静默呼吸：流式输出停顿时让末块文字做明暗呼吸，提示「仍在生成」而非已说完。`true` 用默认 3000ms 阈值；传 `{ idleMs }` 自定义；`false` 不改变视觉。 |
| `editing` | `boolean` | - | - | 是否处于内联编辑态（受控，由外部驱动进入/退出——见 BubbleList.startEdit） |
| `saveDisabled` | `boolean` | - | - | 编辑态下是否禁止保存（如全局请求进行中），true 时点击保存无效果、保留草稿与编辑态 |
| `errorText` | `string` | - | - | 出错态（status==='error'）内置错误条展示的文案；缺省回退 `locale.errorMessage`。<br>由上层（BubbleList 的 `errorText` 解析函数）按整条消息算好后传入——气泡本身只持有 role/status/content，拿不到 `extra.error` 里的原始错误。**默认仍是 i18n 兜底文案**：`extra.error` 存的是原始 Error，直出会把 `Failed to fetch` 之类的内部信息暴露给终端用户，要不要透出、透出到什么程度由业务显式决定（见 AiChatProps.errorText）。 |

### Bubble Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `retry` | - | 出错态点击重试（由 AiChat 调 onReload） |
| `block-action` | `payload: { messageKey: string \| number; action: BlockAction }` | 交互块上抛的动作（携带所属消息 key），由 AiChat 调 updateBlock |
| `block-intent` | `payload: { messageKey: string \| number; intent: BlockIntent }` | 交互块上抛的意图（携带所属消息 key）：不改数据，逐层转发交宿主处置 |
| `edit` | `text: string` | 用户消息内联编辑保存，携带新文本（由 AiChat 调 onEdit） |
| `editing-change` | `editing: boolean` | 进入/退出内联编辑态：供列表层保持该行挂载（虚拟滚动回收该行会销毁行内草稿） |
| `typing-complete` | `payload: { messageKey: string \| number }` | 某文本块逐字显示完毕（携带所属消息 key），供上层在动画结束后再渲染操作条等 |
| `keep-mounted-change` | `payload: { messageKey: string \| number; active: boolean }` | 块级浮层（如图片预览 Modal）开合：供列表层保持该行挂载，免被虚拟滚动回收销毁 |

### Bubble Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `avatar` | `props: { info: BubbleContentInfo }` | 头像区，作用域 info 含 role / status / key |
| `header` | `props: { info: BubbleContentInfo }` | 气泡上方的消息级头部（发送者名 / 时间戳） |
| `content` | `props: BubbleContentSlotScope` | 整条内容区，覆盖默认的内容块渲染，作用域 blocks 为内容块列表 |
| `error` | `props: BubbleErrorSlotScope` | 出错态的自定义 UI，作用域含 retry 重试句柄；未提供时显示内置「出错了 + 重试」条 |
| `footer` | - | 气泡下方的操作条区；产出空内容时不渲染包裹层，编辑态期间隐藏 |

---

**BubbleList** — 消息列表：虚拟滚动承载气泡，并处理流式期间的自动跟随与回到底部。

### BubbleList Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ChatMessage[]` | - | ✅ | 消息列表（渲染数据源，经 virtua 虚拟化渲染为气泡） |
| `loading` | `boolean` | `false` | - | 整体加载态：为 true 时渲染骨架占位气泡，不渲染 items（历史消息拉取中使用），默认 false |
| `roles` | `Record<string, RoleConfig>` | - | - | 角色样式映射：角色 → 气泡默认 props（头像 / 位置 / 变体等） |
| `autoScroll` | `boolean` | `true` | - | 是否自动滚动跟随新消息，默认 true |
| `shouldFollow` | `(ctx: FollowContext) => boolean` | - | - | 自定义滚动跟随策略（覆盖内置 defaultShouldFollow） |
| `maxHeight` | `string` | `'100%'` | - | 列表最大高度（CSS 值），默认 '100%'；超出内部滚动 |
| `typing` | `boolean \| BubbleTypingConfig` | `false` | - | 全局打字机开关：开启后流式更新中（status==='updating'）的气泡逐字显示，默认 false。传配置对象 `{ step, interval }` 可细化逐字节奏（透传给各气泡的打字机）。 |
| `tailBreathing` | `boolean \| { idleMs?: number }` | - | - | 末尾静默呼吸：透传给各 Bubble（见 BubbleProps.tailBreathing） |
| `blockRenderers` | `Record<string, Component>` | - | - | 块渲染器注册表：透传给各 Bubble，与 roles 内的 blockRenderers 合并（role 级更具体，优先） |
| `toolRenderers` | `Record<string, Component>` | - | - | 工具渲染器注册表：toolName → 组件，透传给各 Bubble 供内置 ToolUseBlock 按名路由 |
| `saveDisabled` | `boolean` | - | - | 编辑态下是否禁止保存（如全局请求进行中），透传给每个 Bubble |
| `errorText` | `(message: ChatMessage) => string` | - | - | 出错文案解析：按整条消息算出内置错误条要显示的文字，逐条传给 Bubble 的 `errorText`。不传（或返回空串）时各气泡回退 `locale.errorMessage`。放在列表层而非气泡层，是因为只有这里持有完整 ChatMessage（`extra.error` 在其中）。 |

### BubbleList Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `retry` | `id: string` | 某条消息点击重试，携带消息 id |
| `block-action` | `payload: BlockActionPayload` | 透传 Bubble 的块动作 |
| `block-intent` | `payload: BlockIntentPayload` | 透传 Bubble 的块意图（不改数据，交更上层处置） |
| `edit` | `id: string, text: string` | 某条用户消息编辑保存，携带消息 id 与新文本 |
| `typing-complete` | `id: string` | 某条消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） |

### BubbleList Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `content` | `props: BubbleListContentSlotScope` | 转发给每个 Bubble 的内容区，作用域补 item（完整 ChatMessage） |
| `footer` | `props: { item: ChatMessage }` | 气泡下方的操作条区，作用域 item 为该条消息 |
| `header` | `props: BubbleListItemSlotScope` | 消息级头部，作用域补 item |
| `avatar` | `props: BubbleListItemSlotScope` | 头像区，作用域补 item |
| `error` | `props: BubbleListErrorSlotScope` | 出错态自定义 UI，作用域补 item 与 extra.error 里的原始错误 |
| `row-before` | `props: BubbleListRowSlotScope` | 气泡所在行之前、占满整行的区域（时间戳 / 日期分隔线）；产出空内容时不渲染包裹层 |

---

**BubbleActions** — 气泡操作条：复制 / 重新生成 / 赞踩 / 朗读 / 引用等内置项与自定义项混排。

### BubbleActions Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `(ActionKey \| ActionItem)[]` | `['copy', 'regenerate']` | - | 操作项列表：字符串=内置预设（copy/regenerate/feedback/speak），对象=自定义项；默认 ['copy','regenerate'] |
| `content` | `string` | - | - | 'copy' 内置项的复制文本；提供后点击复制自动写入剪贴板并给出「已复制」反馈。未提供但传了 `message` 时，点击的那一刻按 `stripMarkdownForCopy(messageText(message))` 现算 （复制是低频动作，不值得为它逐帧预先剥离全文 markdown）。 |
| `sourceContent` | `string` | - | - | 'copySource' 内置项的复制文本（原始 markdown 源码，未剥离语法符号）；未传时依次退化为 `messageText(message)` → content。该内置项默认不在 items 里，需消费方显式加入才会渲染（如 `actions: ['copy', 'copySource', 'regenerate']`）。 |
| `feedback` | `MessageFeedback \| null` | - | - | 'feedback' 内置项的受控激活态，null 表示未反馈 |
| `speaking` | `boolean` | - | - | 'speak' 内置项的受控朗读态（true=正在朗读，按钮切换为停止） |
| `message` | `ChatMessage` | - | - | 自定义项 onClick 的 ctx.message 来源（AiChat 接线时传入；独立使用可不传） |
| `branch` | `BranchMeta` | - | - | 分支元信息：count>1 时渲染 ‹ i/n › 切换器 |
| `branchDisabled` | `boolean` | - | - | 切换器是否禁用（流式中由上层传 true） |

### BubbleActions Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `copy` | - | 内置 copy 操作：复制消息文本 |
| `copy-source` | - | 内置 copySource 操作：复制原始 markdown 源码 |
| `regenerate` | - | 内置 regenerate 操作：重新生成该消息 |
| `continue` | - | 内置 continue 操作：向被手动停止（status==='abort'）的消息续写 |
| `feedback` | `value: MessageFeedback \| null` | 内置 feedback 操作：赞 / 踩变化，null 为取消 |
| `speak` | - | 内置 speak 操作：切换朗读 |
| `quote` | - | 内置 quote 操作：整条引用该消息（AiChat 接线构造 Quote 进 pendingQuotes） |
| `switch-branch` | `dir: -1 \| 1` | 切换分支版本：dir=-1 上一个 / 1 下一个 |
| `edit` | - | 内置 edit 操作：请求进入内联编辑态（不是保存——保存是 Bubble 内部 saveEdit 的事，走独立事件通道） |
| `delete` | - | 内置 delete 操作：请求删除该消息，只上抛不改数据 |

### BubbleActions Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | 追加在内置操作项之后的自定义内容 |

---

**Sender** — 输入框：多行文本 + 工具栏 + 发送 / 停止，可选接入附件、语音与触发菜单。

### Sender Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `modelValue` | `string` | `''` | - | 输入框文本（v-model），受控 |
| `placeholder` | `string` | - | - | 占位提示，缺省取 locale.senderPlaceholder |
| `loading` | `boolean` | `false` | - | 加载态：发送按钮切换为停止按钮，点击触发 cancel，默认 false |
| `disabled` | `boolean` | `false` | - | 是否禁用整个输入框，默认 false |
| `submitType` | `'enter' \| 'shiftEnter'` | `'enter'` | - | 提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之，默认 'enter' |
| `attachments` | `UseAttachmentsOptions \| UseAttachmentsReturn` | - | - | 附件能力（opt-in）：不传则完全不渲染附件 UI。传入后启用回形针按钮 / 拖拽 / 粘贴上传。视为静态配置（setup 快照建状态机），运行时切换不生效——与 voice / triggers 约定一致。<br>两种传法：<br>- **配置对象**（`UseAttachmentsOptions`）：Sender 内部自行 `useAttachments`，最省事。<br>- **已创建的实例**（`UseAttachmentsReturn`）：宿主自己持有状态，把附件 UI 放到 Sender 之外（页面顶部工具条等）也能复用同一份 items —— 发送时的 `drain()`、上传中禁发守卫仍由 Sender 走这份实例，不会各持一份而分叉。<br>二者靠 `'drain' in v` 判别（`UseAttachmentsOptions` 无同名字段，不会误判）。 |
| `voice` | `boolean \| VoiceConfig` | - | - | 语音输入（opt-in）：true=全默认（Web Speech API + navigator.language）；对象=自定义识别器/语言。不传则不渲染麦克风按钮；浏览器不支持且未注入识别器时按钮自动隐藏。视为静态配置（setup 快照），运行时切换不生效。 |
| `allowEmptySubmit` | `boolean` | `false` | - | 有外部附加内容（如引用 chip）时允许空文本提交，默认 false |
| `triggers` | `TriggerConfig[]` | - | - | 触发菜单（opt-in）：@提及 / 斜杠命令等按字符触发的候选菜单。视为静态配置（setup 快照），运行时切换不生效——与 attachments/voice 约定一致。 |
| `toolbarItems` | `(ToolbarBuiltinKey \| ToolbarItem)[]` | `['attach', 'voice']` | - | 工具栏项：内置 'attach'/'voice' 与自定义对象混排，渲染顺序 = 数组顺序。 'attach'/'voice' 是位置占位符，实际是否出内容仍分别由 attachments/voice prop 决定。 |
| `autoSpacer` | `boolean` | `true` | - | 未显式放置 'spacer' 时，是否在发送键前自动补一个隐式 spacer。业务用 `toolbarItems: []` 接管整条 `#toolbar` 自绘布局时设为 `false`；不影响显式放置的 'spacer' |
| `icons` | `SenderIcons` | - | - | 覆盖内置按钮图标（仅换图标，按钮行为与 a11y 文案不变）。未提供的键回退内置图标，故可只换其中一两个。<br>想连**交互行为**一起接管（换按钮而非换图标）时，改用 `toolbarItems` 里的自定义对象项，或 `#toolbar` 插槽——两者都能从 `SenderSlotScope` 拿到 `toggleAttachments` / `toggleVoice` 等动作，完整复刻内置按钮。<br>传入组件建议用 `markRaw()` 包裹，避免组件对象进入响应式系统触发 Vue 告警 （与 ActionItem.icon 同约定）；图形建议用 `fill="currentColor"`，才能随按钮状态 （可发送 / 禁用 / 输出中）与主题一起变色——内置图标与 @aix/icons 全系都是这个约定。使用侧会统一补 `aria-hidden="true"`（图标纯装饰，可及名来自按钮的 aria-label）。 |
| `variant` | `'card' \| 'plain'` | `'card'` | - | 外观形态，默认 `'card'`（行为完全不变）：<br>- `'card'`：圆角描边卡片 + 阴影 + 悬停/聚焦主色描边，适合居中对话页里「浮在内容之上」的输入框；<br>- `'plain'`：去掉边框 / 圆角 / 阴影 / 悬停与聚焦描边，只保留内边距与布局，适合侧边栏、移动端、全屏页这类**贴边通栏**形态（分隔线交由宿主自己画，位置与颜色各家不同）。<br>配合 `--aix-sender-padding` / `--aix-sender-gap` / `--aix-sender-input-padding` / `--aix-sender-toolbar-padding` 四个尺寸旋钮，通栏形态基本不必再写 `:deep`。 |

### Sender Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `v: string` | 输入框文本变化（v-model 同步） |
| `submit` | `v: string, attachments?: AttachmentItem[], meta?: SubmitMeta` | 提交发送：text 当前文本（可为空串=纯附件发送）；attachments 仅在启用附件且有已传完条目时存在。 error 态附件不随本次发送消耗，留在预览区等待用户重试或删除。 |
| `cancel` | - | 取消 / 停止（loading 态下点停止按钮触发） |

### Sender Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `header` | `props: SenderSlotScope` | 输入行上方的扩展区（附件预览 / 引用上下文等） |
| `attachments-panel` | `props: SenderAttachmentsSlotScope` | 替换内置附件面板 UI（仅在启用附件且面板展开时渲染），见 SenderAttachmentsSlotScope。刻意**不叫** `attachments`：Vue 的组件类型会把同名 slot 与 prop 合并成交叉类型，与 `attachments` prop 撞名会让该 prop 变得无法赋值（vue-tsc 报 not assignable to 'undefined'）。 |
| `attachments-placeholder` | `props: SenderAttachmentsPlaceholderSlotScope` | 只替换**内置**附件面板里的上传占位区（比整块接管 `attachments-panel` 轻得多：拖放高亮、文件卡片列表、进度与重试全部保留）。仅在走内置面板时生效。 |
| `prefix` | `props: SenderSlotScope` | 输入框前缀区（输入行左侧） |
| `toolbar` | `props: SenderSlotScope` | 工具栏内容，渲染在内置 toolbarItems 之后、发送键之前 |
| `footer` | `props: SenderSlotScope` | 工具栏之下的底部扩展区（字数统计 / 快捷键提示等） |

---

**SenderSkeleton** — 输入框骨架屏：与 Sender 同结构的纯装饰占位（输入行 + 工具栏）。

### SenderSkeleton

暂无对外 API。

---

**Welcome** — 对话开场页：图标 / 标题 / 描述三段，各段都可用插槽替换。

### Welcome Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `icon` | `string` | - | - | 顶部图标图片地址（可用 icon 具名 slot 覆盖） |
| `title` | `string` | - | - | 标题文案（可用 title 具名 slot 覆盖） |
| `description` | `string` | - | - | 描述文案（可用 description 具名 slot 覆盖） |
| `align` | `'center' \| 'start'` | `'center'` | - | 对齐方式：center 居中空态（默认）/ start 左对齐（用于带在顶部的引导语） |
| `fillHeight` | `boolean` | - | - | 是否用 flex 上下 auto margin 在纵向撑满的容器（如 AiChat body）中垂直居中，默认跟随 `align`（`center` → `true`，`start` → `false`）。<br>与 `align` **正交**：显式传入本 prop 即可覆盖上述默认，两个维度任意组合—— 如「左对齐 + 垂直居中」（面板顶部左对齐、但仍在空白区居中的引导语）传 `align="start"` + `:fill-height="true"`。 |

### Welcome Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `icon` | - | 顶部图标，覆盖 icon prop 的图片 |
| `title` | - | 标题，覆盖 title prop |
| `description` | - | 描述文案，覆盖 description prop |
| `extra` | - | 描述下方的附加区（如快捷问题） |

---

**Prompts** — 推荐问题列表：点击某条抛出 select，AiChat 用它做开场引导。

### Prompts Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `PromptItem[]` | - | ✅ | 快捷问题列表 |

### Prompts Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `select` | `item: PromptItem` | 点击某个快捷问题 |

---

**Thinking** — 深度思考折叠面板：承载模型的推理过程文本，标题 / 图标 / 箭头 / 正文均可替换。

### Thinking Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `content` | `string` | `''` | - | 思维链内容（可用默认 slot 覆盖） |
| `title` | `string` | - | - | 折叠面板标题，未传时回退 i18n 文案 |
| `expanded` | `boolean` | `false` | - | 初始是否展开，默认 false |
| `variant` | `'card' \| 'capsule' \| 'plain'` | `'card'` | - | 外观形态，默认 `'card'`（行为完全不变）：<br>- `'card'`：整体一个描边卡片，头部撑满、与正文之间一条分隔线；<br>- `'capsule'`：头部收成 hug 宽度的胶囊（不再撑满一行），正文独立成一个圆角浅底块—— 当下多数 AI 产品的思考区就长这样；<br>- `'plain'`：不带任何容器视觉，只保留折叠行为与间距，交给宿主完全自绘。 |

### Thinking Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `icon` | `props: { open: boolean }` | 标题前的图标区（无内置默认内容，不提供时不占位） |
| `title` | `props: { open: boolean }` | 标题区（覆盖 title / i18n 回退文案） |
| `arrow` | `props: { open: boolean }` | 展开箭头（覆盖内置 ▾ 字符） |
| `default` | `props: { open: boolean }` | 折叠面板正文（覆盖 content 文本渲染） |

---

**ThoughtChain** — 思维链：多个步骤按时序纵向排列，每步带状态与可选结果。

### ThoughtChain Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ThoughtChainItem[]` | `[]` | - | 思维链步骤列表 |
| `title` | `string` | - | - | 链级头部标题（如「已完成」「生成中…」）；提供后在步骤列表上方渲染一行汇总头部 |
| `collapsible` | `boolean` | `false` | - | 是否可点击头部折叠/展开整个步骤列表（需配合 title），默认 false |
| `defaultCollapsed` | `boolean` | `false` | - | 初始是否折叠整链（需 collapsible），默认 false |
| `loading` | `boolean` | `false` | - | 生成中：汇总标题显示主色流光（如「生成中…」），默认 false |

### ThoughtChain Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `item-content` | `props: { item: ThoughtChainItem; index: number }` | 单个步骤的正文，作用域 item / index；默认按 Markdown 渲染 item.content |

---

**ModelSelector** — 模型选择下拉框：受控的 modelValue + options 列表。

### ModelSelector Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `modelValue` | `string` | - | - | 当前选中的 model value（v-model）。可选；不传走非受控，由组件内部维护选中态。注意：不要设默认值——受控/非受控判定依赖此 prop 是否为 undefined（兼容 Vue 3.3 的 emit-only useModel），默认值交由 useControllable 的 defaultValue 兜底。 |
| `options` | `ModelOption[]` | - | ✅ | 可选模型列表 |
| `placeholder` | `string` | `''` | - | 未选中时占位文案 |
| `placement` | `'top' \| 'bottom'` | `'bottom'` | - | 下拉展开方向，默认 bottom；位于面板底部时用 top 向上弹出 |
| `loading` | `boolean` | `false` | - | 选项加载态：为 true 且下拉展开时，菜单渲染骨架占位而非真实选项，默认 false |

### ModelSelector Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `update:modelValue` | `value: string` | 选中的 model value 变化（v-model） |

---

**MarkdownRenderer** — Markdown 渲染器：流式安全的增量渲染，可注入自定义块渲染器与 markdown-it 插件。

### MarkdownRenderer Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `content` | `string` | `''` | - | 待渲染的 Markdown 文本 |
| `streaming` | `boolean` | `false` | - | 流式渲染态：开启后对可能半截的内容做防闪烁整修（隐去未闭合 $$/\[、补围栏、隐末行残链），默认 false。完整文本（非流式）保持 false 以原样渲染。 |
| `markdownRenderers` | `Record<string, MarkdownRenderer>` | `{}` | - | markdown token 渲染器注册表（扩展/覆盖内置块渲染，如 fence/math/自定义），优先级高于内置 |
| `allowHtml` | `boolean` | `false` | - | 是否允许渲染原始 HTML（经 sandbox iframe 隔离渲染：allow-scripts，无 allow-same-origin），默认 false |
| `mdPlugins` | `MarkdownItPlugin[]` | - | - | 注入的 markdown-it 插件（扩展新语法，如脚注 / 容器 / 任务列表）。<br>引擎按「本数组引用 + allowHtml」缓存：同一引用跨气泡共享同一引擎，换引用即重载。因此**务必传稳定引用**——每次渲染新建数组字面量会让每帧都装配一个新引擎。 |

---

**AiChat** — 开箱即用的对话组件：把 Welcome / BubbleList / Sender 与流式请求接线在一起。

### AiChat Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `request` | `UseChatOptions['request']` | - | ✅ | 发起请求，返回字节流或 Response（必填）。<br>**每次发请求那一刻才读取本 prop，运行时替换即刻生效**——内部并非把它快照进 useChat，而是转发一层闭包 `(ctx) => props.request(...)`（见下方 useChat 接线处）。因此「对话中途换模型 / 换后端」不需要 `:key` 强制重建 AiChat，在自己的 request 实现里读一个响应式变量即可，用法见 README「自定义协议 / 换模型」。<br>仅当新旧后端的**流格式也不同**时才需要连同 parseChunk 一起换，那种场景才必须重建实例。 |
| `streamMode` | `'sse' \| 'line'` | `'sse'` | - | 流分帧模式（'sse' / 'line'）；透传给 useChat。每次请求才读取，运行时可改 |
| `parseChunk` | `UseChatOptions['parseChunk']` | - | - | 流单元 → 增量解析器，默认扁平 SSE；对接 OpenAI/Anthropic 传 openaiParseChunk/anthropicParseChunk。透传给 useChat。<br>与 `request` 同口径：内部转发一层闭包，**每个流单元才读取本 prop**，故「换后端顺带换流格式」 直接改这两个 prop 即可，无需 `:key` 重建实例。 |
| `parser` | `UseChatOptions['parser']` | - | - | 渲染消息转换器（解耦后端格式与展示形状，1→1，须保留消息 id）；透传给 useChat。静态配置 |
| `defaultMessages` | `UseChatOptions['defaultMessages']` | - | - | 初始历史消息 |
| `historyLoading` | `boolean` | `false` | - | 历史消息加载中：true 时消息区渲染骨架屏（占位假气泡），而不是空消息态的 Welcome 或真实 BubbleList；用于业务从远端异步恢复会话历史时的过渡态（如接入 useConversations 异步 storage.load，配合其 isLoading 传入本 prop）。默认 false（不生效时行为不变： messages 为空显示 Welcome，否则显示 BubbleList）。透传给 BubbleList 的 loading prop。 |
| `localeMessages` | `Partial<AiChatLocale>` | - | - | 实例级文案覆盖（Partial 浅合并，优先级最高，只影响本实例及其内部子组件）。全应用统一定制请用 `createLocale(locale, { messages: { 'ai-chat': {...} } })`；单独使用 Sender / Bubble 等导出子组件时可改用 provideAiChatLocaleMessages 注入。注意模板类 key（如 thoughtDurationSuffix 的 {s}）覆盖时必须保留占位符。 |
| `input` | `string` | - | - | 输入框文本（v-model:input）。可选；不传则走非受控，由组件内部维护草稿。注意：不要设默认值——为兼容 Vue 3.3（useModel emit-only 语义），受控/非受控的判定依赖此 prop 是否为 undefined，交由 useControllable 的 defaultValue 兜底。 |
| `roles` | `Record<string, RoleConfig>` | - | - | 角色气泡样式映射，优先级高于 provideAiChatConfig 的全局 roles |
| `shouldFollow` | `(ctx: FollowContext) => boolean` | - | - | 滚动跟随策略，优先级高于 provideAiChatConfig 的全局 shouldFollow |
| `tailBreathing` | `boolean \| { idleMs?: number }` | - | - | 末尾静默呼吸：流式输出停顿时末块文字明暗呼吸，提示「仍在生成」。`true` 用默认 3000ms 阈值；传 `{ idleMs }` 自定义。优先级高于 provideAiChatConfig 的全局 tailBreathing。 |
| `outline` | `boolean \| OutlineOptions` | - | - | 对话大纲导航：右侧提问刻度条，点击定位到对应提问。`true` 用默认配置；传对象可定制窗口半径 / 入选规则 / 摘要提取。优先级高于 provideAiChatConfig 的全局 outline。 |
| `blockRenderers` | `Record<string, Component>` | - | - | 块渲染器注册表（扩展/覆盖内置 text/reasoning 渲染），优先级高于 provideAiChatConfig 的全局 blockRenderers |
| `toolRenderers` | `Record<string, Component>` | - | - | 工具调用（tool_use）渲染器注册表，按 toolName 路由，优先级高于 provideAiChatConfig 的全局 toolRenderers |
| `prompts` | `PromptItem[]` | - | - | 欢迎页快捷问题，点击后以其 label 作为消息自动发送 |
| `headerTitle` | `string` | - | - | 顶部标题栏标题文案；传入（或提供 header* 插槽）时渲染标题栏，默认不渲染 |
| `headerIcon` | `string` | - | - | 顶部标题栏图标图片地址（可用 header-icon 具名插槽覆盖） |
| `welcomeTitle` | `string` | - | - | 欢迎页标题（空消息态展示）。等价于 `welcome.title`，两者同时存在时以 `welcome` 为准 |
| `welcomeDescription` | `string` | - | - | 欢迎页描述文案（空消息态展示）。等价于 `welcome.description`，两者同时存在时以 `welcome` 为准 |
| `welcome` | `{ icon?: string; title?: string; description?: string; align?: 'center' \| 'start'; fillHeight?: boolean; }` | - | - | 欢迎页配置。`title` / `description` 与扁平的 `welcomeTitle` / `welcomeDescription` 等价 （本对象优先），另外开放三项只能从这里配置的能力：<br>- `icon`：Welcome 的图标图片地址（也可用 `#welcome-icon` 插槽）；<br>- `align`：`'center'`（默认）/ `'start'` 左对齐引导语；<br>- `fillHeight`：是否用 `margin: auto 0` 在 body 内垂直居中，默认跟随 `align`。<br>后两项 Welcome 组件本就支持且互相正交，只是一直没接线到这一层，于是「左对齐欢迎语」 这种常见形态只能靠覆写 `.aix-welcome--center` / `.aix-welcome.is-fill-height` 反向实现。 |
| `placeholder` | `string` | - | - | 输入框占位提示，缺省取 locale.senderPlaceholder |
| `submitType` | `'enter' \| 'shiftEnter'` | `'enter'` | - | 输入框提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之；透传给 Sender |
| `actions` | `ActionsItems \| ((message: ChatMessage) => ActionsItems \| null)` | `['copy', 'regenerate']` | - | 消息操作条配置。数组形态：仅对 role==='ai' && status==='success' 的消息渲染；函数形态：对每条消息调用，返回 items 则渲染、null/[] 不渲染（可按状态/角色细控）。设为 [] 关闭默认操作条；#footer slot 提供时优先（覆盖机制不变）。函数形态应为纯函数（同输入同输出）；返回值随消息 status 响应式更新。 |
| `actionsTrigger` | `'always' \| 'hover'` | `'always'` | - | 消息操作的显示时机：'always' 常驻显示（默认），'hover' 仅悬浮气泡或键盘聚焦内部按钮时显示（触屏设备始终显示）。<br>'hover' 作用于气泡内带 `data-aix-hover-reveal` 标记的元素——内置操作条自带该标记；用 `#footer` 自绘操作条时，给自己的根节点加上同一属性即可同样生效。 footer 内的常驻内容（图表卡 / 参考资料等）不加标记即不参与显隐。 |
| `errorText` | `(message: ChatMessage) => string` | - | - | 出错态内置错误条的文案解析，默认回退 `locale.errorMessage`。<br>`request` / `parseChunk` 抛出的原始错误存在 `message.extra.error` 里，但**默认不直出**：那里可能是 `TypeError: Failed to fetch` 之类的内部信息，直接展示给终端用户是负收益。想透出后端返回的具体原因（限流、鉴权、内容审核等业务错误）时显式声明本函数即可，无需为此接管整个 `#error` 插槽（示例见 README「消息级插槽」）。<br>返回空串等同未提供（回退 i18n 文案）。仅对 `status === 'error'` 的消息调用。 |
| `retryTimes` | `number` | `0` | - | 请求失败自动重试次数（不含首次）；透传给 useChat。abort 不触发重试。运行时可改 |
| `retryInterval` | `number` | `1000` | - | 两次重试间隔（ms）；透传给 useChat。运行时可改 |
| `continuePrompt` | `string` | `'请从刚才中断的地方继续往下写，不要重复已经写过的内容。'` | - | 继续生成（continueGenerate）时，发给模型的隐藏续写指令文案；透传给 useChat。运行时可改 |
| `streamTimeout` | `number` | `0` | - | 流静默超时（ms），0 为关闭：超过该时长无新数据判为卡死（可重试错误）；透传给 useChat。每次 attempt 起表时取值，运行时可改 |
| `markdownRenderers` | `Record<string, MarkdownRenderer>` | - | - | markdown token 渲染器注册表（扩展/覆盖气泡内 markdown 块渲染），优先级高于全局同名配置。运行时可改（经下方 provide 的响应式配置对象下发） |
| `allowHtml` | `boolean` | `false` | - | 是否允许渲染原始 HTML（经 sandbox iframe 隔离渲染：allow-scripts，无 allow-same-origin）；注入到气泡内 MarkdownRenderer。运行时可改（切换时引擎按新模式重载） |
| `mdPlugins` | `MarkdownItPlugin[]` | - | - | 注入的 markdown-it 插件（扩展新语法，如脚注 / 容器 / 任务列表）；注入到气泡内 MarkdownRenderer。与 markdownRenderers 互补：插件加新 tokenization，markdownRenderers 改 token 渲染。<br>运行时可改，但**务必传稳定引用**：markdown 引擎按「插件数组引用 + allowHtml」缓存，每次渲染新建数组字面量会让每帧都装配一个新引擎。 |
| `attachments` | `UseAttachmentsOptions \| UseAttachmentsReturn` | - | - | 附件能力（opt-in），原样透传 Sender；不传则无任何附件 UI。静态配置<br>两种传法与 `SenderProps.attachments` 完全一致（本层只是直通，不做任何加工）：<br>- **配置对象**（`UseAttachmentsOptions`）：由 Sender 内部 `useAttachments`，最省事；<br>- **已创建的实例**（`UseAttachmentsReturn`）：宿主自己持有 items / `clear()` 等状态与句柄。<br>传实例的典型需求：面板以 v-if 卸载时把已上传未发送的附件回收掉（`useAttachments` 的 scope 销毁会逐条走 onRemove，但宿主也可能想更早地手动 `clear()`）。 |
| `voice` | `boolean \| VoiceConfig` | - | - | 语音输入（opt-in），透传 Sender；不传则无麦克风按钮。静态配置 |
| `speech` | `boolean \| SpeechConfig` | - | - | 语音播报（opt-in），透传内置 useSpeech；不传则无朗读按钮、不自动播报。 true=全默认（speechSynthesis）；对象=自定义合成器 / autoPlay / getText 等。静态配置注意：actions 为函数形态时不会自动追加内置 speak 项，需业务在返回数组中自行包含 'speak'；数组/默认形态会自动为 ai+success 且有可朗读文本的消息追加。 |
| `tree` | `ExportedTree` | - | - | 对话树（v-model:tree）：分支感知的持久化通道，绑 useConversations.activeTree。不传则不参与树级持久化。同时绑 v-model:messages 与 v-model:tree 时以 tree 为准；推荐持久化场景用 tree，两者择一。<br>`update:tree` 只在四个离散时刻触发（结构变化 / 请求落终态 / 交互块回写 / 赞踩写回）， **流式逐 chunk 不触发**。自定义持久化前请读 README「`update:tree` 的触发口径」—— 只按「结构变化」落库会静默丢掉整轮回复内容。 |
| `treeMode` | `boolean` | - | - | 显式声明是否以 `tree` 为权威持久化通道（默认由是否绑定 `v-model:tree` 自动推断）。<br>为真时：`messages` 只作只读镜像输出、不再反向导入内部树（两条桥接同时回写会让 messages model 被 prop 回灌成 `[]`，进而清空整棵树）。<br>自动推断读的是编译后的 vnode props（`'onUpdate:tree' in props`），覆盖 `v-model:tree` / 单向 `:tree` 两种写法，绝大多数场景无需管本 prop。仅当推断不适用时才显式声明——典型是用 `h()` / JSX 手写 vnode、或经高阶组件 `v-bind="$attrs"` 中转导致监听器形态不同。 |
| `quote` | `QuoteConfig \| boolean` | - | - | 划词引用/追问（opt-in，默认关闭）。true 开启默认能力；false 关闭；对象按 QuoteConfig 细配并默认视为开启，与全局 provideAiChatConfig().quote 合并（props 优先）。<br>响应式粒度是**混合**的（不可一概按「setup 快照」理解，故逐项写明）：<br>- 运行时可变：`enable` / `roles` / `actions` / `pcQuoteAction` / `maxVisibleChips` / `toPrompt` / `toolbar` / `sheet` —— 均在使用那一刻经 getter 或 computed 读取；<br>- setup 快照：`longPressDelay` / `keyboard` / `excludeSelector` —— 在 useTextSelection 装配时一次性取值（见 useQuoteBinding 传参处），运行时改需重建组件。 |
| `triggers` | `TriggerConfig[]` | - | - | 触发菜单配置（@提及/斜杠命令），直通 Sender；静态配置 |
| `toolbarItems` | `SenderToolbarItems` | `['attach', 'voice']` | - | 工具栏项（内置 attach/voice + 自定义对象混排），直通 Sender |
| `autoSpacer` | `boolean` | `true` | - | 未显式放置 'spacer' 时是否自动在发送键前补一个隐式 spacer，直通 Sender。见 `SenderProps.autoSpacer` 说明。 |
| `senderIcons` | `SenderIcons` | - | - | 覆盖 Sender 内置按钮图标（附件 / 语音 / 发送 / 停止），直通 Sender 的 `icons` prop。<br>命名上刻意加 `sender` 前缀、不沿用同名直通的惯例（`toolbarItems` / `triggers` 那样）： AiChat 这一层还有消息操作条图标（`ActionItem.icon`）、划词菜单图标等多套图标，裸叫 `icons` 会被读成「全局图标表」，与实际作用域不符。 |
| `senderVariant` | `SenderVariant` | `'card'` | - | 输入框外观形态，直通 Sender 的 `variant`。侧边栏 / 移动端 / 全屏页这类贴边通栏形态传 `'plain'`，配合 `--aix-ai-chat-sender-margin: 0` 与 `--aix-sender-*` 尺寸旋钮即可，无需覆写 `.aix-sender`。命名前缀同 `senderIcons`（这一层还有别的 variant 概念，裸叫 variant 会读成组件整体形态）。 |
| `reasoningVariant` | `'card' \| 'capsule' \| 'plain'` | `'card'` | - | 深度思考（reasoning 块）折叠面板的外观形态；`'capsule'` 为 hug 宽度胶囊头 + 独立正文块（多数 AI 产品的当下形态），`'plain'` 无容器视觉。经 provideAiChatConfig 注入（ReasoningBlock 由注册表实例化、接不到 prop）；运行时可改 |
| `suggestions` | `boolean \| { fillOnly?: boolean; max?: number }` | - | - | 追问建议（opt-in）：true 全默认；对象可配 fillOnly（点击仅回填不发送）/ max（上限，默认 5）。联合类型含 boolean：withDefaults 必须显式 default undefined（同 quote 的坑） |
| `messages` | `ChatMessage[]` | `[]` | - | 消息列表（v-model:messages）：受控模式下由父组件接管，用于持久化 / 外部清空 / 跨组件共享 |

### AiChat Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `send` | `text: string, attachments?: AttachmentItem[], meta?: SubmitMeta` | 用户发送消息（含点击快捷问题），携带文本与可选附件、可选扩展元信息（如 mention 实体） |
| `finish` | `message: ChatMessage` | 单条 AI 回复成功完成，携带该消息 |
| `error` | `message: ChatMessage` | 请求出错，携带该消息 |
| `abort` | `message: ChatMessage` | 被中断，携带该消息 |
| `copy` | `message: ChatMessage` | 复制某条 AI 回复（默认操作触发），携带该消息 |
| `copy-source` | `message: ChatMessage` | 复制某条 AI 回复的原始 markdown 源码（opt-in 的 copySource 操作触发），携带该消息 |
| `block-action` | `payload: BlockActionPayload` | 交互块动作上抛（如单选作答 / 编辑保存），供业务方做持久化 / 判分 |
| `block-intent` | `payload: BlockIntentPayload` | 交互块**意图**上抛（如确认卡点提交），供业务方处置——组件库不据此改动任何数据。与 block-action 的分工见 BlockIntent 类型注释：action 是「改我的数据」（自动落地）， intent 是「我需要你做件事」（如带 Last-Event-ID 的续流），落地与否完全由业务决定。 |
| `edit` | `payload: { id: string; text: string }` | 用户消息编辑保存（已截断后续并重新生成），携带 id 与新文本 |
| `delete` | `message: ChatMessage` | 请求删除某条消息（只上抛，不改动 messages/分支树——是否真的移除、是否同步后端，完全交给业务） |
| `feedback` | `payload: { id: string; value: MessageFeedback \| null }` | AI 回复赞/踩反馈变化，携带 id 与值（null 取消），供业务持久化 |
| `typing-complete` | `id: string` | 某条 AI 消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） |
| `update:input` | `value: string` | 输入框文本变化（v-model:input），由 useControllable 在受控/非受控两态下统一上抛 |
| `update:messages` | `value: ChatMessage[]` | 消息列表镜像变化（v-model:messages）。由 defineModel 声明，此处补记入本接口是因为 AiChatEmits 是对外导出的公共类型：业务写高阶包装组件 `defineEmits<AiChatEmits>()` 做转发时，漏了它就转发不出去。 |
| `update:tree` | `value: ExportedTree` | 对话树结构变化（v-model:tree），用于持久化分支 |
| `suggestion-select` | `item: SuggestionItem` | 点击追问建议（发送/回填之前触发，供埋点） |

### AiChat Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `header` | - | 顶部标题栏整体，覆盖默认的「图标 + 标题 + extra」布局 |
| `header-icon` | - | 标题栏图标，覆盖 headerIcon 图片 |
| `header-extra` | - | 标题栏右侧附加区（关闭按钮等） |
| `welcome-icon` | - | 欢迎页图标（透传 Welcome 的 icon 插槽） |
| `welcome-title` | - | 欢迎页标题（透传 Welcome 的 title 插槽） |
| `welcome-description` | - | 欢迎页描述（透传 Welcome 的 description 插槽） |
| `welcome-extra` | - | 欢迎页附加区，渲染在快捷问题之后 |
| `content` | `props: BubbleListContentSlotScope` | 气泡内容区，覆盖默认渲染（透传 BubbleList 的 content 插槽） |
| `bubble-header` | `props: BubbleListItemSlotScope` | 气泡内的消息级头部（发送者名 / 时间戳 / 徽标），跟随气泡对齐 |
| `row-before` | `props: BubbleListRowSlotScope` | 气泡所在行之前的整行区域（居中时间戳 / 日期分隔线） |
| `error` | `props: BubbleListErrorSlotScope` | 出错态自定义 UI，作用域含 item、error 与 retry |
| `footer` | `props: AiChatFooterSlotScope` | 气泡下方的操作条，作用域含 item、branch、speaking 与已接线的 actions 句柄；提供后覆盖内置 BubbleActions |
| `quote-menu` | `props: AiChatQuoteMenuSlotScope` | 划词引用菜单，作用域含 items / invoke / close / mode / selection / trigger；默认渲染内置 QuoteMenu |
| `sender-before` | - | 消息区与输入框之间的自由区（横幅 / 提示），不在 Sender 盒内 |
| `sender-header` | `props: SenderSlotScope` | Sender 顶部扩展区，与内置引用 chips 追加共存（透传 Sender 的 header 插槽） |
| `toolbar` | `props: SenderSlotScope` | Sender 工具栏（透传 Sender 的 toolbar 插槽） |
| `prefix` | `props: SenderSlotScope` | 输入框前缀区（透传 Sender 的 prefix 插槽） |
| `sender-footer` | `props: SenderSlotScope` | Sender 底部扩展区，工具栏之下（透传 Sender 的 footer 插槽） |
| `attachments-panel` | `props: SenderAttachmentsSlotScope` | 自定义附件面板 UI（透传 Sender 的同名插槽） |
| `attachments-placeholder` | `props: SenderAttachmentsPlaceholderSlotScope` | 只替换内置附件面板的上传占位区（透传 Sender 的同名插槽） |
| `bottom` | - | 整个组件最底部（Sender 之下）的常驻区，如免责声明 |

---

**Conversations** — 会话列表：分组、搜索、新建，以及单条会话的重命名与删除。

### Conversations Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ConversationItem[]` | - | ✅ | 会话列表元数据（来自 useConversations.items） |
| `loading` | `boolean` | `false` | - | 加载态：为 true 时列表区域渲染骨架占位，忽略 items，默认 false |
| `groupable` | `boolean` | `false` | - | 是否按 group 字段分组渲染，默认 false |
| `searchable` | `boolean` | `false` | - | 是否显示内置搜索框（按 label 模糊匹配、大小写不敏感，纯本地过滤），默认 false |
| `searchPlaceholder` | `string` | - | - | 搜索框 placeholder，缺省取 locale |
| `newButtonText` | `string` | - | - | 新建按钮文案，缺省取 locale |
| `activeKey` | `string` | - | - | 当前激活会话 id（v-model:activeKey）。可选；不传走非受控，由组件内部维护选中态。注意：不要设默认值——受控/非受控判定依赖此 prop 是否为 undefined（兼容 Vue 3.3 的 emit-only useModel），默认值交由 useControllable 的 defaultValue 兜底。 |

### Conversations Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `create` | - | 点击新建 |
| `rename` | `id: string, label: string` | 重命名（行内编辑确认），携带 id 与新标题 |
| `delete` | `id: string` | 删除会话，携带 id |
| `update:activeKey` | `id: string` | 激活会话变化（v-model:activeKey） |

### Conversations Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `item` | `props: ConversationsItemSlotScope` | 替换整行内容（行容器与 is-active 仍由组件持有）；重命名态优先于本插槽 |
| `item-actions` | `props: ConversationsItemSlotScope` | 仅替换操作按钮区，保留内置标题按钮；`#item` 提供时本插槽不生效 |
| `empty` | `props: { searching: boolean }` | 空态；searching 为 true 表示「有会话但搜索无结果」，false 表示「一条会话都没有」 |

---

**Skeleton** — 骨架屏占位：按 rows 出多行条，或按 aspectRatio 出一个占位块。

### Skeleton Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `loading` | `boolean` | `true` | - | 是否展示骨架占位（false 时渲染默认插槽的真实内容），默认 true |
| `rows` | `number` | - | - | 行模式：渲染 N 行文本占位（末行短行）；与 height/aspectRatio 互斥，优先生效 |
| `height` | `string` | `'96px'` | - | 块模式高度（如 '120px'） |
| `aspectRatio` | `string` | - | - | 块模式宽高比（如 '2 / 1'），设置后优先于 height |

### Skeleton Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | - | loading 为 false 时渲染的真实内容 |

---

**LoadingDots** — 三点跳动的加载指示。

### LoadingDots

暂无对外 API。

---

**QuoteMenu** — 划词引用菜单的外壳：按 mode 选用悬浮工具条或列表面板皮肤，并统一转发操作。

### QuoteMenu Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ResolvedQuoteAction[]` | - | ✅ | 菜单动作列表（已解析为可直接渲染的项） |
| `source` | `'pointer' \| 'keyboard' \| 'longpress'` | - | ✅ | 本次触发来源 = 唯一平台事实：longpress → sheet，pointer/keyboard → toolbar |
| `mode` | `'menu' \| 'selecting'` | - | ✅ | 'menu' 显示动作菜单；'selecting' 表示选区仍在调整中 |
| `getRect` | `() => DOMRect` | - | - | 选区包围盒（toolbar 锚点，source=pointer/keyboard 时必传） |
| `point` | `{ x: number; y: number }` | - | - | 长按触点（sheet 锚点，source=longpress 时必传） |
| `contextEl` | `HTMLElement \| null` | - | - | 虚拟锚点宿主元素（透传给皮肤的 contextEl）：供 autoUpdate 挂滚动祖先监听 |
| `toolbar` | `Component` | - | - | 深度换肤：仅替换单端皮肤，L2 逻辑复用 |
| `sheet` | `Component` | - | - | 深度换肤：替换 sheet（长按）端皮肤 |

### QuoteMenu Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `invoke` | `key: string` | 点击某个动作，参数为动作 key |
| `close` | - | 关闭菜单 |

---

**QuoteChip** — 输入框上方的引用 chip：点正文定位回原文，点关闭移除该条引用。

### QuoteChip Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `quote` | `Quote` | - | ✅ | 引用数据 |

### QuoteChip Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `remove` | - | 点击删除该引用 |
| `locate` | `quote: Quote` | 点击主体回链定位到原文 |

---

**TriggerMenu** — 输入框的触发菜单：@提及 / 斜杠命令等按字符触发的候选列表。

### TriggerMenu Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `TriggerItem[]` | - | ✅ | 候选项（已由 Sender 侧解析/过滤完成） |
| `loading` | `boolean` | - | ✅ | 异步 items 加载中 |
| `activeIndex` | `number` | - | ✅ | 受控高亮下标（键盘导航由 Sender keydown 驱动，焦点不进菜单） |
| `menuId` | `string` | - | ✅ | listbox 的 DOM id；选项 id 约定为 `${menuId}-option-${i}`，供 aria-activedescendant |
| `getAnchorRect` | `() => DOMRect` | - | ✅ | 虚拟锚点工厂：@ 用 caret rect、/ 用 Sender 整框 rect（含降级），由调用方决定 |
| `contextEl` | `HTMLElement \| null` | - | - | 虚拟锚点的宿主元素（floating-ui VirtualElement.contextElement）： autoUpdate 借此找到滚动祖先挂监听——缺省时锚点在可滚动容器内滚动不会触发重定位 |

### TriggerMenu Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `select` | `item: TriggerItem` | 选中某个候选项 |
| `update:activeIndex` | `i: number` | 键盘导航改变高亮项索引（v-model:activeIndex） |

---

**Suggestions** — 追问建议：一行可点的候选问题，加载期间出骨架屏。

### Suggestions Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `SuggestionItem[]` | - | ✅ | 建议项（已由上层归一化并截断） |
| `loading` | `boolean` | `false` | - | 建议生成中：为 true 时渲染占位胶囊，忽略 items |

### Suggestions Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `select` | `item: SuggestionItem` | 点击某条建议 |

### Suggestions Slots

| 插槽名 | 参数 | 说明 |
|--------|------|------|
| `default` | `props: { item: SuggestionItem }` | 单条建议的内容，作用域 item；默认显示 label 或 text |

---

**ContextWindow** — 上下文用量指示器：展示已用 / 总量，超过阈值转警告态，可触发压缩。

### ContextWindow Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `used` | `number` | `0` | - | 已用 token 数 |
| `total` | `number` | `0` | - | 上下文窗口总量 |
| `percent` | `number` | - | - | 展示用占比（0–1）。缺省由 used/total 计算；total 为 0 时按 0 处理（不产生 NaN/Infinity）。<br>后端只回百分比、不回 token 数时可只传本项：`total` 为 0 即视为「窗口总量未知」，摘要与用量文案一并退化为纯百分比，不会显示无意义的 `0/0`。 |
| `compressible` | `boolean` | `false` | - | 是否提供「压缩会话」入口，默认 false |
| `compressing` | `boolean` | `false` | - | 压缩进行中：按钮禁用并显示进行中文案 |
| `formatter` | `(n: number) => string` | - | - | 数值格式化，缺省按 k 单位（12000 → 12k） |
| `warnRatio` | `number` | `0.8` | - | 进入告警配色的占比阈值（0–1），默认 0.8 |

### ContextWindow Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `compress` | - | 用户点击压缩：组件不发请求，宿主自行处理并回写 used |

---

**MessageOutline** — 对话大纲：贴边的消息刻度条，点击跳到对应消息。

### MessageOutline Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `entries` | `OutlineEntry[]` | `[]` | - | 可见刻度条目（通常传 useMessageOutline 的 windowed） |
| `activeId` | `string` | - | - | 当前活跃条目的 messageId，决定高亮 |

### MessageOutline Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `select` | `entry: OutlineEntry` | 点击某条刻度：宿主负责滚动定位（组件不碰滚动容器） |

---

**QuoteToolbar** — 划词引用的工具条皮肤：贴选区浮动，操作横排成一条。

### QuoteToolbar Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ResolvedQuoteAction[]` | - | ✅ | L2 解析后的动作项 |
| `getAnchorRect` | `() => DOMRect` | - | ✅ | 定位锚：选区包围盒（视口坐标） |
| `contextEl` | `HTMLElement \| null` | - | - | 虚拟锚点宿主元素（VirtualElement.contextElement）：供 autoUpdate 挂滚动祖先监听 |

### QuoteToolbar Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `invoke` | `key: string` | 点击某个动作，参数为动作 key |
| `close` | - | 关闭工具栏 |

---

**QuoteSheet** — 划词引用的面板皮肤：贴选区浮动，操作纵向成列表，适合项数较多时。

### QuoteSheet Props

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
|--------|------|--------|:----:|------|
| `items` | `ResolvedQuoteAction[]` | - | ✅ | 动作列表（已解析为可直接渲染的项） |
| `getAnchorRect` | `() => DOMRect` | - | ✅ | 定位锚：长按触点（视口坐标）造零尺寸 rect |
| `contextEl` | `HTMLElement \| null` | - | - | 虚拟锚点宿主元素（VirtualElement.contextElement）：供 autoUpdate 挂滚动祖先监听 |

### QuoteSheet Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `invoke` | `key: string` | 点击某个动作，参数为动作 key |
| `close` | - | 关闭面板 |
