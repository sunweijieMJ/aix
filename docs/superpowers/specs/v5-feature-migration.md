# V5 能力迁移到 @aix/ai-chat 架构设计

来源：`/Users/sunweijie/workspace/zhs/ai-im-chat-h5` 的 V5Panel。目标：把其中 4 项**通用**能力下沉进组件库，剥离全部业务耦合（腾讯云 IM SDK、私有接口、全局 store、mitt bus、element-plus）。

## 总原则

1. **协议无关**：组件库不发任何请求、不碰 SSE 续流。数据进 props，意图出 emit。
2. **复用既有扩展点**，不新造机制：
   - 新块类型 → `ContentBlockRegistry`（`types.ts:403`）
   - 块渲染分发 → `Bubble.vue:253` `builtinRenderers`
   - 块内数据回写 → `BlockAction` → `onBlockAction` → `useChat.updateBlock`（链路已通，`AiChat.vue:869`）
   - 输入框挂载 → `Sender` 的 `toolbarItems`（已支持自定义组件混排，`Sender.vue:150`）
   - 滚动定位 → `BubbleList.scrollToBubble(messageId)`（已处理虚拟列表挂载竞态，`BubbleList.vue:264`）
   - 生命周期顶替 → 照 `sealReasoning`（`useChat.ts:136`）的幂等规则形状
3. **opt-in 配置走双通道**：照 `quote` 的先例（`AiChat.vue:449`）同时进 `AiChatConfig`（全局 provide）与组件 props，props 优先。默认值一律保持现有行为不变。
4. **动画一律尊重 `prefers-reduced-motion`**（当前包内 8 处 keyframes 均未处理，新增部分先立规矩）。
5. **DOM 观测加环境守卫**：照 `useAutoScroll.ts:205` 的 `typeof X === 'undefined'` 处理，否则 jsdom 下测试环境会炸。

实施顺序按风险从低到高：呼吸高亮 → 用量条 → 索引导航 → 确认卡。前两项无未决项。

## 新增：块意图通道 BlockIntent

确认卡的「点击提交」不是数据补丁，组件库无法自动落地，必须交宿主。现有 `BlockAction` 语义是「把 patch 合并进这个块」，不适用。

因为「专用 confirm 事件链」与「通用 intent 通道」的实现成本相同（同样一个事件穿过同样三层，仅类型宽窄之差），直接做通用版本，确认卡作为首个使用者。

```ts
/** 块意图信封：块上抛「需要宿主处置」的意图（非数据补丁），组件库不自动落地任何状态 */
export interface BlockIntent {
  blockId: string;
  /** 意图类型，由块自定义（如 'submit' | 'drill-down' | 'retry'） */
  type: string;
  payload?: unknown;
}
/** Bubble 向上转发的块意图载荷（携带所属消息 key） */
export interface BlockIntentPayload {
  messageKey: string | number;
  intent: BlockIntent;
}
export type BlockIntentHandler = (intent: BlockIntent) => void;
```

**两条通道的分工必须写进文档与类型注释**，否则后人会混用：

| 通道 | 语义 | 组件库行为 |
|---|---|---|
| `BlockAction` | 改我自己的数据 | 自动 `updateBlock` 落地 patch |
| `BlockIntent` | 我需要你做件事 | 不动数据，逐层转发到 `AiChat` 的 `block-intent` emit |

链路与 action 对称：块 `onBlockIntent` prop → `Bubble` 补 `messageKey` → `BubbleList` → `AiChat` emit。渲染器契约新增 `onBlockIntent`（可选 prop，与既有 `onBlockAction` 同形，不影响现有渲染器）。

确认卡两条都用：改答案走 action，点提交走 intent。

---

## 一、流式末尾呼吸高亮（风险最低）

### V5 做法

V5 用「坐标 + 长度指纹」判定流式停顿：3s 内末段 `(si, ri, type, len)` 五项不变则置 `tailTextBreathing`。不做 DOM 切分，段落粒度。

### 判定必须放在 Bubble 层（关键设计点）

**不能**放在 `TextBlock` 内用自身 `displayContent.length` 做指纹。ai-chat 一条消息是 `ContentBlock[]`，典型形态 `[text, tool_use, text]`：

- 第一个 `text` 块在 tool_use 开始流式后就不再增长
- 而 `info.status` 仍是 `updating`
- 于是它满足「streaming 且自身静默」→ **中间的文本块开始呼吸，真正在输出的末块反而不呼吸**

工具穿插是本库既定形态（`toolFollowLen` 就是为此存在），不是边缘 case。根因是 `Bubble.vue:52` 的 `v-for` 不向渲染器传下标或 `isLast`，块自身无法知道自己是不是末块。

放在 `Bubble` 层同时解决第二个问题：渲染器契约固定为 `block`/`info`/`typing`/`onBlockAction`/`toolRenderers`（`Bubble.vue:53-60`），`tailBreathing` 若要抵达 TextBlock 就得改契约、影响所有自定义渲染器。上移后它只需传到 Bubble 为止，且**自定义渲染器免费获得该行为**。

### 设计

新增 `composables/useIdleWhileStreaming.ts`：

```ts
export interface UseIdleWhileStreamingOptions {
  /** 是否处于流式态 */
  streaming: MaybeRefOrGetter<boolean>;
  /** 内容指纹：变化即视为「还在长」，重置计时 */
  fingerprint: MaybeRefOrGetter<string | number>;
  /** 静默阈值 ms，默认 3000 */
  idleMs?: MaybeRefOrGetter<number>;
}
/** 返回 isIdle：流式中且内容静默超阈值 → true；退出流式或内容再增长 → 立即 false */
export function useIdleWhileStreaming(opts: UseIdleWhileStreamingOptions): Readonly<Ref<boolean>>;
```

用 `@aix/hooks` 的 `useTimeout` 实现，避免手写定时器泄漏。

`Bubble.vue` 接入：
- `streaming` 取 `status === 'loading' || 'updating'`
- `fingerprint` **复用 `BubbleList.vue:328` 已有的口径** `块数:文本总长:toolFollowLen`，抽成 `utils/contentFingerprint.ts` 供两处共用（原处是自动滚动跟随用，语义完全一致）
- `isIdle` 为真时在气泡根节点挂 `is-tail-idle`

样式：`MarkdownRenderer.vue:254` 的 `&.is-streaming > :last-child::after` 已是「末块」语义的成熟做法，呼吸沿用同一思路——由 Bubble 根节点的 `.is-tail-idle` 后代选择器命中末块末元素做 color 呼吸。纯 CSS，无 DOM 操作。

**配置**：`BubbleProps.tailBreathing?: boolean | { idleMs?: number }` + `AiChatConfig.tailBreathing`，默认 `false`。

### 交付物
- `composables/useIdleWhileStreaming.ts` + 单测（假定时器：重置 / 退出流式立即取消 / 静默才置位）
- `utils/contentFingerprint.ts`（从 BubbleList 抽取，两处共用）
- `Bubble.vue` 判定 + 样式 + `prefers-reduced-motion` 降级
- `types.ts` 加 `tailBreathing`，`BubbleList`/`AiChat` 透传 + `AiChatConfig` 通道
- 单测：**多块消息场景**（`[text, tool_use, text]` 只有末块呼吸——这是本节的核心回归用例）
- story：`TailBreathing.stories.ts`（模拟流中途停顿 + 工具穿插）

---

## 二、上下文用量条 ContextWindow（纯受控）

### 设计（已确认：纯受控 + compress 事件）

V5 版自己打 `getCurrentContext` / `memoryCompression` 两个私有接口，全部剥离。

新增 `components/ContextWindow.vue`：

```ts
export interface ContextWindowProps {
  /** 已用 token 数 */
  used: number;
  /** 上下文窗口总量 */
  total: number;
  /** 展示百分比，缺省由 used/total 计算 */
  percent?: number;
  /** 是否提供「压缩会话」入口，默认 false */
  compressible?: boolean;
  /** 压缩进行中：按钮禁用 + loading */
  compressing?: boolean;
  /** 数值格式化，缺省按 k 单位（12000 → 12k） */
  formatter?: (n: number) => string;
  /** 高water mark：超过该比例进入告警配色，默认 0.8 */
  warnRatio?: number;
}
export interface ContextWindowEmits {
  /** 用户点击压缩，宿主自行发请求并回写 used */
  (e: 'compress'): void;
}
```

- 触发器为一枚图标 + `xxk/yyk`，hover/click 展开 `@aix/popper` 弹层（复用包内既有 popper 依赖，不自己写弹层定位与 outside-click）。
- V5 那两处细节值得保留：**先拿数再展开**（避免数字 0 跳变）由宿主控制 loading 即可；`::before` 补空隙防 mouseleave 抖动 popper 已处理。
- 无请求、无全局状态，`compress` 纯外抛。

**挂载方式**：不改 `Sender`，业务侧作为 `ToolbarItem` 注入：
```ts
toolbarItems: ['attach', 'voice', { key: 'ctx', component: ContextWindow, props: { used, total } }]
```

### 交付物
- `components/ContextWindow.vue` + `index.ts` 导出 + locale 文案（`contextWindowLabel` / `contextCompress` / `contextCompressing`）
- 单测（百分比计算、warnRatio 配色、compressible=false 不渲染按钮、compress emit）
- story：含 toolbarItems 集成示例

---

## 三、对话大纲导航 MessageOutline（中等改造）

> 命名：V5 叫 `ChatMessageIndex`，但 "index" 在本库语境会与真实数组下标混读（`parsedMessages` 里到处是 index）。定名 `MessageOutline`；`Nav` 被否是因为包内不用缩写（是 `ModelSelector` 而非 `ModelSel`）。配套 `useMessageOutline` / `OutlineEntry` / `AiChatConfig.outline`。

### V5 做法与取舍

三个机制，逐一评估：

| V5 机制 | 是否移植 | 理由 |
|---|---|---|
| 滑动窗口（`chatIndex ± 8`） | ✅ | 长会话下刻度条不爆，是必要设计 |
| `getBoundingClientRect` 轮询判可视 | ❌ 改 IntersectionObserver | 虚拟列表下更省，卸载即失效；`data-aix-message-id` 属性已存在（`BubbleList.vue:276`） |
| FLIP 过渡补偿窗口位移 | ⚠️ P2 | 效果好但复杂；先实现无过渡版本，看到实际跳动再补 |

数据来源从「全局 store + traceId」改为「从 messages 派生 + messageId」，定位收敛到一个回调。

### 设计

`composables/useMessageOutline.ts`（纯派生，无 DOM）：

```ts
export interface OutlineEntry {
  /** 目标消息 id（交给 scrollToBubble） */
  messageId: string;
  /** 刻度悬浮展示的摘要文本 */
  label: string;
  /** 第几个提问，从 1 开始 */
  ordinal: number;
}
export interface UseMessageOutlineOptions {
  messages: MaybeRefOrGetter<ChatMessage[]>;
  /** 哪些消息进大纲，默认 role === 'user' */
  filter?: (m: ChatMessage) => boolean;
  /** 摘要提取，默认 messageText 截断 */
  toLabel?: (m: ChatMessage) => string;
  /** 窗口半径，默认 8；传 Infinity 关闭滑动窗口 */
  window?: MaybeRefOrGetter<number>;
  /** 当前活跃 messageId（由可视区同步驱动） */
  activeId: MaybeRefOrGetter<string | undefined>;
}
/** 返回 entries（全量）与 windowed（按 activeId 居中裁剪后的可见刻度） */
```

`composables/useVisibleMessage.ts`（DOM 观测独立成 composable，**不塞进已 1174 行的 AiChat**，与 `useAutoScroll`/`useQuoteMenu`/`useTextSelection` 的既有分层一致）：

- 以 `BubbleList.scrollElement()` 为 root 建 IntersectionObserver，观察 `[data-aix-message-id]`（属性已存在，`BubbleList.vue:276`），取视口内最靠下的一条为 active（与 V5 语义一致）
- **`isNavigating` 闸门归它持有**：点击定位期间屏蔽 observer 回写，否则点击后高亮会被滚动过程抢走（V5 这个细节必须保留）
- **环境守卫**：`typeof IntersectionObserver === 'undefined'` 时安全空转（照 `useAutoScroll.ts:205`），否则 jsdom 下 107 个测试文件的环境会炸

`components/MessageOutline.vue`：受控展示 `windowed` + `activeId`，`emit('select', entry)`。**不自己找滚动容器、不自己滚动、不自己观测**。

`AiChat` 集成：
- `AiChatProps.outline?: boolean | { window?: number; filter?; toLabel? }` + `AiChatConfig.outline`，默认关闭
- 开启时在 `BubbleList` 右侧渲染（`AiChat.vue` 的 `__body` 内），absolute 定位不挤压气泡宽度
- `select` → `bubbleListRef.scrollToBubble(entry.messageId, { smooth: true })`
- AiChat 只做接线，逻辑在两个 composable 里

**分支切换行为**（原方案缺口）：entries 派生自 `parsedMessages`（激活路径），切分支会整体换掉条目，`activeId` 可能指向已不在路径上的消息。定为：**路径变化时重置 `activeId` 并重算窗口**，由 `useMessageOutline` 内 watch entries 引用变化处理，不留悬空 active。

**label 空值兜底**（原方案缺口）：`messageText`（`helpers.ts:145`）只 filter text 块，纯图片/附件的用户消息 label 为空串。默认 `toLabel` 需回退到 locale 文案（如「图片消息」），不返回空串。

**退路**：若 IntersectionObserver 在 virtua 下有边界问题（回收行的 observer 时序），复用 `scrollToBubble` 的 rAF 轮询思路。

**FLIP 过渡**（V5 有、本期 P2）：窗口重算会导致刻度整体位移，V5 用 `translateY(dy)` 瞬移回原位再动画归零补偿。先实现无过渡版本，看到实际跳动再补。

### 交付物
- `composables/useMessageOutline.ts` + `composables/useVisibleMessage.ts` + `components/MessageOutline.vue` + 导出 + locale
- `AiChat` 集成 + `outline` 双通道配置
- 单测：entries 派生 / 窗口裁剪边界（首尾不足 window）/ 分支切换重置 active / label 空值兜底 / select emit；observer 在 jsdom 需 mock
- story：长会话 + 点击定位 + 分支切换

---

## 四、用户确认卡 UserConfirm（已确认：纯渲染层，宿主接管提交）

### 边界划分

V5 的提交是「带 `Last-Event-ID` 的 SSE 续流 + 把返回流重挂回同一条消息」，并伴随全局 plan 状态机变更。**这部分全部留在宿主**，组件库只负责：块类型 + 卡片 UI + 超时策略 + 答案回写。

### 类型设计

`ContentBlockRegistry` 新增（`types.ts:403`）：

```ts
user_confirm: {
  /** 表单 id，宿主提交时回传后端 */
  formId: string;
  /** 卡片标题 */
  title?: string;
  /** 字段列表 */
  fields: ConfirmField[];
  /** 生命周期状态 */
  state: UserConfirmState;
  /** 创建时刻（epoch ms）；超时策略以此为基准，缺省则不启用超时 */
  createdAt?: number;
};
```

```ts
export type UserConfirmState =
  | 'awaiting'    // 待填，可交互
  | 'submitting'  // 已提交、宿主请求在途（pointer-events:none，对应 V5 的 frozen）
  | 'submitted'   // 已提交，只读回显答案
  | 'expired';    // 超时/被后续卡顶替，只读且不可提交

export interface ConfirmField {
  name: string;
  question: string;
  type: 'radio' | 'checkbox' | 'text';
  options?: string[];
  defaultValue?: string | string[];
  required?: boolean;
  /** 已提交答案；有值即只读回显 */
  answer?: string | string[];
}
```

`createdAt` 用 epoch ms 而非 V5 的后端字符串时间（`'2026-07-15 10:15:34'` 无时区，跨端解析有坑），与既有 `reasoning.startedAt/endedAt` 口径一致。

### 可交互性判定：只看 state + deadline，不看消息状态

**易错点，必须写死**：不能用 `info.status === 'success'` 作为禁用条件。

V5 的提交是带 `Last-Event-ID` 的**续流**——正因为流已收尾才需要 resume 重新接上。也就是说「消息 `success` + 卡片 `awaiting`」恰恰是用户**应该**填写的状态。若按 status 禁用，卡片一出现、流一结束就变只读，用户永远填不了，功能直接废掉。

正确闸门只有两个：卡片自己的 `state`，加 `createdAt` 的超时判定。

历史消息不会误提交，因为：已处理的卡片持久化时就是 `submitted`/`expired`；真正被遗弃的 `awaiting` 卡，重新挂载时 `createdAt` 早已超时，deadline 逻辑在入口直接判过期（V5 三重兜底的第三条）。机制自然覆盖，无需额外 gating。

### 顶替规则内置进 useChat

照 `sealReasoning`（`useChat.ts:136`）的形状——块类型专属、幂等、在转场时刻调用：

```ts
/** 同一条消息内新 user_confirm 落地时，把仍为 awaiting 的早期确认块置 expired。幂等，可重复调用。 */
function supersedeConfirms(msg: ChatMessage) { /* ... */ }
```

**只管消息内，不做跨消息扫描**：让 useChat 去改历史消息的块侵入性明显偏大；跨消息场景由上面的 deadline-on-mount 自然覆盖。

原方案把顶替全推给宿主是易错设计（漏了就多张卡同时可交互、都能提交），内置更安全，且有 `sealReasoning` 先例背书。

### 超时策略

V5 是 75s 提示 → 105s 自动填充 → 105s plan 光晕 → 120s 自动提交。光晕是多 Agent 任务条产物，不移植。简化为两段可配：

```ts
export interface ConfirmTimeoutConfig {
  /** 提示「需要帮您选一个吗」的时刻（ms，相对 createdAt），缺省不提示 */
  hintAt?: number;
  /** 按 defaultValue 自动填充并标记的时刻 */
  autoFillAt?: number;
  /** 自动提交时刻；到点 emit('confirm', { autoFill: true }) */
  autoSubmitAt?: number;
}
```

`composables/useConfirmDeadline.ts` 负责这条时间线，**设计成块类型无关**——等 Layer 2 落地 tool_use 的 `awaiting-approval`（`types.ts:358` 已预留），它复用同一套 deadline 与顶替逻辑，只写自己的 UI，不重复机制。

**必须保留 V5 的三重兜底**（这是正确性而非锦上添花，后台标签页 `setTimeout` 会被节流/挂起）：
1. 全部按 `createdAt` 的**绝对时刻**计算剩余量，不用累加相对延时
2. `visibilitychange` 回前台时按已流逝时间重排
3. 进入不可交互态前先补发未触发的节点

任何手动交互调用 `cancel()` 撤销整条时间线（与 V5 一致）。

### 交互与回写：两条通道各司其职

- **改答案** → `BlockAction { type: 'answer', patch: { fields } }`，经 `onBlockAction` 落到 `useChat.updateBlock`（数据补丁，组件库自动落地）
- **点提交** → `BlockIntent { type: 'submit', payload: { formId, fields, autoFill? } }`，经 `onBlockIntent` 逐层转发到 `AiChat` 的 `block-intent` emit，宿主自行续流
- 组件**不** mutate props（V5 直接改 `resource.content.fields` 做乐观只读，ai-chat 走 `updateBlock` 统一入口）
- 提交后宿主负责把 `state` 置 `submitting`，请求返回后置 `submitted`；组件只按 state 渲染

这是 `BlockIntent` 通道的首个使用者，两条通道的语义分工见文首「块意图通道」一节。

表单控件：包内无现成 Radio/Checkbox，用原生 `input` + `.aix-` 样式，不引跨包依赖。需要完整键盘可达 + `aria-describedby` 关联 question。

### 交付物
- `types.ts` 类型（含 `BlockIntent` 三型）+ `helpers.ts` 的 `userConfirmBlock()` 构造器
- `components/blocks/UserConfirmBlock.vue` + `Bubble.vue:253` 注册表登记
- `Bubble`/`BubbleList`/`AiChat` 的 `onBlockIntent` → `block-intent` 转发链
- `useChat` 的 `supersedeConfirms` 幂等规则
- `composables/useConfirmDeadline.ts` + 单测（假定时器 + visibilitychange 补偿 + 手动交互撤销 + 挂载即超时）
- locale 文案若干
- 单测：四态渲染、required 校验、只读回显、autoFill 语义、**`success` 消息仍可交互**（防回归到错误 gating）、消息内顶替
- story：`UserConfirm.stories.ts`（含超时自动提交演示）

**内置块组件按既有约定不对外导出**（`index.ts:26` 注释），扩展走 `blockRenderers`。

---

## 影响面汇总

| 文件 | 改动 |
|---|---|
| `types.ts` | +`user_confirm` 注册表项、`UserConfirmState`/`ConfirmField`/`ConfirmTimeoutConfig`、`BlockIntent`/`BlockIntentPayload`/`BlockIntentHandler`、`BubbleProps.tailBreathing` |
| `Bubble.vue` | 注册表 +1 项；呼吸判定（`isIdle` + `is-tail-idle`）；`onBlockIntent` 转发 |
| `MarkdownRenderer.vue` | 呼吸态样式 + `prefers-reduced-motion` |
| `BubbleList.vue` | 透传 `tailBreathing`/`onBlockIntent`；指纹逻辑抽出到 utils |
| `AiChat.vue` | `outline` 集成接线；`block-intent` emit |
| `useChat.ts` | `supersedeConfirms` 幂等规则 |
| `useAiChatConfig.ts` | +`tailBreathing`、`outline` 两个全局通道 |
| 新增组件 | `ContextWindow.vue`、`MessageOutline.vue`、`blocks/UserConfirmBlock.vue` |
| 新增 composable | `useIdleWhileStreaming`、`useMessageOutline`、`useVisibleMessage`、`useConfirmDeadline` |
| 新增 utils | `contentFingerprint.ts`（从 BubbleList 抽取共用） |
| `index.ts` | 导出 `ContextWindow`/`MessageOutline` + 新类型 + 新 composable |
| `locale/*` | zh-CN / en-US 同步加文案（`locale.test.ts` 会校验两端 key 一致） |

**全部为增量**，默认值保持现有行为不变，无破坏性改动。渲染器契约新增的 `onBlockIntent` 是可选 prop，现有自定义渲染器不受影响。

## 本次审查修正记录

设计评审发现并已修正：

1. **真 Bug**：呼吸高亮判定若放在 TextBlock 内，多块消息（`[text, tool_use, text]`）会让中间块呼吸、末块不呼吸 → 判定上移 Bubble 层
2. **真 Bug**：`tailBreathing` 无抵达 TextBlock 的通路（渲染器契约固定）→ 与上条同一处修复
3. **真 Bug**：`info.status === 'success'` 作确认卡禁用条件会让功能完全失效（续流语义下 success + awaiting 正是应填状态）→ 改为只看 state + deadline
4. **扩展性**：`confirm` 专用 emit 链不可复用 → 改通用 `BlockIntent` 通道（成本相同）
5. **一致性**：新配置绕开 `AiChatConfig` 双通道约定 → 补齐
6. **分层**：IntersectionObserver 塞进 1174 行的 AiChat → 抽 `useVisibleMessage`
7. **易错**：`expired` 顶替全推宿主 → 内置 `supersedeConfirms`
8. **缺口**：分支切换的 active 悬空、label 空值、SSR/jsdom 守卫 → 均已定义
9. **命名**：`MessageIndex` 与数组下标混读 → `MessageOutline`

## 验证

每项完成后跑：`pnpm test`（包级 vitest）、`pnpm --filter @aix/ai-chat type-check`、`pnpm --filter @aix/ai-chat lint`。
注意 memory 记录的坑：pre-commit 对 `packages/**/*.vue` 有误报，包级检查全过后可 `--no-verify`。
