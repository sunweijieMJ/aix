<template>
  <div :class="[ns.b(), ns.is('actions-hover', actionsTrigger === 'hover')]">
    <!-- 可选标题栏：传 headerTitle/headerIcon 或提供 header* 任一插槽时渲染。
         默认布局为 [图标] 标题 …… [extra]；header slot 可完全覆盖。关闭等交互由业务填 header-extra。
         容器（__header）本身不带默认视觉（padding/border-bottom）——那些下沉到内置默认内容的
         包裹层（__header-default）上。这样业务提供 #header 完全接管内容时，容器天然零样式，
         不必再 reset padding/border-bottom 才能让自己的布局生效。 -->
    <div v-if="hasHeader" :class="ns.e('header')">
      <slot name="header">
        <div :class="ns.e('header-default')">
          <span v-if="headerIcon || $slots['header-icon']" :class="ns.e('header-icon')">
            <slot name="header-icon"><img :src="headerIcon" alt="" /></slot>
          </span>
          <span :class="ns.e('header-title')">{{ headerTitle }}</span>
          <span v-if="$slots['header-extra']" :class="ns.e('header-extra')">
            <slot name="header-extra" />
          </span>
        </div>
      </slot>
    </div>
    <div :class="ns.e('body')">
      <!-- align / fillHeight 传 undefined 时由 Welcome 的 withDefaults 落回自身默认值，
           故未配置 welcome 的既有接入方行为完全不变 -->
      <Welcome
        v-if="messages.length === 0 && !historyLoading"
        :icon="welcome?.icon"
        :title="welcome?.title ?? welcomeTitle"
        :description="welcome?.description ?? welcomeDescription"
        :align="welcome?.align"
        :fill-height="welcome?.fillHeight"
      >
        <!-- 透传 Welcome 的图标/标题/描述具名插槽，供业务做品牌图标与富文本标题（如局部主色着色）。 -->
        <template v-if="$slots['welcome-icon']" #icon><slot name="welcome-icon" /></template>
        <template v-if="$slots['welcome-title']" #title><slot name="welcome-title" /></template>
        <template v-if="$slots['welcome-description']" #description>
          <slot name="welcome-description" />
        </template>
        <template v-if="prompts?.length || $slots['welcome-extra']" #extra>
          <Prompts v-if="prompts?.length" :items="prompts" @select="onPromptSelect" />
          <slot name="welcome-extra" />
        </template>
      </Welcome>
      <BubbleList
        v-else
        ref="bubbleListRef"
        :items="parsedMessages"
        :roles="roles"
        :should-follow="shouldFollow"
        :typing="config.enableTyping"
        :tail-breathing="tailBreathing"
        :block-renderers="blockRenderers"
        :tool-renderers="toolRenderers"
        :save-disabled="isLoading"
        :loading="historyLoading"
        :error-text="errorText"
        @retry="onReload"
        @block-action="onBlockAction"
        @block-intent="emit('block-intent', $event)"
        @edit="onEditMessage"
        @typing-complete="emit('typing-complete', $event)"
      >
        <!-- 透传气泡内容作用域 slot：使用方提供时覆盖默认 Markdown 渲染 -->
        <template v-if="$slots.content" #content="slotProps">
          <slot name="content" v-bind="slotProps" />
        </template>
        <!-- 气泡上方的消息级头部（发送者名 / 时间戳 / 业务徽标）。
             名字带 bubble- 前缀而非直接叫 header：AiChat 的 header 已被顶部标题栏占用，
             不加前缀会撞名，令 Bubble 的 header 插槽在 AiChat 下**完全不可达**
             （被 AICHAT_RESERVED_SLOTS 拦下、不进块插槽穿透）。
             content / footer 之所以没有前缀，是它们在 AiChat 这层本就没有第二种含义。 -->
        <template v-if="$slots['bubble-header']" #header="sp">
          <slot name="bubble-header" v-bind="sp" />
        </template>
        <!-- 行级插槽（气泡之外、占满整行）：整行居中的时间戳 / 日期分隔线等。
             与 bubble-header 的分工：那个在气泡内、跟随气泡左右对齐；这个是独立的一行。 -->
        <template v-if="$slots['row-before']" #row-before="sp">
          <slot name="row-before" v-bind="sp" />
        </template>
        <!-- 出错态自定义（错误码 / 限流与鉴权分支等）；未提供时回退内置的「出错了 + 重试」条 -->
        <template v-if="$slots.error" #error="sp">
          <slot name="error" v-bind="sp" />
        </template>
        <!-- 消息操作：通过 actions prop 配置（默认 ['copy','regenerate']），
             数组形态仅对 ai+success 消息渲染，函数形态按消息细粒度控制；
             可用 #footer slot 覆盖，设为 [] 关闭。branchAware 确保分支切换器可按需出现。
             这里按 $slots.footer「是否声明」显式二选一，不用 <slot> 原生 fallback——
             撞 renderSlot 的全 Comment 陷阱，说明见 Bubble.vue 的 error 插槽处。 -->
        <template v-if="actionsEnabled || branchAware || $slots.footer" #footer="{ item }">
          <template v-if="$slots.footer">
            <!-- 自绘操作条不该比内置 BubbleActions 拿到的信息少：分支元信息、朗读态、
                 以及一整套「已经接好线」的动作句柄（见 BubbleFooterActions）一并给出，
                 免得业务为做版本切换去组件 ref 上反查 getBranches / switchBranch、
                 为做复制再重写一遍剪贴板降级逻辑。 -->
            <slot
              name="footer"
              :item="item"
              :branch="branchMap.get(item.id)"
              :branch-disabled="isLoading"
              :speaking="speakingId === item.id"
              :actions="footerActions"
            />
          </template>
          <!-- 刻意不传 content / source-content：BubbleActions 在点到复制键的那一刻才按
               message 现算复制文本。若在此预先算好，流式期间每次重渲染都要对全文重扫一遍
               markdown（有分支版本的消息在流式中也挂着操作条），详见其 resolveCopyText 注释。 -->
          <BubbleActions
            v-else-if="actionsMap.get(item.id) || branchMap.get(item.id)"
            :items="actionsMap.get(item.id) ?? []"
            :message="item"
            :feedback="(item.extra?.feedback as MessageFeedback | null) ?? null"
            :speaking="speakingId === item.id"
            :branch="branchMap.get(item.id)"
            :branch-disabled="isLoading"
            @copy="emit('copy', item)"
            @copy-source="emit('copy-source', item)"
            @regenerate="onReload(item.id)"
            @continue="continueGenerate(item.id)"
            @feedback="onFeedback(item.id, $event)"
            @speak="speech?.toggle(item)"
            @switch-branch="switchBranch(item.id, $event)"
            @quote="onQuoteMessage(item)"
            @edit="bubbleListRef?.startEdit(item.id)"
            @delete="emit('delete', item)"
          />
        </template>
        <!-- 透传块插槽：把非保留具名插槽（约定 <块类型>-<内部slot>）逐层下传，
             经 BubbleList → Bubble 最终落到块渲染器内部 slot。 -->
        <template v-for="name in blockSlotNames" :key="name" #[name]="sp">
          <slot :name="name" v-bind="sp" />
        </template>
      </BubbleList>
      <!-- 对话大纲：absolute 贴右侧，不参与流式布局故不挤压气泡宽度。
           判空看 entries 而非 messages：MessageOutline 根节点是带 aria-label 的 <nav> 地标，
           条目为空时渲染出来会让屏幕阅读器念出一个空导航区。开场只有一条 assistant 欢迎语
           （默认 filter 只收 user 消息）或宿主自定义 filter 一条都没命中时，都会撞上。 -->
      <MessageOutline
        v-if="outlineEnabled && outlineState.entries.value.length > 0"
        :class="ns.e('outline')"
        :entries="outlineState.windowed.value"
        :active-id="visible.activeId.value"
        @select="onOutlineSelect"
      />
      <template v-if="quoteMenu.visible.value">
        <slot
          name="quote-menu"
          :items="quoteMenu.items.value"
          :invoke="quoteMenu.invoke"
          :close="quoteMenu.close"
          :mode="quoteMenu.mode.value"
          :selection="active"
          :trigger="trigger"
        >
          <QuoteMenu
            :items="quoteMenu.items.value"
            :source="quoteMenu.source.value"
            :mode="quoteMenu.mode.value"
            :get-rect="active?.getRect"
            :point="trigger?.point"
            :context-el="quoteRoot"
            :toolbar="resolvedQuote.toolbar"
            :sheet="resolvedQuote.sheet"
            @invoke="quoteMenu.invoke"
            @close="quoteMenu.close"
          />
        </slot>
      </template>
    </div>
    <Suggestions
      v-if="visibleSuggestions.length"
      :class="ns.e('suggestions')"
      :items="visibleSuggestions"
      @select="onSuggestionSelect"
    />
    <!-- 输入框**上方、消息区之下**的自由区（AiChat 级，不在 Sender 盒内）：
         品牌形象 / 活动横幅 / 免责提示等常需要挂在输入框外沿，甚至溢出到它上方。
         Sender 自己的 #header 在其 border+padding 之内，放 100px 高的图会把输入框整体顶下去，
         所以那条路走不通。本容器 position:relative，业务在其中做绝对定位即可，
         不必再借 Sender 的盒子（也就不用去改它的 overflow）。 -->
    <div v-if="$slots['sender-before']" :class="ns.e('sender-before')">
      <slot name="sender-before" />
    </div>
    <Sender
      ref="senderRef"
      v-model="inputModel"
      :class="ns.e('sender')"
      :loading="isLoading"
      :placeholder="placeholder"
      :submit-type="submitType"
      :attachments="attachments"
      :voice="voice"
      :triggers="triggers"
      :toolbar-items="toolbarItems"
      :auto-spacer="autoSpacer"
      :icons="senderIcons"
      :variant="senderVariant"
      :allow-empty-submit="pendingQuotes.length > 0"
      @submit="onSend"
      @cancel="abort"
    >
      <!-- Sender 顶部扩展区：内置引用 chips 与业务的 #sender-header **追加共存**（本层若
           独占该插槽，业务就没有入口在输入框内加一行上下文，如模型标签 / 知识库选择）。 -->
      <template v-if="pendingQuotes.length || $slots['sender-header']" #header="scope">
        <div v-if="pendingQuotes.length" :class="ns.e('quote-chips')">
          <QuoteChip
            v-for="q in visibleQuotes"
            :key="q.id"
            :quote="q"
            @remove="removeQuote(q.id)"
            @locate="locateAnchor(q.anchor)"
          />
          <button
            v-if="!chipsExpanded && hiddenChipCount > 0"
            type="button"
            :class="ns.e('quote-chips-toggle')"
            :aria-label="t.quoteChipsExpand"
            :title="t.quoteChipsExpand"
            @click="chipsExpanded = true"
          >
            +{{ hiddenChipCount }}
          </button>
          <button
            v-else-if="chipsExpanded && hiddenChipCount > 0"
            type="button"
            :class="ns.e('quote-chips-toggle')"
            :aria-label="t.quoteChipsCollapse"
            :title="t.quoteChipsCollapse"
            @click="chipsExpanded = false"
          >
            {{ t.quoteChipsCollapse }}
          </button>
        </div>
        <slot name="sender-header" v-bind="scope" />
      </template>
      <template v-if="$slots.toolbar" #toolbar="scope">
        <slot name="toolbar" v-bind="scope" />
      </template>
      <template v-if="$slots.prefix" #prefix="scope">
        <slot name="prefix" v-bind="scope" />
      </template>
      <!-- Sender 底部扩展区（工具栏之下、仍在输入框盒内）：字数统计、快捷键提示等 -->
      <template v-if="$slots['sender-footer']" #footer="scope">
        <slot name="sender-footer" v-bind="scope" />
      </template>
      <!-- 自定义附件面板 UI：原样转发给 Sender（作用域见 SenderAttachmentsSlotScope） -->
      <template v-if="$slots['attachments-panel']" #attachments-panel="scope">
        <slot name="attachments-panel" v-bind="scope" />
      </template>
      <!-- 只换内置面板里的上传占位区（比整块接管轻得多）；与上一个插槽互斥使用 -->
      <template v-if="$slots['attachments-placeholder']" #attachments-placeholder="scope">
        <slot name="attachments-placeholder" v-bind="scope" />
      </template>
    </Sender>
    <!-- 整个组件的最底部（Sender 之下）：免责声明 / 法务文案这类「不属于输入框」的常驻内容。
         不叫 #footer——那个名字在本层已被气泡底部操作条占用。写在 </AiChat> 之外亦可，
         但那样就脱离了组件的 flex 布局，得由业务自己补 flex-shrink 之类。 -->
    <div v-if="$slots.bottom" :class="ns.e('bottom')">
      <slot name="bottom" />
    </div>
  </div>
</template>

<script lang="ts">
/**
 * AiChat 的全部 props。
 *
 * **关于「静态配置」标记**：下面若干项标注了「静态配置」，指该值仅在组件初始化时取一次
 * （setup 快照），运行时修改静默不生效，需要通过 `:key` 强制重建 AiChat 实例才能切换。
 * 逐项不再重复这段说明，只标记「静态配置」四字。
 *
 * 仅剩这五项是真正静态的，它们都在 setup 期**建了状态机 / 记忆化装置**，改配置等于换实例：
 * `parser`（逐条记忆化缓存按有无 parser 条件构建）/ `attachments` / `voice` / `speech` /
 * `triggers`（各自 setup 期建状态机）。
 *
 * 其余配置（`request` / `streamMode` / `parseChunk` / `retryTimes` / `retryInterval` /
 * `streamTimeout` / `continuePrompt` / `markdownRenderers` / `allowHtml` / `mdPlugins` /
 * `reasoningVariant`）**均在使用那一刻求值，运行时改即刻生效**，不要为它们重建实例——
 * 重建会丢掉整棵对话树。`quote` 的响应式粒度是逐键混合的，见其自身注释。
 */
export interface AiChatProps {
  /**
   * 发起请求，返回字节流或 Response（必填）。
   *
   * **每次发请求那一刻才读取本 prop，运行时替换即刻生效**——内部并非把它快照进 useChat，
   * 而是转发一层闭包 `(ctx) => props.request(...)`（见下方 useChat 接线处）。
   * 因此「对话中途换模型 / 换后端」不需要 `:key` 强制重建 AiChat，在自己的 request 实现里
   * 读一个响应式变量即可，用法见 README「自定义协议 / 换模型」。
   *
   * 仅当新旧后端的**流格式也不同**时才需要连同 parseChunk 一起换，那种场景才必须重建实例。
   */
  request: UseChatOptions['request'];
  /** 流分帧模式（'sse' 默认 / 'line'）；透传给 useChat。每次请求才读取，运行时可改 */
  streamMode?: 'sse' | 'line';
  /**
   * 流单元 → 增量解析器，默认扁平 SSE；对接 OpenAI/Anthropic 传
   * openaiParseChunk/anthropicParseChunk。透传给 useChat。
   *
   * 与 `request` 同口径：内部转发一层闭包，**每个流单元才读取本 prop**，故「换后端顺带换流格式」
   * 直接改这两个 prop 即可，无需 `:key` 重建实例。
   */
  parseChunk?: UseChatOptions['parseChunk'];
  /** 渲染消息转换器（解耦后端格式与展示形状，1→1，须保留消息 id）；透传给 useChat。静态配置 */
  parser?: UseChatOptions['parser'];
  /** 初始历史消息 */
  defaultMessages?: UseChatOptions['defaultMessages'];
  /**
   * 历史消息加载中：true 时消息区渲染骨架屏（占位假气泡），而不是空消息态的 Welcome 或
   * 真实 BubbleList；用于业务从远端异步恢复会话历史时的过渡态（如接入 useConversations
   * 异步 storage.load，配合其 isLoading 传入本 prop）。默认 false（不生效时行为不变：
   * messages 为空显示 Welcome，否则显示 BubbleList）。透传给 BubbleList 的 loading prop。
   */
  historyLoading?: boolean;
  /**
   * 输入框文本（v-model:input）。可选；不传则走非受控，由组件内部维护草稿。
   * 注意：不要设默认值——为兼容 Vue 3.3（useModel emit-only 语义），受控/非受控的判定
   * 依赖此 prop 是否为 undefined，交由 useControllable 的 defaultValue 兜底。
   */
  input?: string;
  /** 角色气泡样式映射，优先级高于 provideAiChatConfig 的全局 roles */
  roles?: Record<string, RoleConfig>;
  /** 滚动跟随策略，优先级高于 provideAiChatConfig 的全局 shouldFollow */
  shouldFollow?: ShouldFollow;
  /**
   * 末尾静默呼吸：流式输出停顿时末块文字明暗呼吸，提示「仍在生成」。
   * `true` 用默认 3000ms 阈值；传 `{ idleMs }` 自定义。优先级高于 provideAiChatConfig 的全局 tailBreathing。
   */
  tailBreathing?: boolean | { idleMs?: number };
  /**
   * 对话大纲导航：右侧提问刻度条，点击定位到对应提问。
   * `true` 用默认配置；传对象可定制窗口半径 / 入选规则 / 摘要提取。
   * 优先级高于 provideAiChatConfig 的全局 outline。
   */
  outline?: boolean | OutlineOptions;
  /** 块渲染器注册表（扩展/覆盖内置 text/reasoning 渲染），优先级高于 provideAiChatConfig 的全局 blockRenderers */
  blockRenderers?: BlockRenderers;
  /** 工具调用（tool_use）渲染器注册表，按 toolName 路由，优先级高于 provideAiChatConfig 的全局 toolRenderers */
  toolRenderers?: BlockRenderers;
  /** 欢迎页快捷问题，点击后以其 label 作为消息自动发送 */
  prompts?: PromptItem[];
  /** 顶部标题栏标题文案；传入（或提供 header* 插槽）时渲染标题栏，默认不渲染 */
  headerTitle?: string;
  /** 顶部标题栏图标图片地址（可用 header-icon 具名插槽覆盖） */
  headerIcon?: string;
  /** 欢迎页标题（空消息态展示）。等价于 `welcome.title`，两者同时存在时以 `welcome` 为准 */
  welcomeTitle?: string;
  /** 欢迎页描述文案（空消息态展示）。等价于 `welcome.description`，两者同时存在时以 `welcome` 为准 */
  welcomeDescription?: string;
  /**
   * 欢迎页配置。`title` / `description` 与扁平的 `welcomeTitle` / `welcomeDescription` 等价
   * （本对象优先），另外开放三项只能从这里配置的能力：
   *
   * - `icon`：Welcome 的图标图片地址（也可用 `#welcome-icon` 插槽）；
   * - `align`：`'center'`（默认）/ `'start'` 左对齐引导语；
   * - `fillHeight`：是否用 `margin: auto 0` 在 body 内垂直居中，默认跟随 `align`。
   *
   * 后两项 Welcome 组件本就支持且互相正交，只是一直没接线到这一层，于是「左对齐欢迎语」
   * 这种常见形态只能靠覆写 `.aix-welcome--center` / `.aix-welcome.is-fill-height` 反向实现。
   */
  welcome?: {
    icon?: string;
    title?: string;
    description?: string;
    align?: 'center' | 'start';
    fillHeight?: boolean;
  };
  /** 输入框占位提示，缺省取 locale.senderPlaceholder */
  placeholder?: string;
  /** 输入框提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之，默认 'enter'；透传给 Sender */
  submitType?: 'enter' | 'shiftEnter';
  /**
   * 消息操作条配置，默认 ['copy','regenerate']。
   * 数组形态：仅对 role==='ai' && status==='success' 的消息渲染；
   * 函数形态：对每条消息调用，返回 items 则渲染、null/[] 不渲染（可按状态/角色细控）。
   * 设为 [] 关闭默认操作条；#footer slot 提供时优先（覆盖机制不变）。
   * 函数形态应为纯函数（同输入同输出）；返回值随消息 status 响应式更新。
   */
  actions?: ActionsItems | ((message: ChatMessage) => ActionsItems | null);
  /**
   * 消息操作的显示时机：'always' 常驻显示（默认），'hover' 仅悬浮气泡或键盘聚焦内部按钮时显示（触屏设备始终显示）。
   *
   * 'hover' 作用于气泡内带 `data-aix-hover-reveal` 标记的元素——内置操作条自带该标记；
   * 用 `#footer` 自绘操作条时，给自己的根节点加上同一属性即可同样生效。
   * footer 内的常驻内容（图表卡 / 参考资料等）不加标记即不参与显隐。
   */
  actionsTrigger?: 'always' | 'hover';
  /**
   * 出错态内置错误条的文案解析，默认回退 `locale.errorMessage`。
   *
   * `request` / `parseChunk` 抛出的原始错误存在 `message.extra.error` 里，但**默认不直出**：
   * 那里可能是 `TypeError: Failed to fetch` 之类的内部信息，直接展示给终端用户是负收益。
   * 想透出后端返回的具体原因（限流、鉴权、内容审核等业务错误）时显式声明本函数即可，
   * 无需为此接管整个 `#error` 插槽（示例见 README「消息级插槽」）。
   *
   * 返回空串等同未提供（回退 i18n 文案）。仅对 `status === 'error'` 的消息调用。
   */
  errorText?: (message: ChatMessage) => string;
  /** 请求失败自动重试次数（不含首次），默认 0；透传给 useChat。abort 不触发重试。运行时可改 */
  retryTimes?: number;
  /** 两次重试间隔（ms），默认 1000；透传给 useChat。运行时可改 */
  retryInterval?: number;
  /**
   * 继续生成（continueGenerate）时，发给模型的隐藏续写指令文案；透传给 useChat。
   * 默认见 useChat 的 continuePrompt 说明。运行时可改
   */
  continuePrompt?: string;
  /**
   * 流静默超时（ms），默认 0 关闭：超过该时长无新数据判为卡死（可重试错误）；透传给 useChat。
   * 每次 attempt 起表时取值，运行时可改
   */
  streamTimeout?: number;
  /**
   * markdown token 渲染器注册表（扩展/覆盖气泡内 markdown 块渲染），优先级高于全局同名配置。
   * 运行时可改（经下方 provide 的响应式配置对象下发）
   */
  markdownRenderers?: MarkdownRenderers;
  /**
   * 是否允许渲染原始 HTML（经 sandbox iframe 隔离渲染：allow-scripts，无 allow-same-origin），
   * 默认 false；注入到气泡内 MarkdownRenderer。运行时可改（切换时引擎按新模式重载）
   */
  allowHtml?: boolean;
  /**
   * 注入的 markdown-it 插件（扩展新语法，如脚注 / 容器 / 任务列表）；注入到气泡内 MarkdownRenderer。
   * 与 markdownRenderers 互补：插件加新 tokenization，markdownRenderers 改 token 渲染。
   *
   * 运行时可改，但**务必传稳定引用**：markdown 引擎按「插件数组引用 + allowHtml」缓存，
   * 每次渲染新建数组字面量会让每帧都装配一个新引擎。
   */
  mdPlugins?: MarkdownItPlugin[];
  /**
   * 附件能力（opt-in），原样透传 Sender；不传则无任何附件 UI。静态配置
   *
   * 两种传法与 `SenderProps.attachments` 完全一致（本层只是直通，不做任何加工）：
   * - **配置对象**（`UseAttachmentsOptions`）：由 Sender 内部 `useAttachments`，最省事；
   * - **已创建的实例**（`UseAttachmentsReturn`）：宿主自己持有 items / `clear()` 等状态与句柄。
   *
   * 传实例的典型需求：面板以 v-if 卸载时把已上传未发送的附件回收掉（`useAttachments` 的
   * scope 销毁会逐条走 onRemove，但宿主也可能想更早地手动 `clear()`）。
   */
  attachments?: UseAttachmentsOptions | UseAttachmentsReturn;
  /** 语音输入（opt-in），透传 Sender；不传则无麦克风按钮。静态配置 */
  voice?: boolean | VoiceConfig;
  /**
   * 语音播报（opt-in），透传内置 useSpeech；不传则无朗读按钮、不自动播报。
   * true=全默认（speechSynthesis）；对象=自定义合成器 / autoPlay / getText 等。静态配置
   * 注意：actions 为函数形态时不会自动追加内置 speak 项，需业务在返回数组中自行包含 'speak'；数组/默认形态会自动为 ai+success 且有可朗读文本的消息追加。
   */
  speech?: boolean | SpeechConfig;
  /**
   * 对话树（v-model:tree）：分支感知的持久化通道，绑 useConversations.activeTree。
   * 不传则不参与树级持久化。同时绑 v-model:messages 与 v-model:tree 时以 tree 为准；
   * 推荐持久化场景用 tree，两者择一。
   *
   * `update:tree` 只在四个离散时刻触发（结构变化 / 请求落终态 / 交互块回写 / 赞踩写回），
   * **流式逐 chunk 不触发**。自定义持久化前请读 README「`update:tree` 的触发口径」——
   * 只按「结构变化」落库会静默丢掉整轮回复内容。
   */
  tree?: ExportedTree;
  /**
   * 显式声明是否以 `tree` 为权威持久化通道（默认由是否绑定 `v-model:tree` 自动推断）。
   *
   * 为真时：`messages` 只作只读镜像输出、不再反向导入内部树（两条桥接同时回写会让 messages
   * model 被 prop 回灌成 `[]`，进而清空整棵树）。
   *
   * 自动推断读的是编译后的 vnode props（`'onUpdate:tree' in props`），覆盖 `v-model:tree` /
   * 单向 `:tree` 两种写法，绝大多数场景无需管本 prop。仅当推断不适用时才显式声明——典型是
   * 用 `h()` / JSX 手写 vnode、或经高阶组件 `v-bind="$attrs"` 中转导致监听器形态不同。
   */
  treeMode?: boolean;
  /**
   * 划词引用/追问（opt-in，默认关闭）。true 开启默认能力；false 关闭；对象按 QuoteConfig 细配并默认视为开启，
   * 与全局 provideAiChatConfig().quote 合并（props 优先）。
   *
   * 响应式粒度是**混合**的（不可一概按「setup 快照」理解，故逐项写明）：
   * - 运行时可变：`enable` / `roles` / `actions` / `pcQuoteAction` / `maxVisibleChips` /
   *   `toPrompt` / `toolbar` / `sheet` —— 均在使用那一刻经 getter 或 computed 读取；
   * - setup 快照：`longPressDelay` / `keyboard` / `excludeSelector` —— 在 useTextSelection
   *   装配时一次性取值（见 useQuoteBinding 传参处），运行时改需重建组件。
   */
  quote?: QuoteConfig | boolean;
  /** 触发菜单配置（@提及/斜杠命令），直通 Sender；静态配置 */
  triggers?: TriggerConfig[];
  /** 工具栏项（内置 attach/voice + 自定义对象混排），直通 Sender；不传则用 Sender 默认值 ['attach','voice'] */
  toolbarItems?: SenderToolbarItems;
  /**
   * 未显式放置 'spacer' 时是否自动在发送键前补一个隐式 spacer，直通 Sender，默认 true。
   * 见 `SenderProps.autoSpacer` 说明。
   */
  autoSpacer?: boolean;
  /**
   * 覆盖 Sender 内置按钮图标（附件 / 语音 / 发送 / 停止），直通 Sender 的 `icons` prop。
   *
   * 命名上刻意加 `sender` 前缀、不沿用同名直通的惯例（`toolbarItems` / `triggers` 那样）：
   * AiChat 这一层还有消息操作条图标（`ActionItem.icon`）、划词菜单图标等多套图标，
   * 裸叫 `icons` 会被读成「全局图标表」，与实际作用域不符。
   */
  senderIcons?: SenderIcons;
  /**
   * 输入框外观形态，直通 Sender 的 `variant`，默认 `'card'`。
   * 侧边栏 / 移动端 / 全屏页这类贴边通栏形态传 `'plain'`，配合
   * `--aix-ai-chat-sender-margin: 0` 与 `--aix-sender-*` 尺寸旋钮即可，无需覆写 `.aix-sender`。
   * 命名前缀同 `senderIcons`（这一层还有别的 variant 概念，裸叫 variant 会读成组件整体形态）。
   */
  senderVariant?: SenderVariant;
  /**
   * 深度思考（reasoning 块）折叠面板的外观形态，默认 `'card'`；
   * `'capsule'` 为 hug 宽度胶囊头 + 独立正文块（多数 AI 产品的当下形态），`'plain'` 无容器视觉。
   * 经 provideAiChatConfig 注入（ReasoningBlock 由注册表实例化、接不到 prop）；运行时可改
   */
  reasoningVariant?: ThinkingVariant;
  /**
   * 追问建议（opt-in）：true 全默认；对象可配 fillOnly（点击仅回填不发送）/ max（上限，默认 5）。
   * 联合类型含 boolean：withDefaults 必须显式 default undefined（同 quote 的坑）
   */
  suggestions?: boolean | { fillOnly?: boolean; max?: number };
}
/**
 * `#footer` 作用域插槽回传的动作句柄集合（稳定引用，不随消息重建）。
 *
 * 每一项都复用内置 `BubbleActions` 的同一条内部路径：复制自带 Clipboard API + execCommand
 * 降级（HTTP 环境同样可用）、赞踩会写回 `extra.feedback` 并同步 `v-model:tree`、切分支会触发
 * 树同步。自绘操作条据此可完整复刻内置能力，而不必"按钮自己画、逻辑自己接"。
 */
export interface BubbleFooterActions {
  /** 复制消息正文（已剥离 markdown 语法）。返回是否已写入剪贴板；无可复制文本时不写入但仍算受理 */
  copy: (message: ChatMessage) => Promise<boolean>;
  /** 复制原始 markdown 源码（不剥离语法符号） */
  copySource: (message: ChatMessage) => Promise<boolean>;
  /** 重新生成：在对话树上新增兄弟节点，旧回答保留（可经 switchBranch 切回） */
  regenerate: (id: string) => void;
  /** 对被手动停止（status==='abort'）的消息续写 */
  continue: (id: string) => void;
  /** 切换分支版本：dir=-1 上一个 / 1 下一个 */
  switchBranch: (id: string, dir: -1 | 1) => void;
  /** 写入赞 / 踩（null 取消），同步持久化并对外 emit 'feedback' */
  setFeedback: (id: string, value: MessageFeedback | null) => void;
  /** 请求某条用户消息进入内联编辑态 */
  startEdit: (id: string) => void;
  /** 切换内置语音播报（再点同条停、点别条切）；未开启 speech 时为空操作 */
  speak: (message: ChatMessage) => void;
}

export interface AiChatEmits {
  /** 用户发送消息（含点击快捷问题），携带文本与可选附件、可选扩展元信息（如 mention 实体） */
  (e: 'send', text: string, attachments?: AttachmentItem[], meta?: SubmitMeta): void;
  /** 单条 AI 回复成功完成，携带该消息 */
  (e: 'finish', message: ChatMessage): void;
  /** 请求出错，携带该消息 */
  (e: 'error', message: ChatMessage): void;
  /** 被中断，携带该消息 */
  (e: 'abort', message: ChatMessage): void;
  /** 复制某条 AI 回复（默认操作触发），携带该消息 */
  (e: 'copy', message: ChatMessage): void;
  /** 复制某条 AI 回复的原始 markdown 源码（opt-in 的 copySource 操作触发），携带该消息 */
  (e: 'copy-source', message: ChatMessage): void;
  /** 交互块动作上抛（如单选作答 / 编辑保存），供业务方做持久化 / 判分 */
  (e: 'block-action', payload: BlockActionPayload): void;
  /**
   * 交互块**意图**上抛（如确认卡点提交），供业务方处置——组件库不据此改动任何数据。
   * 与 block-action 的分工见 BlockIntent 类型注释：action 是「改我的数据」（自动落地），
   * intent 是「我需要你做件事」（如带 Last-Event-ID 的续流），落地与否完全由业务决定。
   */
  (e: 'block-intent', payload: BlockIntentPayload): void;
  /** 用户消息编辑保存（已截断后续并重新生成），携带 id 与新文本 */
  (e: 'edit', payload: { id: string; text: string }): void;
  /** 请求删除某条消息（只上抛，不改动 messages/分支树——是否真的移除、是否同步后端，完全交给业务） */
  (e: 'delete', message: ChatMessage): void;
  /** AI 回复赞/踩反馈变化，携带 id 与值（null 取消），供业务持久化 */
  (e: 'feedback', payload: { id: string; value: MessageFeedback | null }): void;
  /** 某条 AI 消息逐字显示完毕，携带消息 id（流式打字机追平末尾时触发） */
  (e: 'typing-complete', id: string): void;
  /** 输入框文本变化（v-model:input），由 useControllable 在受控/非受控两态下统一上抛 */
  (e: 'update:input', value: string): void;
  /** 对话树结构变化（v-model:tree），用于持久化分支 */
  (e: 'update:tree', value: ExportedTree): void;
  /** 点击追问建议（发送/回填之前触发，供埋点） */
  (e: 'suggestion-select', item: SuggestionItem): void;
}
</script>

<script setup lang="ts">
import { useNamespace, useControllable, useLocale, copyText } from '@aix/hooks';
import { computed, ref, toRaw, watch, watchEffect, useSlots, getCurrentInstance } from 'vue';
import { ROOT_ID } from '../composables/messageTree';
import { useAiChatConfig, provideAiChatConfig } from '../composables/useAiChatConfig';
import type { UseAttachmentsOptions, UseAttachmentsReturn } from '../composables/useAttachments';
import type { ShouldFollow } from '../composables/useAutoScroll';
import { useChat } from '../composables/useChat';
import type { UseChatOptions } from '../composables/useChat';
import type { MarkdownItPlugin } from '../composables/useMarkdownRenderer';
import {
  useMessageOutline,
  defaultOutlineFilter,
  defaultOutlineToLabel,
} from '../composables/useMessageOutline';
import type { OutlineEntry } from '../composables/useMessageOutline';
import { useQuoteBinding } from '../composables/useQuoteBinding';
import { useSpeech } from '../composables/useSpeech';
import { useSuggestions } from '../composables/useSuggestions';
import { useVisibleMessage } from '../composables/useVisibleMessage';
import type { SSEChunk } from '../composables/useXStream';
import { locale } from '../locale';
import type {
  ChatMessage,
  RoleConfig,
  PromptItem,
  BlockRenderers,
  BlockActionPayload,
  BlockIntentPayload,
  MessageFeedback,
  ActionsItems,
  AttachmentItem,
  VoiceConfig,
  SpeechConfig,
  SubBubbleMeta,
  ExportedTree,
  QuoteConfig,
  TriggerConfig,
  SubmitMeta,
  SuggestionItem,
  OutlineOptions,
  ParsedChunk,
} from '../types';
import { devWarn } from '../utils/devWarn';
import { messageText, attachmentBlock, textBlock, quoteBlock } from '../utils/helpers';
import type { MarkdownRenderers } from '../utils/markdownWalker';
import { flatParseChunk } from '../utils/parsers';
import { flattenQuoteBlocks } from '../utils/quotePrompt';
import { stripMarkdownForCopy } from '../utils/stripMarkdownForCopy';
import BubbleActions from './BubbleActions.vue';
import BubbleList from './BubbleList.vue';
import MessageOutline from './MessageOutline.vue';
import Prompts from './Prompts.vue';
import QuoteChip from './QuoteChip.vue';
import QuoteMenu from './QuoteMenu.vue';
import Sender from './Sender.vue';
import type { SenderIcons, SenderToolbarItems, SenderVariant } from './Sender.vue';
import Suggestions from './Suggestions.vue';
import type { ThinkingVariant } from './Thinking.vue';
import Welcome from './Welcome.vue';

const props = withDefaults(defineProps<AiChatProps>(), {
  actionsTrigger: 'always',
  // 以下四项都必须显式声明 default:undefined（而非不声明）：Vue 对「类型含 Boolean 且无
  // default」的 prop 做隐式转换，未传时得到 false 而非 undefined，于是「未配置」与「显式关闭」
  // 无法区分。显式 default:undefined 关闭该转换。各自的后果：
  //   quote / suggestions —— 丢掉「继承全局 provideAiChatConfig」这一档，未配置即被当作关闭；
  //   treeMode —— 「未声明」被误读为「显式关闭 tree 模式」，v-model:tree 的自动推断整个短路；
  //   autoSpacer —— 覆盖掉 Sender 自身的默认值 true，隐式 spacer 永久消失。
  quote: undefined,
  suggestions: undefined,
  treeMode: undefined,
  autoSpacer: undefined,
});
const emit = defineEmits<AiChatEmits>();
const ns = useNamespace('ai-chat');
const config = useAiChatConfig();
const slots = useSlots();
const { t } = useLocale(locale);

// 划词引用配置：内置默认关闭 < 全局 config.quote < 组件 props.quote；
// true/false 分别显式开启/关闭，对象配置默认视为开启（除非 enable:false）。
const normalizeQuoteConfig = (value: QuoteConfig | boolean | undefined): QuoteConfig => {
  if (value == null) return {};
  if (typeof value === 'boolean') return { enable: value };
  return { ...value, enable: value.enable ?? true };
};

const resolvedQuote = computed<
  Required<Pick<QuoteConfig, 'enable' | 'pcQuoteAction' | 'maxVisibleChips'>> & QuoteConfig
>(() => {
  const fromProps = props.quote == null ? {} : normalizeQuoteConfig(props.quote);
  return {
    enable: false,
    pcQuoteAction: true,
    maxVisibleChips: 3,
    ...normalizeQuoteConfig(config.value.quote),
    ...fromProps,
  };
});

// AiChat 自身消费的保留插槽（标题栏 + 欢迎 / 内容 / Sender 周边 / 底部）；其余具名插槽透传给
// BubbleList，最终落到块渲染器内部 slot。
//
// 本名单**不能**由 utils/reservedSlots 推导（本层另有一大批自有插槽，且把 Bubble 的 header
// 重命名为 bubble-header 以避开自己的标题栏 header），故单独维护。新增任何由本组件消费或
// 显式转发的具名插槽都必须登记到这里——漏登记不会报错，而是让它被当成「块插槽」一路下传，
// 在每条消息的每个块里重复渲染一遍。该不变量由 __test__/slotPassthrough.test.ts 行为级兜底。
const AICHAT_RESERVED_SLOTS = [
  'header',
  'header-icon',
  'header-extra',
  'welcome-icon',
  'welcome-title',
  'welcome-description',
  'welcome-extra',
  'content',
  'footer',
  // 气泡级插槽：由下方模板显式转发给 BubbleList，不能再进块插槽穿透（否则重复声明）
  'bubble-header',
  'row-before',
  'error',
  'quote-menu',
  'toolbar',
  'prefix',
  'attachments-panel',
  'attachments-placeholder',
  // Sender 周边的四个区域插槽：两个转发给 Sender（盒内），两个由本组件自绘（盒外）。
  'sender-header',
  'sender-footer',
  'sender-before',
  'bottom',
];
const blockSlotNames = computed(() =>
  Object.keys(slots).filter((n) => !AICHAT_RESERVED_SLOTS.includes(n)),
);

// 标题栏渲染条件：传入 headerTitle/headerIcon，或提供 header/header-icon/header-extra 任一插槽
const hasHeader = computed(
  () =>
    !!(
      props.headerTitle ||
      props.headerIcon ||
      slots.header ||
      slots['header-icon'] ||
      slots['header-extra']
    ),
);

// 受控模式：父组件可用 v-model:messages 接管消息列表（持久化 / 外部清空 / 跨组件共享）。
// 此处刻意保留 defineModel：messagesModel 仅作对外镜像，UI 实际渲染 useChat 的 parsedMessages（SSOT），
// 且与 useChat 内部数组共享引用（见下方 SSOT 桥接）。Vue 3.3 下非受控时镜像写入虽被 emit-only 丢弃，
// 但 UI 不依赖它、受控/单向场景 emit 照常触发，故对该 SSOT 场景是优雅降级，无需 useControllable。
const messagesModel = defineModel<ChatMessage[]>('messages', { default: () => [] });
// 输入框文本（v-model:input）：组件内部（Sender 回填、发送清空、草稿保留）会写入本 model，
// 属于「内部写入 + 支持非受控」场景。Vue 3.3 的 useModel 为 emit-only，非受控下本地写入会丢失，
// 故改用 useControllable：非受控时由内部 ref 持有、受控时只 emit。prop input 必须保持无默认值。
const { state: inputModel } = useControllable<string>({
  prop: () => props.input,
  defaultValue: '',
  onChange: (v) => emit('update:input', v),
});
const senderRef = ref<InstanceType<typeof Sender> | null>(null);

const DEFAULT_ROLES: Record<string, RoleConfig> = {
  user: { placement: 'end', variant: 'filled' },
  ai: { placement: 'start', variant: 'filled' },
};

// ── 以下各项统一按「内置默认 < 全局 provideAiChatConfig < 组件 props」三级解析 ──
// 注册表类（roles / blockRenderers / toolRenderers）逐键合并，标量与配置对象类整体覆盖。
// 只标注各自的**未提供时行为**，优先级规则不再逐条重复。

const roles = computed<Record<string, RoleConfig>>(() => ({
  ...DEFAULT_ROLES,
  ...config.value.roles,
  ...props.roles,
}));

// 均未提供时传 undefined，由 BubbleList/useAutoScroll 回退内置 defaultShouldFollow
const shouldFollow = computed(() => props.shouldFollow ?? config.value.shouldFollow);

// 均未提供时为 undefined，Bubble 内按关闭处理
const tailBreathing = computed(() => props.tailBreathing ?? config.value.tailBreathing);

// true 视为启用并取默认配置
const resolvedOutline = computed(() => props.outline ?? config.value.outline);
const outlineEnabled = computed(() => !!resolvedOutline.value);
const outlineOpts = computed<OutlineOptions>(() =>
  typeof resolvedOutline.value === 'object' ? resolvedOutline.value : {},
);

// Bubble 内部再叠加内置 text/reasoning 等默认渲染器
const blockRenderers = computed<BlockRenderers>(() => ({
  ...config.value.blockRenderers,
  ...props.blockRenderers,
}));

// 与 blockRenderers 并列的独立注册表，专供 tool_use 块按 toolName 路由
const toolRenderers = computed<BlockRenderers>(() => ({
  ...config.value.toolRenderers,
  ...props.toolRenderers,
}));

// markdown 级配置经「全局 + 组件 props」合并后重新 provide 给子树，供气泡内深层的
// TextBlock / ReasoningBlock 的 MarkdownRenderer 消费。
// 优先级：内置默认 < 全局 provideAiChatConfig < 组件 props（与 roles/blockRenderers 一致）。
//
// 接住 provideAiChatConfig 返回的 shallowReactive 引用并持续同步，而**不是**只在 setup 期灌一次
// 快照：整条下游链路本就是响应式的（useAiChatConfig 返回 computed、TextBlock/ReasoningBlock
// 以模板绑定逐项透传、MarkdownRenderer 自带按 allowHtml/mdPlugins 的引擎重载 watch），
// 只灌快照会让这四项白白退化成「改了不生效、只能 :key 重建实例」——而重建会丢整棵对话树。
//
// config 取的是**父级**注入（inject 在本组件 provide 之前解析，指向上游而非自己），
// 故下面的 watchEffect 读 config、写 providedConfig，不构成自激循环。
const resolveProvidedConfig = () => ({
  ...config.value,
  markdownRenderers: { ...config.value.markdownRenderers, ...props.markdownRenderers },
  allowHtml: props.allowHtml ?? config.value.allowHtml ?? false,
  mdPlugins: props.mdPlugins ?? config.value.mdPlugins,
  // reasoningVariant 走同一条注入通道（ReasoningBlock 由注册表实例化，接不到 prop）
  reasoningVariant: props.reasoningVariant ?? config.value.reasoningVariant,
});
const providedConfig = provideAiChatConfig(resolveProvidedConfig());
watchEffect(() => Object.assign(providedConfig, resolveProvidedConfig()));

// 开发期护栏：本组件恒会向 useChat 转发一层 parseChunk 闭包（见下方接线），useChat 内那条
// 同款护栏因此对经 AiChat 接入的场景恒不触发，故在这里复判。这条配置错误的表现是
// 「空内容 success、全程无报错」，没有护栏几乎无从排查。
// streamMode / parseChunk 现均可运行时切换，故用 watchEffect 跟随；只告警一次避免刷屏。
let warnedLineModeParse = false;
watchEffect(() => {
  if (warnedLineModeParse || props.streamMode !== 'line' || props.parseChunk) return;
  warnedLineModeParse = true;
  devWarn(
    '[ai-chat] streamMode="line" 未提供 parseChunk：默认解析器只识别 SSE 事件，' +
      '行字符串将被全部丢弃（回复恒为空）。请传入 parseChunk，如 (line) => ({ delta: line })。',
  );
});

const {
  messages,
  parsedMessages,
  isLoading,
  onSend: sendMessage,
  onReload,
  onEdit,
  abort,
  setMessages,
  updateBlock,
  setFeedback,
  branches,
  switchBranch,
  getBranches,
  exportTree,
  importTree,
  resume,
  continueGenerate,
} = useChat({
  // 请求期把 quote 块拍平成 blockquote 文本给 business（纯函数，不 mutate SSOT）；
  // 无 quote 块时逐条直通，零开销。`...ctx` 展开在前，故 messageId / setExtra 等
  // 后续新增的上下文字段自动随之透传，这里只覆盖 messages 这一项。
  request: (ctx) =>
    props.request({
      ...ctx,
      messages: flattenQuoteBlocks(ctx.messages, resolvedQuote.value.toPrompt),
    }),
  // 运行期配置一律以 getter 形态转发，由 useChat 在使用那一刻求值（与 request 同口径），
  // 故运行时改这些 prop 即刻对下一次请求生效，不必 :key 重建实例（重建会丢整棵对话树）。
  streamMode: () => props.streamMode,
  // 同 request：转发一层闭包，每个流单元才读 prop。两个重载形态（SSEChunk / string）在此
  // 收敛为同一调用点，用断言消解联合签名的调用歧义——运行时按 streamMode 送进来的实参
  // 与业务传入的解析器形态天然一致。
  parseChunk: ((unit: SSEChunk) => {
    const fn = props.parseChunk as ((u: SSEChunk) => ParsedChunk | ParsedChunk[]) | undefined;
    return (fn ?? flatParseChunk)(unit);
  }) as UseChatOptions['parseChunk'],
  // parser 保持 setup 快照：useChat 的逐条记忆化缓存按有无 parser 条件构建，属结构性配置
  parser: props.parser,
  defaultMessages: props.defaultMessages,
  retryTimes: () => props.retryTimes,
  retryInterval: () => props.retryInterval,
  streamTimeout: () => props.streamTimeout,
  continuePrompt: () => props.continuePrompt,
  // 每轮请求落终态后先同步一次树（见 syncTree 契约②），再对外抛事件：宿主的 finish/error/
  // abort 处理器跑起来时 v-model:tree 已是定稿数据，两条通道不会各说各话。
  // syncTree 声明在下方（依赖同样声明在下方的 treeModel），此处经闭包在回调触发时才求值——
  // 回调恒在请求异步收尾时调用，那时 setup 早已跑完，不会撞上暂时性死区。
  onFinish: (m) => {
    syncTree();
    emit('finish', m);
  },
  onError: (m) => {
    syncTree();
    emit('error', m);
  },
  onAbort: (m) => {
    syncTree();
    emit('abort', m);
  },
});

// ============ 追问建议 ============
// 双通道状态机在 useSuggestions 内；此处只做接线（配置来源、消息来源、回填/发送出口）。
// 通道②读 useChat 的原始 messages 而非 parsedMessages：1→N 拆分时末气泡未必带 suggestions。
const {
  visible: visibleSuggestions,
  setSuggestions,
  clearTemp: clearTempSuggestions,
  select: onSuggestionSelect,
} = useSuggestions({
  config: () => props.suggestions,
  messages,
  isLoading,
  fill: (text) => {
    senderRef.value?.setValue(text);
    senderRef.value?.focus();
  },
  // 复用内部发送路径（quote/附件打包、send 事件、发送即清除）；
  // 包一层箭头而非直接传引用：onSend 定义在下方，此处仍处于 TDZ。
  send: (text) => onSend(text),
  onSelect: (item) => emit('suggestion-select', item),
});

// ==================== 划词引用 / 追问 ====================

const bubbleListRef = ref<InstanceType<typeof BubbleList> | null>(null);
// 消息列表滚动容器：划词检测根 / 回链高亮宿主 / 大纲可视区观测 root 三处共用
const quoteRoot = computed(() => bubbleListRef.value?.scrollElement?.() ?? null);

// ── 对话大纲：条目派生（纯计算）+ 可视区观测（DOM）分离，AiChat 只做接线 ──
// 命名避开同名 prop `outline`（vue/no-dupe-keys：模板里会指向歧义）
const outlineState = useMessageOutline({
  messages: parsedMessages,
  // 两个 wrapper 都是「每次调用才读配置」的稳定函数，缺省回落到导出的同一份默认实现。
  // 不能写成 `opts.toLabel ? (m) => opts.toLabel!(m) : undefined`——三元只在 setup 求值一次，
  // 运行时把 toLabel 去掉后包装器仍在、函数体读到 undefined 会抛 TypeError；
  // 反之运行时新增也不会生效。默认值也不在此处重写，避免与 composable 内的默认口径漂移。
  filter: (m) => (outlineOpts.value.filter ?? defaultOutlineFilter)(m),
  toLabel: (m) => (outlineOpts.value.toLabel ?? defaultOutlineToLabel)(m),
  window: () => outlineOpts.value.window ?? 8,
  activeId: () => visible.activeId.value,
});
const visible = useVisibleMessage({
  root: quoteRoot,
  ids: () => outlineState.entries.value.map((e) => e.messageId),
  enabled: outlineEnabled,
});

// 点击刻度：上闸门 → 定位；解闸交给 useVisibleMessage 的「滚动静默」判定。
// 刻意不在成功路径上调 endNavigate——scrollToBubble 在**目标行挂载**时就 resolve，
// 而 smooth 滚动的动画还要几百毫秒，此时解闸会让观测在动画途中把高亮抢走（正是闸门要防的事）。
const onOutlineSelect = async (entry: OutlineEntry) => {
  visible.beginNavigate(entry.messageId);
  try {
    await bubbleListRef.value?.scrollToBubble(entry.messageId, { smooth: true });
  } catch (err) {
    // 定位失败（组件卸载 / 下标越界等边界态）→ 根本不会发生滚动，立即解闸；
    // 不解的话要等兜底超时，期间活跃高亮停更。闸门自身另有最长持有时长保底，不会死锁。
    visible.endNavigate(entry.messageId);
    throw err;
  }
};

// 划词引用 / 追问的整套接线（L1 检测 → L2 菜单 → chip 暂存 → 回链高亮）在 useQuoteBinding 内；
// AiChat 只提供它需要的宿主能力：滚动容器、滚动定位、消息查询、输入框写入 / 聚焦。
const {
  pendingQuotes,
  visibleQuotes,
  hiddenChipCount,
  chipsExpanded,
  removeQuote,
  clearQuotes,
  locateAnchor,
  quoteMessage: onQuoteMessage,
  menu: quoteMenu,
  active,
  trigger,
} = useQuoteBinding({
  config: resolvedQuote,
  root: quoteRoot,
  scrollToBubble: (id) =>
    bubbleListRef.value?.scrollToBubble(id, { smooth: true }) ?? Promise.resolve(null),
  messageFor: (id) => parsedMessages.value.find((m) => m.id === id),
  setSenderValue: (text) => senderRef.value?.setValue(text),
  focusSender: () => senderRef.value?.focus(),
});

// 包一层：对外抛 send 事件后再委托 useChat；pendingQuotes 打包成一等 quote 块前置进 content
// （单源真源，无 extra.quotes），发送即清空
const onSend = (text: string, attachments?: AttachmentItem[], meta?: SubmitMeta) => {
  // 并发守卫与 useChat.onSend 的 isLoading 守卫对齐：本函数是命令式公开 API（defineExpose）
  // 的入口，流式期间被外部调用时下游会静默拒收，若仍往下走就会 ① 抛出一个消息根本没发出的
  // send 事件（业务据此埋点/持久化即失真）② 清空用户攒好的 pendingQuotes 且不可恢复。
  // 提前返回让「未受理」在此收敛，与 onEditMessage / onBlockAction 的「仅受理时才对外透出」
  // 同一原则。Sender 内部路径本就有 doSubmit 守卫，不受影响。
  if (isLoading.value) return;
  const quotes = pendingQuotes.value;
  clearTempSuggestions(); // 发送即清除通道①临时建议（含点击建议本身）
  // 按实际有值的参数个数分档 emit，不补尾随 undefined：emit 的实参个数是可观测契约
  // （消费方的 `emitted('send')[0]` 断言、`(...args) => args.length` 都看得见），
  // 无附件时多抛两个 undefined 会破坏既有接入方。
  if (meta) emit('send', text, attachments?.length ? attachments : undefined, meta);
  else if (attachments?.length) emit('send', text, attachments);
  else emit('send', text);
  if (!quotes.length && !attachments?.length) return sendMessage(text);
  const blocks = [
    ...(quotes.length ? [quoteBlock(quotes)] : []),
    ...(attachments?.length ? [attachmentBlock(attachments)] : []),
    ...(text ? [textBlock(text)] : []),
  ];
  clearQuotes();
  return sendMessage(blocks);
};

// v-model:messages 桥接：messages 现为对话树派生的只读 computed。
// - 受控（父传入非空初始）时导入为线性树；
// - 否则把当前 active path 镜像给外部 model。
// active path 引用仅在结构变化（增节点/切分支）时变，watch 同步即可，无需 deep。
if (messagesModel.value.length > 0) {
  setMessages(messagesModel.value);
} else {
  messagesModel.value = messages.value;
}
// 是否绑定了 v-model:tree：以 tree 为权威持久化通道时，messages 仅作只读镜像输出，
// 不再反向导入——否则两条桥接在同一 flush 同时回写父级两个 model，messages model 会被
// prop 回灌成 []，触发 setMessages([]) 把内部树清空（这也是两个 model 不能同时绑的原因）。
// 用编译后的 vnode props 探测：v-model:tree 必带 onUpdate:tree 监听，初值为 undefined 也能识别。
// props.treeMode 显式声明时优先于探测（见其 prop 注释）：探测依赖编译后的 vnode 形态，
// h()/JSX 手写、经高阶组件 $attrs 中转等场景可能失准，留一个不依赖私有 API 的逃生口。
const vnodeProps = getCurrentInstance()?.vnode.props;
const isTreeBound =
  props.treeMode ?? (!!vnodeProps && ('onUpdate:tree' in vnodeProps || 'tree' in vnodeProps));
watch(messages, (v) => {
  // toRaw 判等与下方反向 watch 对齐：父侧深响应式仓库回灌的是同一数组的 reactive proxy，
  // 裸 !== 对 proxy 恒真。当前 activePath 每次重算都产出新数组，此守卫两种写法结果相同，
  // 属防御一致性——若未来出现同一数组回声路径，裸判等会退化为重复回写
  if (toRaw(v) !== toRaw(messagesModel.value)) messagesModel.value = v;
});
watch(messagesModel, (v) => {
  // tree 受控时禁用 messages 反向导入（tree 通道唯一权威），仅保留 messages 输出镜像。
  if (isTreeBound) return;
  // 身份判等必须用 toRaw：父侧若把 model 存进深响应式源（如 useConversations 的会话仓库），
  // 回灌的 v 是同一数组的 reactive proxy——直接 !== 恒真，会与上方镜像输出 watch 形成
  // setMessages ⇄ 镜像 的无限乒乓（Maximum recursive updates，流式期每帧结构变化即触发）。
  if (v && toRaw(v) !== toRaw(messages.value)) {
    // 外部整体替换消息列表（典型：切换会话）时，若仍有在途请求先中断，
    // 避免旧流继续 mutate 已脱离的旧对象、isLoading 紊乱。
    if (isLoading.value) abort();
    setMessages(v);
    clearTempSuggestions(); // 切会话：旧会话的通道①临时建议不得跨会话残留显示
  }
});

// v-model:tree 桥接：分支感知的持久化通道。
// 受控时以 tree 为准（优先于 messages），外部替换整体 tree 时（切会话）导入；
// 结构变化（增节点/切分支）时导出回父。同时绑 v-model:messages 与 v-model:tree 时，tree 优先。
const treeModel = defineModel<ExportedTree | undefined>('tree');
// 外部树数据的入口归一：nodes 非数组（持久化被截断 / 篡改 / 自定义 storage 只写了半截）
// 按空树处理，与 messageTree.importTree、useConversations 的脏数据口径一致。
// 不设防时损坏数据会在挂载或 watch 回调里直接读 .nodes.length 抛穿整个渲染。
const safeTree = (v: ExportedTree | undefined): ExportedTree =>
  v && Array.isArray(v.nodes) ? v : { nodes: [], headId: ROOT_ID };
// 受控：父提供初始 tree 时导入（优先于 messages）
const initialTree = safeTree(treeModel.value);
if (initialTree.nodes.length) {
  importTree(initialTree);
}
/**
 * 把当前树导出回父（v-model:tree）。未绑时整条通道空转：exportTree 是 O(节点数) 的全量快照，
 * 而写入的 model 既无人读也无监听可 emit，白跑一趟。
 *
 * **四个调用点即对外契约**，勿增删：① 结构变化（下方 watch）② 请求落终态（onFinish/onError/
 * onAbort）③ 交互块回写命中（onBlockAction）④ 赞踩写回（onFeedback）。完整口径与宿主两种
 * 用法见 README「`update:tree` 的触发口径」。
 *
 * ② 尤其不能省：AI 占位节点入树那一刻就是本轮最后一次结构变化，其后整段流式内容与
 * updating→success 都不改变树结构。缺了它，快照式宿主会持久化一条 `content: []` 且
 * `status: 'loading'` 的 AI 消息，下次加载被 reconcileStuckMessages 判为卡死改成 error。
 */
const syncTree = () => {
  if (!isTreeBound) return;
  treeModel.value = exportTree();
};
// ① 结构变化（增节点/切分支）；branches 引用变化是结构变化的可靠信号。
watch([messages, branches], syncTree);
// 外部整体替换 tree（切会话）时导入；空树 / undefined（切到新会话、或已无激活会话）
// 同样需要导入以清空内部树
watch(treeModel, (v) => {
  if (!isTreeBound) return;
  // undefined 与空树同义，不能提前返回：useConversations.activeTree 的 getter 在「没有激活
  // 会话」时返回 undefined（典型触发点是 remove() 删掉最后一个会话 → activeKey 置空 →
  // active 为 undefined）。此处若放过，内部树纹丝不动，已删会话的消息继续留在视图上；
  // 而 isTreeBound 为真时 messages 的反向导入已被禁用（见上方 watch），没有第二条路兜底。
  const next = safeTree(v);
  const cur = exportTree();
  // 仅在结构不同时才导入，避免与导出 watch 产生抖动
  if (next.headId !== cur.headId || next.nodes.length !== cur.nodes.length) {
    if (isLoading.value) abort();
    importTree(next);
    clearTempSuggestions(); // 切会话：旧会话的通道①临时建议不得跨会话残留显示
  }
});

// 点击快捷问题：以其 label 作为消息发送
const onPromptSelect = (item: PromptItem) => onSend(item.label);

// 交互块动作：先就地写回消息（驱动 DOM），仅当写回命中时再对外透出供业务持久化 / 判分，
// 避免未命中（误传 id）时业务据空动作持久化、与实际消息状态不一致。
const onBlockAction = (payload: BlockActionPayload) => {
  const hit = updateBlock(String(payload.messageKey), payload.action.blockId, payload.action.patch);
  if (hit) {
    syncTree(); // 契约③：块回写是就地 mutate，不改变树结构，须显式同步
    emit('block-action', payload);
  }
};

// 用户消息编辑：先截断重发（驱动 DOM），仅当 useChat 受理（返回 true）时再对外透出供持久化，
// 避免守卫拒绝（流式进行中等）编辑被静默丢弃时业务仍收到 'edit' 误持久化（与 onBlockAction 同构）
const onEditMessage = async (id: string, text: string) => {
  const accepted = await onEdit(id, text);
  if (accepted) emit('edit', { id, text });
};

// 赞/踩反馈：写回 extra（驱动高亮），再对外透出供持久化
const onFeedback = (id: string, value: MessageFeedback | null) => {
  setFeedback(id, value);
  syncTree(); // 契约④：extra.feedback 写回同样不改变树结构
  emit('feedback', { id, value });
};

// 语音播报（opt-in，setup 快照，与 voice 对称）：仅 speech 存在时创建实例
const speech = props.speech
  ? useSpeech({ config: props.speech === true ? {} : props.speech })
  : null;
const speakingId = computed(() => speech?.speakingId.value ?? null);
const speechAutoPlay = computed(
  () => !!speech && (props.speech === true ? false : !!(props.speech as SpeechConfig).autoPlay),
);

// #footer 插槽的动作句柄（见 BubbleFooterActions）。声明为常量而非每次渲染现构造：
// 插槽作用域里的对象若逐帧新建，消费方基于它做的 memo / watch 会全部失效。
// copy / copySource 的语义与内置 BubbleActions.onCopy 逐字对齐——有文本但写入失败视为硬失败
// （不 emit，业务不会误报「已复制」）；无文本时跳过写入但仍 emit，留作业务自定义复制的逃生口。
const footerActions: BubbleFooterActions = {
  copy: async (message) => {
    const text = stripMarkdownForCopy(messageText(message));
    if (text && !(await copyText(text))) return false;
    emit('copy', message);
    return true;
  },
  copySource: async (message) => {
    const text = messageText(message);
    if (text && !(await copyText(text))) return false;
    emit('copy-source', message);
    return true;
  },
  regenerate: (id) => void onReload(id),
  continue: (id) => void continueGenerate(id),
  switchBranch,
  setFeedback: onFeedback,
  startEdit: (id) => bubbleListRef.value?.startEdit(id),
  speak: (message) => speech?.toggle(message),
};

// 消息操作条配置逻辑
const DEFAULT_ACTIONS: ActionsItems = ['copy', 'regenerate'];

// 函数形态对每条消息调用；数组形态保持现状语义（仅 ai+success）
const actionsFor = (item: ChatMessage): ActionsItems | null => {
  const a = props.actions ?? DEFAULT_ACTIONS;
  if (typeof a === 'function') {
    const r = a(item);
    return r && r.length > 0 ? r : null;
  }
  // 1→N 拆分：默认操作条仅末子气泡显示。必须在角色分支**之前**判定，对所有角色一致
  // （与 branchMap 同规则）：一旦挪进下方的 AI 分支，被 parser 拆分的 user 消息每个子气泡都会
  // 拿到 edit 按钮，而 useChat.onEdit 按 resolveParentId 解析回父消息后语义是「把父消息的全部
  // text 块合并改写为单块」——用非首个子气泡进入编辑再保存就会静默丢掉其余段落。
  // 回归用例：__test__/AiChat.subBubbleActions.test.ts
  const sub = item.extra?.__sub as SubBubbleMeta | undefined;
  if (sub && sub.index < sub.count - 1) return null;
  if (item.role === 'user') {
    // 被 parser 拆过的用户消息不给 edit：上面的去重只放行**末**子气泡，而 1→N 时只有首个子
    // 气泡复用父 id（其余为派生 id `${父id}__${序号}`），故走到这里的 sub 恒为派生 id，
    // 必被 useChat.onEdit 的派生 id 守卫拒绝——留一个「点得开、写得进、保存时草稿静默丢失」
    // 的入口不如不给（生产构建下 devWarn 被 DCE，连控制台线索都没有）。
    // 若将来要支持拆分消息的编辑，需让**草稿基线与回写目标都解析到父消息**（气泡只持有父消息
    // 的一个切片，直接拿它的草稿改写父消息就是 onEdit 守卫要防的那种静默丢段落）。
    if (sub) return ['copy'];
    // 固定默认值（不含 delete），不受 props.actions 数组内容影响（数组形态历史语义只配置 AI 消息）；
    // isLoading 时收窄为 [copy]——原本气泡自带铅笔按钮在全局 loading 时整个不渲染
    // （避免草稿在 loading 期间被静默丢弃），这里保留同等的"隐藏入口"效果。
    return isLoading.value ? ['copy'] : ['copy', 'edit'];
  }
  // abort（用户手动停止）与 success 复用同一套操作条：停止后仍可复制/重新生成/点赞点踩/朗读/引用，
  // 并按需追加 'continue'（见下）；error 态走 Bubble.vue 独立的内联重试条，不受本函数影响。
  if (item.role !== 'ai' || (item.status !== 'success' && item.status !== 'abort')) return null;
  const base: ActionsItems = a.length > 0 ? [...a] : [];
  // quote 启用且未被业务显式声明时自动注入（策略 A）；函数形态不自动注入（与 speak 同规则）
  if (resolvedQuote.value.enable && resolvedQuote.value.pcQuoteAction && !base.includes('quote')) {
    base.push('quote');
  }
  // speech 启用且该消息有可朗读文本时追加内置 speak（即便 base 为空也显示，speech 是独立 opt-in）
  if (speech && speech.isSupported.value && speech.resolveText(item)) base.push('speak');
  // continue 完全遵守 actions 配置（与 quote/speak 不同，不是独立 opt-in）：
  // 仅当 actions 非空（业务未显式传 actions: [] 关闭操作条）且消息处于 abort 态时才追加，
  // 放最前面（恢复操作优先级最高）。!base.includes('continue') 防重复：'continue' 是合法
  // ActionKey，业务可能已在 actions 数组里显式声明它（如想自定义位置），此时尊重业务的
  // 显式位置，不再 unshift 出第二个（否则 v-for :key="item.key" 撞重复，渲染错乱）。
  // 额外要求该消息是激活路径链尾：停止后未点"继续生成"而是直接发了新消息 / 编辑重发时，
  // 这条旧 abort 消息仍留在渲染路径里（新一轮对话挂在它下面），但 useChat.continueGenerate
  // 已按链尾守卫拒绝对它续写，此处同步不再展示这个点了也没用的按钮。parsedMessages 已是
  // 按 activePath 顺序排列的数组（含 1→N 展开），其最后一项恒为链尾消息（组）的最后子气泡，
  // 直接比较末项 id 即可，无需额外查树。
  const isChainTail = parsedMessages.value[parsedMessages.value.length - 1]?.id === item.id;
  if (item.status === 'abort' && a.length > 0 && !base.includes('continue') && isChainTail) {
    base.unshift('continue');
  }
  return base.length > 0 ? base : null;
};

// 每条消息的操作条配置（一次计算）：函数形态的用户函数每条消息每轮只调用一次，
// 且 v-if 与 :items 读同一结果，避免两次调用结果不一致。
// 依赖 parsedMessages 及各 item 的 role/status，status 流转（updating→success）会触发重算。
const actionsMap = computed(() => {
  const map = new Map<string, ActionsItems | null>();
  for (const item of parsedMessages.value) map.set(item.id, actionsFor(item));
  return map;
});

// 数组形态为空数组时整个 footer 模板都不挂（避免空 footer 节点）；函数形态恒挂、逐条判定；
// speech 启用时也须挂 footer 以呈现朗读按钮；
// 用户消息的操作条为固定默认值（['copy','edit']，加载中为 ['copy']），
// 不受 props.actions 数组形态影响（数组形态只作用于 AI 消息），
// 因此只要消息列表中存在用户消息，footer 就必须挂载，避免 actions=[] 时连用户消息的固定操作条也被误挂断
const actionsEnabled = computed(
  () =>
    typeof props.actions === 'function' ||
    (props.actions ?? DEFAULT_ACTIONS).length > 0 ||
    !!speech ||
    (resolvedQuote.value.enable && resolvedQuote.value.pcQuoteAction) ||
    parsedMessages.value.some((m) => m.role === 'user'),
);

// 每条可见消息的分支元信息（branches 按逻辑消息 id 键；getBranches 内部已解析派生 id）
const branchMap = computed(() => {
  const map = new Map<string, ReturnType<typeof getBranches>>();
  for (const item of parsedMessages.value) {
    const sub = item.extra?.__sub as SubBubbleMeta | undefined;
    // 1→N 拆分：分支切换器仅在末子气泡显示（与操作条同规则），避免每个子气泡各挂一个
    map.set(item.id, sub && sub.index < sub.count - 1 ? undefined : getBranches(item.id));
  }
  return map;
});

// 存在实际分支（有多版本）或加载中时，footer 需对所有消息（含用户消息）可挂载，
// 以便分支切换器在任意位置出现；isLoading 纳入避免分支生成期间切换器闪烁重挂。
const branchAware = computed(() => branches.value.size > 0 || isLoading.value);

// autoPlay：流式 AI 回复增量喂句。autoStartedId 记录"最近一条已自动起播的消息 id"，
// 防止用户手动停止后被下一 chunk 重启。消息列表只增不回退、autoPlay 永远只作用于末条，
// 故单个 id 足够（无需 Set，避免随会话无界增长）。
let autoStartedId: string | null = null;
if (speech) {
  watch(
    () => {
      const list = parsedMessages.value;
      const last = list[list.length - 1];
      if (!last || last.role !== 'ai') return '';
      // id + status + 文本长度 作为增量信号：消息增长或状态流转即触发
      return `${last.id}:${last.status}:${messageText(last).length}`;
    },
    () => {
      if (!speechAutoPlay.value) return;
      const list = parsedMessages.value;
      const last = list[list.length - 1];
      if (!last || last.role !== 'ai') return;
      if (last.status !== 'updating' && last.status !== 'success') {
        // 终态 error/abort：若正在朗读本条流式回复，停止收尾——否则 feed 不再被调用，
        // session.finish() 永不触发，speakingId 悬挂、会话卡死。
        if (speech.speakingId.value === last.id) speech.stop();
        return;
      }
      if (autoStartedId !== last.id) {
        autoStartedId = last.id;
        speech.feed(last);
      } else if (speech.speakingId.value === last.id) {
        // 仅当仍在朗读本条时续喂（用户手动停止后 speakingId 置空 → 不重启）
        speech.feed(last);
      }
    },
  );
}

defineExpose({
  messages,
  isLoading,
  onSend,
  onReload,
  abort,
  // 包一层：外部经 ref 直设消息（如切会话）不经 v-model watch / isLoading 上升沿，
  // 须在此同步清掉通道①临时建议，防旧会话建议跨会话残留
  setMessages: (m: ChatMessage[]) => {
    clearTempSuggestions();
    setMessages(m);
  },
  // 包一层：命令式回写块与走 onBlockAction 是同一类 mutate（不改变树结构），
  // 须同样同步 v-model:tree（契约③），否则经 ref 直接改块的宿主会漏持久化
  updateBlock: (messageId: string, blockId: string, patch: Record<string, unknown>) => {
    const hit = updateBlock(messageId, blockId, patch);
    if (hit) syncTree();
    return hit;
  },
  resume,
  continueGenerate,
  setSuggestions,
  // 分支导航：内置 BubbleActions 的切换器之外，自绘 #footer / 自定义 actions 也需要这个入口。
  // switchBranch 改的是树结构，契约① 的 watch([messages, branches]) 已会自动 syncTree，
  // 故此处无需（也不该）再显式同步一次——多补一次不会报错，而是让宿主的 @update:tree 收到
  // 重复 emit，在其中做序列化落库 / 埋点的会把同一次切换记两遍。
  // 回归用例：__test__/AiChat.branch.test.ts（断言恰好同步一次）
  switchBranch,
  getBranches,
  // 赞踩写回：与上方 updateBlock 包装同一策略——补 syncTree（契约④，extra 写回不改变树结构），
  // 但**不** emit 'feedback'。调用方就是宿主自己，回抛给它只是回声，还会让「UI 点击」与
  // 「命令式调用」在业务的埋点/持久化里各记一次。
  setFeedback: (id: string, value: MessageFeedback | null) => {
    setFeedback(id, value);
    syncTree();
  },
  // 透传 Sender 命令式能力，便于外部聚焦 / 清空输入框 / 开关附件面板 / 回收待发附件
  focus: () => senderRef.value?.focus(),
  clear: () => senderRef.value?.clear(),
  toggleAttachments: () => senderRef.value?.toggleAttachments(),
  // 与 clear 分开（那个只清输入框文本）：清空待发附件会逐条触发 attachments.onRemove，
  // 供宿主回收 upload 阶段在服务端产生的文件。把 AiChat 挂在 v-if 面板里时，
  // 组件卸载本身已会经 useAttachments 的 scope 销毁走同一条回收路径，
  // 这个入口是给「不卸载、但要在切会话 / 主动放弃这一轮时就地清干净」的场景。
  clearAttachments: () => senderRef.value?.clearAttachments(),
});
</script>

<style lang="scss">
.aix-ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--aix-colorBgLayout, var(--aix-colorBgContainer));

  /* 标题栏容器：本身零样式（不带 padding/border-bottom），只负责「渲染或不渲染」。
     默认视觉下沉到 __header-default（#header 未被业务接管时的内置内容包裹层），
     业务提供 #header 完全接管内容时不会带着这份视觉，不必再手动 reset。 */
  &__header {
    display: flex;
    flex: none;
  }

  /* 内置标题栏内容：底部细分隔线，左图标 + 标题，右侧 extra（关闭等）靠边 */
  &__header-default {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding: var(--aix-paddingSM) var(--aix-padding);
    border-bottom: 1px solid var(--aix-colorBorderSecondary);
  }

  &__header-icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    img {
      width: 20px;
      height: 20px;
    }
  }

  &__header-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--aix-colorTextHeading);
    font-size: var(--aix-fontSize);
    font-weight: var(--aix-fontWeightStrong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__header-extra {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--aix-sizeXS);
  }

  &__body {
    display: flex;
    position: relative;
    flex: 1;
    flex-direction: column;
    min-height: 0;

    /* 欢迎页超高时内部滚动。刻意**不写 flex: 1**：Welcome 的垂直居中靠 is-fill-height 的
       `margin: auto 0`，而 margin:auto 需要存在剩余空间才生效——一旦让它撑满，剩余空间为 0，
       居中当场失效（align-items:center 只管水平方向，本容器是 column flex）。
       改用 max-height 封顶：内容短时高度仍由内容决定、margin:auto 照常居中；
       内容超高时被截住并内部滚动，margin:auto 自然塌成 0。两种形态都对，且对既有接入方零影响。
       min-height:0 是 flex 子项滚动的常规解除项，不影响上面的居中（只去掉下限，不设上限）。 */
    > .aix-welcome {
      min-height: 0;
      max-height: 100%;
      overflow-y: auto;
    }
  }

  /* 大纲绝对定位贴右侧，脱离流式布局故不挤压气泡宽度 */
  &__outline {
    position: absolute;
    z-index: 2;
    top: 50%;
    right: var(--aix-paddingXS);
    transform: translateY(-50%);
  }

  /* 旋钮：通栏形态（senderVariant='plain'）通常要 0，让输入框与面板左右贴边 */
  &__sender {
    margin: var(
      --aix-ai-chat-sender-margin,
      var(--aix-paddingSM) var(--aix-padding) var(--aix-padding)
    );
  }

  &__suggestions {
    flex: none;
    padding: var(--aix-paddingXS) var(--aix-paddingSM) 0;
  }

  /* 输入框上方的自由区：position:relative 供业务在其中做绝对定位（形象图溢出到输入框上方等）。
     自身零内外边距 —— 这里放什么完全由业务决定，组件不预设视觉。 */
  &__sender-before {
    display: flex;
    position: relative;
    flex: none;
  }

  /* 组件最底部（Sender 之下）：免责声明等。同样零视觉，只负责占位与不被压缩。 */
  &__bottom {
    flex: none;
  }

  &__quote-chips {
    display: flex;
    flex-wrap: wrap;

    // flex 默认 align-items:stretch 会把同一行内高度较小的 chip 拉伸到与最高元素同高
    // （换行后第二行出现高度不一致的视觉问题）；显式 flex-start 阻断拉伸，让每个 chip/toggle 按自身内容定高。
    align-items: flex-start;
    gap: var(--aix-marginXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingXS) 0;
  }

  &__quote-chips-toggle {
    display: inline-flex;
    box-sizing: border-box;
    flex: none;
    align-items: center;

    // 与 .aix-quote-chip 共用同一控件高度 token 定死等高（padding/行高巧合对齐不可靠）
    height: var(--aix-controlHeightSM);
    padding: 0 var(--aix-paddingXS);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusSM);
    background-color: var(--aix-colorFillTertiary);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      border-color: var(--aix-colorPrimaryBorder);
      color: var(--aix-colorPrimary);
    }
  }
}

/* 回链临时高亮（quoteHighlight.ts 挂载）：子范围高亮层 + 整气泡淡出，两种形态样式各自独立 */
.aix-quote-highlight {
  position: absolute;
  z-index: 1;
  animation: aix-quote-fade-bg 2s var(--aix-motionEaseInOut) forwards;
  border-radius: var(--aix-borderRadiusXS);
  background-color: var(--aix-colorPrimaryBg);
  pointer-events: none;
  mix-blend-mode: multiply;
}

.aix-quote-highlight-fade {
  animation: aix-quote-fade 2s var(--aix-motionEaseInOut) forwards;
}

/* 子范围高亮：纯背景淡出，不描边，避免长文本 getClientRects 多矩形逐个描边出现一堆框 */
@keyframes aix-quote-fade-bg {
  0%,
  60% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}

/* 整气泡降级形态：保留描边脉冲，视觉上区别于纯背景高亮 */
@keyframes aix-quote-fade {
  0%,
  60% {
    opacity: 1;
    box-shadow: 0 0 0 2px var(--aix-colorPrimaryBorder, var(--aix-colorPrimary));
  }

  100% {
    opacity: 0.999; /* 整气泡形态保持可见，仅描边淡出；高亮层由 JS 定时移除 */
    box-shadow: none;
  }
}
</style>
