<template>
  <div
    ref="rootRef"
    :class="[
      ns.b(),
      ns.m(variant),
      ns.is('disabled', disabled),
      ns.is('has-toolbar', !!$slots.toolbar || hasVisibleToolbarItems),
    ]"
    @drop="onDrop"
    @dragover="onDragOver"
    @dragenter="onRootDragEnter"
  >
    <!-- 顶部扩展区：常用于附件预览 / 引用上下文等，位于输入行上方 -->
    <div v-if="$slots.header" :class="ns.e('header')">
      <slot name="header" v-bind="slotScope" />
    </div>
    <!-- 附件面板：展开收起带高度过渡（JS hooks 读 scrollHeight；jsdom 高度 0 自然短路）。
         内层固定包一个由 Sender 自己持有的 div 再放 slot——过渡 hooks 直接对单个 el 写
         height/overflow，若让插槽内容直接充当过渡节点，业务写多根 / fragment 时 Transition
         拿不到唯一 el，会静默丢失高度动画。包一层后宿主爱写几个根节点都不影响。
         这里用 <slot> 原生 fallback 写法即可（不同于 Bubble error / AiChat footer 的显式二选一）：
         附件面板不存在「提供了插槽但期望渲染空」的语义，撞不上 renderSlot 的全 Comment 陷阱。 -->
    <Transition v-if="attach" :css="false" @enter="onPanelEnter" @leave="onPanelLeave">
      <div v-if="panelOpen" :class="ns.e('attachments')">
        <slot name="attachments-panel" v-bind="attachmentScope!">
          <AttachmentsPanel
            :items="attach.items.value"
            :icons="{ upload: icons?.attachmentUpload, close: icons?.attachmentClose }"
            @pick="onPanelPick"
            @drop="onPanelDrop"
            @remove="onPanelRemove"
            @retry="onPanelRetry"
            @close="panelOpen = false"
          >
            <!-- 只换上传占位区（比整块接管 #attachments-panel 轻得多，拖放/进度/卡片全保留） -->
            <template v-if="$slots['attachments-placeholder']" #placeholder="sp">
              <slot name="attachments-placeholder" v-bind="sp" />
            </template>
          </AttachmentsPanel>
        </slot>
      </div>
    </Transition>
    <!-- 隐藏文件 input：附件启用时挂载 -->
    <input
      v-if="attach"
      ref="fileInputRef"
      type="file"
      multiple
      :accept="acceptAttr"
      :class="ns.e('file-input')"
      @change="onFileChange"
    />
    <div :class="ns.e('main')">
      <span v-if="$slots.prefix" :class="ns.e('prefix')">
        <slot name="prefix" v-bind="slotScope" />
      </span>
      <!-- 触发菜单的 combobox 语义：仅在配置了 triggers 时声明，不给普通输入框凭空加弹层语义。
           刻意**不加 role="combobox"**——ARIA 1.2 虽允许 textbox 承担该角色，但多行 combobox
           在各屏幕阅读器上的实现差异大，改 role 有让「多行文本框」这一更关键信息不再播报的风险。
           aria-haspopup + aria-expanded 已补齐「有弹层 / 当前开合」的可感知性（与包内
           ContextWindow / ModelSelector 的 aria-expanded 约定一致），是收益最高、风险最低的一档。 -->
      <textarea
        ref="textareaRef"
        :class="ns.e('input')"
        :value="inner"
        :placeholder="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :aria-label="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :disabled="disabled"
        rows="1"
        :aria-haspopup="trig ? 'listbox' : undefined"
        :aria-expanded="trig ? menuOpen : undefined"
        :aria-controls="menuOpen ? menuId : undefined"
        :aria-activedescendant="
          menuOpen && menuItems.length ? `${menuId}-option-${menuActiveIndex}` : undefined
        "
        @input="onInput"
        @keydown="onKeydown"
        @keyup="onCursorMove"
        @click="onCursorMove"
        @blur="onBlur"
        @paste="onPaste"
        @compositionend="onCompositionEnd"
      />
    </div>
    <!-- 触发菜单（@提及 / 斜杠命令等）：opt-in，未配置 triggers 时 menuOpen 恒为 false 不渲染 -->
    <TriggerMenu
      v-if="menuOpen"
      :items="menuItems"
      :loading="menuLoading"
      :active-index="menuActiveIndex"
      :menu-id="menuId"
      :get-anchor-rect="menuAnchorRect"
      :context-el="textareaRef"
      @update:active-index="menuActiveIndex = $event"
      @select="applyTriggerSelect"
    />
    <!-- 底部工具栏：始终渲染（承载发送键）；内置项（attach/voice）/自定义项/toolbar slot 默认全部靠左，
         发送键固定在最右——未显式插入 'spacer' 时，由下方补的隐式 spacer 元素把发送键推到最右；
         数组里显式放了 'spacer'，则改由该占位符切分左右分组（其后内容含发送键被推到右侧） -->
    <div :class="ns.e('toolbar')">
      <template v-for="item in toolbarItems" :key="typeof item === 'string' ? item : item.key">
        <button
          v-if="item === 'attach' && attach"
          type="button"
          :class="[ns.e('attach-btn'), ns.is('active', panelOpen)]"
          :aria-label="t.attachButton"
          :title="t.attachButton"
          :disabled="disabled"
          @click="toggleAttachments"
        >
          <!-- aria-hidden：图标在此纯装饰，按钮的可及名来自 aria-label；@aix/icons 自身不声明
               （580 个图标无一自带），自定义图标更不可能，故统一在使用侧标注。
               @aix/icons 的 svg 根挂了 v-bind="$attrs"，属性能正确落到根元素上。 -->
          <component :is="resolveIcon(icons?.attach, Attachment)" aria-hidden="true" />
          <span v-if="!panelOpen && attach.items.value.length > 0" :class="ns.e('attach-badge')">
            {{ attach.items.value.length }}
          </span>
        </button>
        <button
          v-else-if="item === 'voice' && showMic"
          type="button"
          :class="[ns.e('mic'), ns.is('listening', isListening)]"
          :aria-label="isListening ? t.voiceStopButton : t.voiceButton"
          :title="isListening ? t.voiceStopButton : t.voiceButton"
          :disabled="disabled"
          @click="toggleVoice"
        >
          <component :is="resolveIcon(icons?.voice, Mic)" aria-hidden="true" />
        </button>
        <span v-else-if="item === 'spacer'" :class="ns.e('toolbar-spacer')" aria-hidden="true" />
        <component
          :is="item.component"
          v-else-if="typeof item === 'object'"
          v-bind="item.props"
          :sender="slotScope"
        />
      </template>
      <slot name="toolbar" v-bind="slotScope" />
      <!-- 未显式放 spacer 时，在发送键前补一个隐式 spacer：与显式 spacer 走同一套 CSS 机制，
           而不是单独给发送键加 margin-left:auto——避免两种推右方式并存、多个 auto margin 分摊空间的歧义。
           autoSpacer=false 时业务已完全自绘布局，不再补这个隐式占位符（见其 prop 注释）。 -->
      <span
        v-if="!hasExplicitSpacer && autoSpacer"
        :class="ns.e('toolbar-spacer')"
        aria-hidden="true"
      />
      <button
        type="button"
        :class="[ns.e('send'), ns.is('streaming', loading)]"
        :disabled="
          disabled ||
          (!loading && (isUploading || (!inner.trim() && !hasDone && !allowEmptySubmit)))
        "
        :aria-label="loading ? t.stopButton : isUploading ? t.attachmentUploading : t.sendButton"
        :title="loading ? t.stopButton : isUploading ? t.attachmentUploading : t.sendButton"
        @click="onSendClick"
      >
        <!-- 自定义图标存在时直出组件；否则走内置 CSS mask（形状来自本地 SVG，颜色随 currentColor
             主题着色）。mask 图源走 --aix-sender-send-icon / --aix-sender-stop-icon 两个变量，
             默认值以 var() fallback 形式写在样式表里（见文末），**不得写成内联 style**：
             内联优先级压过一切外部样式表，宿主想换图标就只能带 !important、甚至根本盖不掉
             （改 background-image 还会被内置 mask 按纸飞机轮廓裁掉，看着像"换了但形状不对"）。
             回归用例：__test__/Sender.customization.test.ts（断言图标节点无 style 属性） -->
        <component :is="sendIcon" v-if="sendIcon" aria-hidden="true" />
        <span v-else :class="ns.e('send-icon')" aria-hidden="true" />
      </button>
    </div>
    <!-- 底部扩展区：位于工具栏之下，用于字数统计 / 提示语 / 自定义页脚等 -->
    <div v-if="$slots.footer" :class="ns.e('footer')">
      <slot name="footer" v-bind="slotScope" />
    </div>
  </div>
</template>

<script lang="ts">
/**
 * 工具栏内置项：'attach' 附件按钮 / 'voice' 语音按钮，实际是否渲染仍分别由 attachments/voice prop 决定；
 * 'spacer' 是纯布局占位符（不产生可见内容），插入到数组中希望左右分组的位置——
 * 其之前的项（含 'spacer' 本身）靠左，之后的项（含发送键）被推到最右侧。
 * 不插入 'spacer' 时行为不变：所有项靠左，发送键始终固定在最右。
 */
export type ToolbarBuiltinKey = 'attach' | 'voice' | 'spacer';

/** 工具栏自定义项：任意 Vue 组件；受控状态经独立 `sender` prop 注入，不与 props 合并（见 Task 2） */
export interface ToolbarItem {
  key: string;
  component: Component;
  props?: Record<string, unknown>;
}

/** 工具栏项数组：内置字符串项与自定义对象项混排，渲染顺序 = 数组顺序 */
export type SenderToolbarItems = (ToolbarBuiltinKey | ToolbarItem)[];

/** 输入框外观形态：'card' 圆角描边卡片（默认）/ 'plain' 贴边通栏，见 `SenderProps.variant` */
export type SenderVariant = 'card' | 'plain';

export interface SenderProps {
  /** 输入框文本（v-model），受控 */
  modelValue?: string;
  /** 占位提示，缺省取 locale.senderPlaceholder */
  placeholder?: string;
  /** 加载态：发送按钮切换为停止按钮，点击触发 cancel，默认 false */
  loading?: boolean;
  /** 是否禁用整个输入框，默认 false */
  disabled?: boolean;
  /** 提交方式：'enter' 回车发送（Shift+Enter 换行）/ 'shiftEnter' 反之，默认 'enter' */
  submitType?: 'enter' | 'shiftEnter';
  /**
   * 附件能力（opt-in）：不传则完全不渲染附件 UI。传入后启用回形针按钮 / 拖拽 / 粘贴上传。
   * 视为静态配置（setup 快照建状态机），运行时切换不生效——与 markdownRenderers 约定一致。
   *
   * 两种传法：
   * - **配置对象**（`UseAttachmentsOptions`）：Sender 内部自行 `useAttachments`，最省事。
   * - **已创建的实例**（`UseAttachmentsReturn`）：宿主自己持有状态，把附件 UI 放到 Sender
   *   之外（页面顶部工具条等）也能复用同一份 items —— 发送时的 `drain()`、上传中禁发守卫
   *   仍由 Sender 走这份实例，不会各持一份而分叉。
   *
   * 二者靠 `'drain' in v` 判别（`UseAttachmentsOptions` 无同名字段，不会误判）。
   */
  attachments?: UseAttachmentsOptions | UseAttachmentsReturn;
  /**
   * 语音输入（opt-in）：true=全默认（Web Speech API + navigator.language）；对象=自定义识别器/语言。
   * 不传则不渲染麦克风按钮；浏览器不支持且未注入识别器时按钮自动隐藏。
   * 视为静态配置（setup 快照），运行时切换不生效。
   */
  voice?: boolean | VoiceConfig;
  /** 有外部附加内容（如引用 chip）时允许空文本提交，默认 false */
  allowEmptySubmit?: boolean;
  /**
   * 触发菜单（opt-in）：@提及 / 斜杠命令等按字符触发的候选菜单。
   * 视为静态配置（setup 快照），运行时切换不生效——与 attachments/voice 约定一致。
   */
  triggers?: TriggerConfig[];
  /**
   * 工具栏项：内置 'attach'/'voice' 与自定义对象混排，渲染顺序 = 数组顺序。
   * 'attach'/'voice' 是位置占位符，实际是否出内容仍分别由 attachments/voice prop 决定。
   */
  toolbarItems?: SenderToolbarItems;
  /**
   * 未显式放置 'spacer' 时是否自动在发送键前补一个隐式 spacer，默认 true。
   *
   * 业务完全接管 `#toolbar`（`toolbarItems: []`，不使用任何内置 attach/voice 项）自绘全部
   * 布局时，隐式 spacer 会插在 slot 内容与发送键之间，把业务自己的左右分组打乱；设为 `false`
   * 即不再补，无需 `toolbarItems: ['spacer']` 占位 + `:deep(.aix-sender__toolbar-spacer)
   * { display: none }` 那道 hack。不影响显式放置的 'spacer'（那始终按数组顺序渲染）。
   * 回归用例：__test__/Sender.test.ts
   */
  autoSpacer?: boolean;
  /**
   * 覆盖内置按钮图标（仅换图标，按钮行为与 a11y 文案不变）。
   * 未提供的键回退内置图标，故可只换其中一两个。
   *
   * 想连**交互行为**一起接管（换按钮而非换图标）时，改用 `toolbarItems` 里的自定义对象项，
   * 或 `#toolbar` 插槽——两者都能从 `SenderSlotScope` 拿到 `toggleAttachments` /
   * `toggleVoice` 等动作，完整复刻内置按钮。
   *
   * 传入组件建议用 `markRaw()` 包裹，避免组件对象进入响应式系统触发 Vue 告警
   * （与 ActionItem.icon 同约定）；图形建议用 `fill="currentColor"`，才能随按钮状态
   * （可发送 / 禁用 / 输出中）与主题一起变色——内置图标与 @aix/icons 全系都是这个约定。
   * 使用侧会统一补 `aria-hidden="true"`（图标纯装饰，可及名来自按钮的 aria-label）。
   */
  icons?: SenderIcons;
  /**
   * 外观形态，默认 `'card'`（行为完全不变）：
   *
   * - `'card'`：圆角描边卡片 + 阴影 + 悬停/聚焦主色描边，适合居中对话页里「浮在内容之上」的输入框；
   * - `'plain'`：去掉边框 / 圆角 / 阴影 / 悬停与聚焦描边，只保留内边距与布局，
   *   适合侧边栏、移动端、全屏页这类**贴边通栏**形态（分隔线交由宿主自己画，位置与颜色各家不同）。
   *
   * 配合 `--aix-sender-padding` / `--aix-sender-gap` / `--aix-sender-input-padding` /
   * `--aix-sender-toolbar-padding` 四个尺寸旋钮，通栏形态基本不必再写 `:deep`。
   */
  variant?: SenderVariant;
}

/**
 * 单个图标的取值：Vue 组件，或图片地址（URL / data-URI，按 `<img>` 渲染）。
 *
 * 放开字符串是为了与同组件的 `headerIcon`（AiChat 层）等既有取值口径一致，
 * 只想换一张图时不必写 `() => h(MyIconWrapper, { name: 'x' })` 包一层。
 *
 * 注意两种形态的着色能力不同：组件形态（推荐 `fill="currentColor"`）会随按钮状态
 * （可发送 / 禁用 / 输出中）与主题一起变色；`<img>` 形态是位图/独立着色的矢量图，
 * 颜色固定，不参与主题联动。要主题联动又不想写组件时，改用 CSS 变量换 mask 图源
 * （`--aix-sender-send-icon` / `--aix-sender-stop-icon`）。
 */
export type SenderIconSource = Component | string;

/**
 * 内置按钮的图标覆写表。
 *
 * `send` / `stop` **按状态各自独立回退**：只提供 `send` 时，流式输出中仍用内置停止图标，
 * 而不是拿发送图标去冒充停止——那会让「正在输出、点此停止」这个语义彻底反过来。
 */
export interface SenderIcons {
  /** 附件按钮（回形针） */
  attach?: SenderIconSource;
  /** 语音按钮（麦克风）；聆听态复用同一图标，由 `.is-listening` 类着色区分 */
  voice?: SenderIconSource;
  /** 发送按钮的默认态图标 */
  send?: SenderIconSource;
  /** 发送按钮在流式输出中的图标（停止） */
  stop?: SenderIconSource;
  /** 内置附件面板的上传占位图标；仅在未提供 `#attachments-panel` 插槽（走内置 AttachmentsPanel）时生效 */
  attachmentUpload?: SenderIconSource;
  /** 内置附件面板的收起按钮图标；仅在未提供 `#attachments-panel` 插槽（走内置 AttachmentsPanel）时生效 */
  attachmentClose?: SenderIconSource;
}
export interface SenderEmits {
  /** 输入框文本变化（v-model 同步） */
  (e: 'update:modelValue', v: string): void;
  /**
   * 提交发送：text 当前文本（可为空串=纯附件发送）；attachments 仅在启用附件且有已传完条目时存在。
   * error 态附件不随本次发送消耗，留在预览区等待用户重试或删除。
   */
  (e: 'submit', v: string, attachments?: AttachmentItem[], meta?: SubmitMeta): void;
  /** 取消 / 停止（loading 态下点停止按钮触发） */
  (e: 'cancel'): void;
}

/**
 * 输入框 prefix / header / toolbar / footer 作用域插槽回传的上下文：
 * 动作句柄 + 受控状态，业务可在官方发送/停止键旁加自定义按钮（模型选择 / 联网 /
 * 深度思考开关等）并复用发送、停止、清空逻辑与 loading/disabled 态。
 */
export interface SenderSlotScope {
  /** 触发发送（与点击发送键同守卫：loading/disabled/上传中/空内容时不发） */
  send: () => void;
  /** 停止 / 取消当前流式（等价 loading 态点停止键，emit cancel） */
  cancel: () => void;
  /** 清空输入框 */
  clear: () => void;
  /** 当前是否加载 / 流式中 */
  loading: boolean;
  /** 是否禁用 */
  disabled: boolean;
  /** 是否正在语音聆听 */
  recording: boolean;
  /** 当前输入框文本 */
  value: string;

  // ── 以下用于「自定义按钮完整替代内置 attach / voice 项」──
  // 只换图标不必用这些（见 SenderProps.icons）；把 'attach' / 'voice' 从 toolbarItems 摘掉、
  // 改用自定义对象项或 #toolbar 插槽自绘按钮时，这些是复刻内置行为与视觉所需的最小集。

  /** 切换附件面板；未启用附件（未传 attachments）或 disabled 时为空操作 */
  toggleAttachments: () => void;
  /** 附件面板当前是否展开（内置按钮据此上 is-active 高亮） */
  attachmentsOpen: boolean;
  /** 待发附件数（内置按钮据此渲染角标） */
  attachmentCount: number;
  /** 是否启用了附件能力（未传 attachments prop 时为 false，自定义按钮据此决定要不要渲染） */
  attachmentsEnabled: boolean;
  /** 切换语音聆听（起播 / 停止）；语音不可用或 disabled 时为空操作 */
  toggleVoice: () => void;
  /** 语音是否可用（注入了识别器，或浏览器支持 Web Speech API；内置按钮据此决定是否渲染） */
  voiceSupported: boolean;
}

/**
 * `#attachments-panel` 作用域插槽回传的上下文：整块换掉内置附件面板 UI，但**共用 Sender 内部的
 * useAttachments 实例**——发送时的 `drain()`、上传中禁发守卫、条目清空后自动收起面板、
 * 根级拖放 / 粘贴入列，全部原样保留，业务只需要画界面。
 *
 * 与 `SenderSlotScope` 的分工：那个是「替换附件**按钮**」（开合面板的入口），
 * 这个是「替换附件**面板**」（面板里长什么样）。两者互不依赖，可单用也可合用。
 *
 * 所有动作句柄都已内建 `disabled` 守卫（面板可在展开后才被禁用，如表单提交期间），
 * 自定义 UI 不必自己重做这层判断。
 */
export interface SenderAttachmentsSlotScope {
  /** 待发附件列表（含 uploading / done / error 过程态与进度） */
  items: PendingAttachment[];
  /** 打开原生文件选择器 */
  pick: () => void;
  /** 追加文件（自定义拖放 / 粘贴区调用），走与内置面板同一条 add 通道（含类型、数量、大小校验） */
  add: (files: FileList | File[]) => void;
  /** 移除指定条目（同时中断其进行中的上传） */
  remove: (id: string) => void;
  /** 重试失败条目 */
  retry: (id: string) => void;
  /** 收起面板 */
  close: () => void;
  /** 是否有条目正在上传（发送键据此禁用，自定义 UI 可同步提示） */
  isUploading: boolean;
  /** 文件类型过滤（input accept 语法），透传自附件配置 / 实例 */
  accept?: string;
  /** Sender 是否处于禁用态 */
  disabled: boolean;
}

// 触发菜单实例 id 自增计数器：置于模块顶层（非 setup 块），保证多实例 menuId 唯一，
// 且不因组件重新 setup（如 keep-alive 重建）而重置。
let triggerMenuUid = 0;
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace } from '@aix/hooks';
import { Attachment, Mic } from '@aix/icons';
import { ref, computed, watch, nextTick, reactive, onUnmounted } from 'vue';
import type { Component } from 'vue';
import { useAttachments } from '../composables/useAttachments';
import type {
  UseAttachmentsOptions,
  UseAttachmentsReturn,
  PendingAttachment,
} from '../composables/useAttachments';
import { useTriggerDetect } from '../composables/useTriggerDetect';
import { useVoiceInput } from '../composables/useVoiceInput';
import { locale } from '../locale';
import type {
  AttachmentItem,
  MentionEntity,
  SubmitMeta,
  TriggerConfig,
  TriggerItem,
  VoiceConfig,
} from '../types';
import { getCaretRect } from '../utils/caretRect';
import { devWarn } from '../utils/devWarn';
import { resolveIcon } from '../utils/resolveIcon';
import AttachmentsPanel from './AttachmentsPanel.vue';
import TriggerMenu from './TriggerMenu.vue';

const props = withDefaults(defineProps<SenderProps>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  submitType: 'enter',
  allowEmptySubmit: false,
  toolbarItems: () => ['attach', 'voice'] as SenderToolbarItems,
  autoSpacer: true,
  variant: 'card',
});
const emit = defineEmits<SenderEmits>();
const ns = useNamespace('sender');
const { t } = useLocale(locale);

// 附件状态机：未启用时为 null，模板/逻辑全部以 attach 为开关，零开销（静态配置，setup 快照）。
// 传实例时直接复用宿主那份（不再 useAttachments），保证 drain / isUploading 与宿主 UI 同源。
const attach = props.attachments
  ? 'drain' in props.attachments
    ? props.attachments
    : useAttachments(props.attachments)
  : null;

// 原生 `<input accept>` 的过滤值：配置对象直接取，实例走其 accept 回显字段（见 UseAttachmentsReturn.accept）。
// 取不到时只是原生选择器不预过滤，useAttachments.add 内的 matchesAccept 仍会兜底拒收。
const acceptAttr = props.attachments?.accept;

// ============ 触发菜单（静态配置，setup 快照；未配置时 trig 为 null 零开销） ============
const triggers = (() => {
  if (!props.triggers?.length) return [];
  const seen = new Set<string>();
  for (const tc of props.triggers) {
    if (seen.has(tc.char)) {
      devWarn(`[ai-chat] Sender triggers 触发字符 "${tc.char}" 重复，后者将覆盖前者`);
      break; // 只 warn 一次
    }
    seen.add(tc.char);
  }
  return props.triggers;
})();
const trig = triggers.length ? useTriggerDetect(triggers) : null;
const menuOpen = computed(() => !!trig?.active.value);
const menuItems = ref<TriggerItem[]>([]);
const menuLoading = ref(false);
const menuActiveIndex = ref(0);
const menuId = `aix-trigger-menu-${++triggerMenuUid}`;
// 旁路数组：选中即 push，不反解析文本；提交按出现次数配额校验、Backspace 整体删除时移除对应条目
const selectedMentions: MentionEntity[] = [];
let itemsToken = 0; // 异步 items 竞态令牌
let warnedItemsError = false;

// detection 变化 → 解析候选：静态数组按 query 过滤；函数支持同步/异步（令牌防竞态）
if (trig) {
  watch(trig.detection, async (det) => {
    if (!det) {
      itemsToken++; // 关闭即作废在途异步结果，防迟到 Promise 回写陈旧候选
      menuItems.value = [];
      menuLoading.value = false;
      return;
    }
    menuActiveIndex.value = 0;
    const token = ++itemsToken;
    const src = det.config.items;
    if (Array.isArray(src)) {
      const q = det.query.toLowerCase();
      menuItems.value = q
        ? src.filter(
            (it) => it.label.toLowerCase().includes(q) || it.value.toLowerCase().includes(q),
          )
        : src;
      menuLoading.value = false;
      return;
    }
    try {
      const r = src(det.query);
      let list: TriggerItem[];
      if (r instanceof Promise) {
        // 异步加载窗口内清空旧候选：菜单此时只渲染「加载中…」，旧列表不可见——
        // 不清空则 Enter/↑↓ 仍作用于陈旧候选，aria-activedescendant 也会悬空指向不存在的 option
        menuItems.value = [];
        menuLoading.value = true;
        list = await r;
      } else {
        list = r;
      }
      if (token !== itemsToken) return; // 竞态：query 已变化，丢弃旧结果
      menuItems.value = list;
      menuLoading.value = false;
    } catch (err) {
      if (token !== itemsToken) return;
      trig.clear();
      menuLoading.value = false;
      if (!warnedItemsError) {
        warnedItemsError = true;
        console.warn('[ai-chat] Sender triggers items 加载失败，菜单已关闭。', err);
      }
    }
  });
}

// 触发检测统一入口：语音聆听中不进入触发态（双向互斥，spec §5.1-7）
const runDetect = () => {
  if (!trig) return;
  if (isListening.value) {
    trig.clear();
    return;
  }
  const el = textareaRef.value;
  if (!el) return;
  trig.detect(inner.value, el.selectionStart ?? inner.value.length);
};

// 光标移动（方向键 keyup / 鼠标 click）时复检：等值保持语义保证无效移动不重置菜单
// 组词中的 keyup 不复检（与 onInput/onKeydown 的 IME 守卫同口径；keyCode 229 兼容）：
// 否则组词期间浏览器每键触发 keyup（isComposing=true），会以拼音预览文本（如 @zhang）逐键误检测。
// cspell:ignore zhang —— 上方注释里的拼音片段示例，非词汇
const onCursorMove = (e: KeyboardEvent | MouseEvent) => {
  const ke = e as KeyboardEvent;
  if (ke.isComposing || ke.keyCode === 229) return;
  runDetect();
};

// 失焦关闭（菜单 mousedown.prevent 保焦点，点菜单项不会触发 blur）
const onBlur = () => trig?.clear();

// 菜单锚点：@ 用 caret rect，'/' 或测量失败降级 Sender 整框
const rootRef = ref<HTMLElement | null>(null);
const menuAnchorRect = (): DOMRect => {
  const el = textareaRef.value;
  const det = trig?.detection.value;
  if (el && det && det.char === '@') {
    const r = getCaretRect(el, det.startIndex);
    if (r) return r;
  }
  return (
    rootRef.value?.getBoundingClientRect() ?? el?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0)
  );
};

// 面板展开态：回形针 toggle / add 自动展开 / drain 后自动收起 / 根拖入自动展开
const panelOpen = ref(false);

const fileInputRef = ref<HTMLInputElement | null>(null);
const openFilePicker = () => fileInputRef.value?.click();
const onFileChange = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  // 清空必须先于 disabled 早退：若早退跳过清空，恢复可用后再选同名文件时
  // 原生 change 不触发（value 未变），该文件将静默无法添加
  input.value = ''; // 允许重复选同一文件
  if (props.disabled) return; // disabled 覆盖附件全部交互
  if (files.length) attach?.add(files);
};
const onDrop = (e: DragEvent) => {
  if (!attach) return;
  // preventDefault 不受 disabled 约束：dragover 已宣告本区域为 drop target，
  // 此处若因 disabled 早退不阻止默认行为，浏览器会导航打开该文件、整页被替换
  e.preventDefault();
  if (props.disabled || !e.dataTransfer?.files.length) return;
  attach.add(e.dataTransfer.files);
};
// 面板内 pick/拖放/remove/重试事件被面板 stopPropagation、不经根级守卫，须单独受 disabled 约束——
// 面板可在可用态展开后才被禁用（如表单提交期间），此时附件交互应一并失效
const onPanelPick = () => {
  if (!props.disabled) openFilePicker();
};
const onPanelDrop = (files: FileList | File[]) => {
  if (!props.disabled) attach?.add(files);
};
const onPanelRemove = (id: string) => {
  if (!props.disabled) attach?.remove(id);
};
const onPanelRetry = (id: string) => {
  if (!props.disabled) attach?.retry(id);
};
const onDragOver = (e: DragEvent) => {
  if (attach) e.preventDefault(); // 允许 drop
};
// 拖入 Sender 根区域：面板未展开则自动展开（面板内部 drag-in 高亮由面板自身 dragenter 接管，职责分离）。
// 面板内的 dragenter 已 stopPropagation，不会冒泡到此，故面板可见时本回调不被面板内拖拽触发。
const onRootDragEnter = () => {
  if (attach && !props.disabled && !panelOpen.value) panelOpen.value = true;
};
// 注：根区域刻意不监听 dragleave —— 拖拽离开不应收起已展开的面板，故无事可做。
// 面板自身的 drag-in 高亮防闪烁（relatedTarget 仍在内部不算离开）由 AttachmentsPanel 接管。
const onPaste = (e: ClipboardEvent) => {
  if (!attach || props.disabled || !e.clipboardData?.files.length) return;
  e.preventDefault(); // 文件粘贴接管；纯文本粘贴不受影响
  attach.add(e.clipboardData.files);
};

const hasDone = computed(() => !!attach && attach.items.value.some((it) => it.status === 'done'));
const isUploading = computed(() => attach?.isUploading.value ?? false);

// #attachments-panel 作用域插槽上下文：换掉面板 UI，但共用**同一份** useAttachments 实例与
// onPanel* 系列的 disabled 守卫，故自定义 UI 天然继承「面板展开后才被禁用」的约束，
// 也不会与发送时的 drain / 上传中禁发守卫分叉。未启用附件时为 null（插槽本就不渲染）。
const attachmentScope = attach
  ? reactive({
      items: attach.items,
      pick: onPanelPick,
      add: onPanelDrop,
      remove: onPanelRemove,
      retry: onPanelRetry,
      close: () => {
        panelOpen.value = false;
      },
      isUploading,
      accept: acceptAttr,
      disabled: computed(() => props.disabled),
    })
  : null;

// 自动展开/收起：条目数增长且面板关闭 → 展开（add 路径含拖放/粘贴/选择）；变为 0（drain
// 或全部 remove）→ 收起。
// 设计依据：手动收起（items>0）后再 add 仍会重新展开——对齐 ant-design-x demo 的
// onChange → setOpen(true)，新文件落地必须给可见反馈，而非静默累积在已收起的面板里。
if (attach) {
  watch(
    () => attach.items.value.length,
    (len, prev) => {
      if (len > prev && !panelOpen.value) panelOpen.value = true;
      else if (len === 0) panelOpen.value = false;
    },
  );
}

// 面板高度过渡（JS hooks，参照包内 MarkdownRenderer FLIP 模式）：
// enter 从 0 撑到 scrollHeight，结束后置 auto；leave 反向。transitionend + 300ms 兜底清理。
// jsdom 下 scrollHeight=0，enter 直接 done()、leave 立即收起，不影响测试。
//
// 节点上挂上一次过渡的清理函数：快速 toggle（enter 未完成即 leave，或反向）时新 hook 先清旧
// 监听/timer，防旧 finish 在新动画期间误触发（旧 enter finish 的 height:auto 会把收起动画弹回全高）。
interface TransitionEl extends HTMLElement {
  __panelCleanup?: () => void;
}

const onPanelEnter = (el: Element, done: () => void) => {
  const node = el as TransitionEl;
  node.__panelCleanup?.(); // 先清理上一次未完成的过渡
  const target = node.scrollHeight;
  if (!target) {
    done();
    return;
  }
  node.style.overflow = 'hidden';
  node.style.height = '0px';
  void node.offsetHeight; // 强制 reflow，让起始高度生效
  node.style.transition =
    'height var(--aix-motionDurationMid, 0.2s) var(--aix-motionEaseInOut, ease)';
  node.style.height = `${target}px`;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', onEnd);
    node.style.height = 'auto'; // 撑完置 auto，允许内容后续自然变化
    node.style.overflow = '';
    node.style.transition = '';
    node.__panelCleanup = undefined;
    done();
  };
  // 子元素过渡结束会冒泡到面板根（如 AttachmentCard 进度条的 transition: width），
  // 只认面板自身的过渡结束，否则展开动画被提前 finish、高度瞬间跳到 auto
  const onEnd = (e: Event) => {
    if (e.target !== node) return;
    finish();
  };
  node.addEventListener('transitionend', onEnd);
  timer = setTimeout(finish, 300);
  // cleanup 只解绑监听/timer，不动样式（新动画的入口会接管样式），避免误清新动画的起始态
  node.__panelCleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', onEnd);
    node.__panelCleanup = undefined;
  };
};
const onPanelLeave = (el: Element, done: () => void) => {
  const node = el as TransitionEl;
  node.__panelCleanup?.(); // 先清理上一次未完成的过渡
  const start = node.scrollHeight;
  if (!start) {
    done();
    return;
  }
  node.style.overflow = 'hidden';
  node.style.height = `${start}px`;
  void node.offsetHeight; // 强制 reflow
  node.style.transition =
    'height var(--aix-motionDurationMid, 0.2s) var(--aix-motionEaseInOut, ease)';
  node.style.height = '0px';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', onEnd);
    node.style.height = '';
    node.style.overflow = '';
    node.style.transition = '';
    node.__panelCleanup = undefined;
    done();
  };
  // 同 enter：只认面板自身的过渡结束，防子元素冒泡提前 finish
  const onEnd = (e: Event) => {
    if (e.target !== node) return;
    finish();
  };
  node.addEventListener('transitionend', onEnd);
  timer = setTimeout(finish, 300);
  node.__panelCleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', onEnd);
    node.__panelCleanup = undefined;
  };
};

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const inner = ref(props.modelValue);

// 发送键的自定义图标：按当前状态**各自独立**取值——只传了 send 时，流式态取到 undefined
// 便回退内置停止图标，而不是拿发送图标去冒充停止（那会让「正在输出、点此停止」语义反过来）。
// 内置 mask 图标的图源已改由样式表内的 CSS 变量提供（见文末 &__send-icon），此处不再产出内联样式。
// 无自定义时返回 undefined（未给 fallback），模板据此 v-if 落到内置 CSS mask 分支——
// 那个兜底不是组件形态，给不出可用的 fallback 参数。
const sendIcon = computed(() => resolveIcon(props.loading ? props.icons?.stop : props.icons?.send));

// 自适应高度：内容增减时按 scrollHeight 撑高，上限由 CSS max-height 接管（超出后内部滚动）。
//
// 用一个脱离文档流、不可见的镜像 textarea 承接"height:auto 塌陷→按 scrollHeight 重新撑高"这次
// 测量，而不是直接在真实输入框（正在聚焦，且可能身处很长的会话/虚拟消息列表旁边）上做——
// 之前的写法会让真实输入框经历一次真实的高度塌陷再撑高，这个两段式变化牵连整个 flex 布局
// （包括旁边可能高达数千像素的虚拟列表），曾观测到在内容很重的长会话页面上，这次重排会导致
// 刚聚焦的输入框出现一次瞬间 blur→重新 focus 的抖动——普通直接输入不易察觉，但中文拼音输入法
// 组词过程中会因此被打断（表现为"打字打着打着突然失焦"）。
// 镜像元素用 position:fixed 脱离文档流，自身尺寸变化不会牵连页面其余布局；测出目标高度后只
// 对真实输入框做一次单向赋值（height 直接改成目标像素值），真实输入框自己不再经历塌陷态。
let mirrorEl: HTMLTextAreaElement | null = null;
const getMirror = (): HTMLTextAreaElement | null => {
  if (mirrorEl) return mirrorEl;
  // 挂在组件自己的根节点下（而非 document.body）：position:fixed 已经让它脱离文档流，
  // 不需要借宿全局 body 也能不影响页面其余布局；挂在自己子树下顺带保证组件卸载时
  // （无论是否触发 onUnmounted）都会随根节点一起被移除，不会残留野节点。
  if (!rootRef.value) return null;
  const el = document.createElement('textarea');
  el.setAttribute('aria-hidden', 'true');
  el.tabIndex = -1;
  // 复用同一份 CSS class：字体/内边距/边框/行高等影响换行与高度测量的样式直接与真实输入框保持一致，
  // 不需要逐条手动同步（max-height/overflow 在下面用内联样式覆盖掉，测量不受它们影响）。
  el.className = 'aix-sender__input';
  el.rows = 1; // 与真实输入框模板声明的 rows="1" 保持一致，否则浏览器默认 rows=2 会让空/单行内容的测量高度虚高
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    height: 'auto',
    maxHeight: 'none',
    zIndex: '-1',
    boxSizing: 'border-box',
  });
  rootRef.value.appendChild(el);
  mirrorEl = el;
  return el;
};
const autosize = () => {
  const el = textareaRef.value;
  const mirror = getMirror();
  if (!el || !mirror) return;
  mirror.style.width = `${el.clientWidth}px`;
  mirror.value = el.value;
  el.style.height = `${mirror.scrollHeight}px`;
};
onUnmounted(() => {
  mirrorEl?.remove();
  mirrorEl = null;
});

// 语音定稿/预览写入：committedBase = 开始聆听时已有文本 + 已定稿段；interim 在其后实时预览
let committedBase = '';
const applyVoiceText = (text: string) => {
  // disabled 兜底守卫：watch 停止会话前的在途结果（onInterim/onFinal）不得改写输入框，
  // 与附件路径（onPanelDrop/onPanelRetry/onFileChange）的 disabled 约束对齐
  if (props.disabled) return;
  inner.value = text;
  emit('update:modelValue', text);
  nextTick(autosize);
};

// 静态配置（setup 快照）：与 attachments 同约定
const voice = props.voice
  ? useVoiceInput({
      config: props.voice === true ? {} : (props.voice as VoiceConfig),
      onFinal: (text) => {
        committedBase += text;
        applyVoiceText(committedBase);
      },
      onInterim: (text) => applyVoiceText(committedBase + text),
      onError: (error) => {
        if (typeof props.voice === 'object') props.voice.onError?.(error);
      },
    })
  : null;

const isListening = computed(() => voice?.status.value === 'listening');
const showMic = computed(() => !!voice && voice.isSupported.value);

// 工具栏项是否产出可见内容：'attach'/'voice' 由各自的 opt-in prop 决定；'spacer' 是不可见的纯布局占位符，
// 不计入"有内容"；对象项视为总会渲染内容。用于根 class is-has-toolbar 的语义（"工具栏是否有除发送键外的内容"）
const toolbarItemVisible = (item: SenderToolbarItems[number]) => {
  if (item === 'attach') return !!attach;
  if (item === 'voice') return showMic.value;
  if (item === 'spacer') return false;
  return true;
};
const hasVisibleToolbarItems = computed(() => props.toolbarItems.some(toolbarItemVisible));
// 数组里是否已显式放置 'spacer'：放了就不再在发送键前自动补一个——由消费方自己决定左右分组的切分点
const hasExplicitSpacer = computed(() => props.toolbarItems.includes('spacer'));

// 开发期提示：字符串项既非 'attach'/'voice'/'spacer' 也非对象项时（如拼错的 key）渲染时会被静默跳过，
// 每个无效值只警告一次，避免拼写错误长期无提示地"消失"
const warnedInvalidToolbarItems = new Set<string>();
watch(
  () => props.toolbarItems,
  (items) => {
    for (const item of items) {
      if (typeof item === 'string' && item !== 'attach' && item !== 'voice' && item !== 'spacer') {
        if (!warnedInvalidToolbarItems.has(item)) {
          warnedInvalidToolbarItems.add(item);
          devWarn(
            `[ai-chat] Sender toolbarItems 中的 "${item}" 不是有效内置项（仅支持 'attach'/'voice'/'spacer'），也不是对象项，已跳过渲染`,
          );
        }
      }
    }
  },
  { immediate: true },
);

// 聆听中文本被手动改写时重启识别会话：旧会话在途的 interim/final 被令牌守卫丢弃（防重复拼接），
// 以改写后的内容为新基线继续聆听。调用方须先确认 voice 处于 listening 态。
const restartVoiceFrom = (text: string) => {
  voice!.stop();
  committedBase = text;
  voice!.start();
};

// 聆听途中被业务禁用（如表单提交期间 :disabled 置 true）：麦克风按钮已禁用无法手动停、
// Esc 因 textarea disabled 收不到 keydown，识别会话会继续运行并改写文本——此处自动停止聆听
if (voice) {
  watch(
    () => props.disabled,
    (d) => {
      if (d && voice.status.value === 'listening') voice.stop();
    },
  );
}

const onMicClick = () => {
  if (!voice) return;
  if (voice.status.value === 'listening') {
    voice.stop();
  } else {
    trig?.clear(); // 菜单与语音互斥（spec §5.1-7）
    committedBase = inner.value; // 从当前输入内容续写
    voice.start();
  }
};

// ── 附件 / 语音的唯一动作实现：内置按钮、slotScope、defineExpose 三条入口共用 ──
// 内置按钮本可以直接改 panelOpen / 调 onMicClick（模板上的 :disabled 已拦住点击），但那样
// 就有两份等价逻辑，日后只改一处就会与命令式入口的行为悄悄分叉，故统一收敛到这里。
// disabled 守卫对内置按钮是冗余的（按钮已 disabled），对命令式入口（自定义按钮 / ref 调用）
// 则是必需的——它们绕得过 DOM 禁用态。与面板内 onPanelPick / onPanelDrop / onPanelRemove
// 的 disabled 约束同口径。
const toggleAttachments = () => {
  if (!attach || props.disabled) return;
  panelOpen.value = !panelOpen.value;
};
const toggleVoice = () => {
  if (props.disabled) return;
  onMicClick(); // 自身已含「未启用语音则空操作」守卫
};

watch(
  () => props.modelValue,
  (v) => {
    // 区分外部真实改写与 v-model 回声：applyVoiceText emit 后父组件回写同值会触发 watch，
    // 回声时 inner 已是该值不应重启，仅外部真正改写内容时才重启识别会话
    const isExternalRewrite = v !== inner.value;
    inner.value = v;
    if (isExternalRewrite && voice?.status.value === 'listening') restartVoiceFrom(v);
    if (isExternalRewrite) trig?.clear(); // 外部改写内容：触发上下文已失效
    nextTick(autosize);
  },
  // immediate：父组件以非空多行初值挂载时（v-model:input 回填草稿/发送失败保留内容），
  // 首屏即按内容撑高，避免停留在单行高度直到用户首次输入才纠正。
  { immediate: true },
);

const onInput = (e: Event) => {
  inner.value = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', inner.value);
  // 组词中（isComposing）不重启，等 compositionend 落字后统一重启（见 onCompositionEnd），
  // 避免拼音每键 stop/start 风暴（真实浏览器 SpeechRecognition 高频 start 会抛 InvalidStateError）
  if (!(e as InputEvent).isComposing && voice?.status.value === 'listening') {
    restartVoiceFrom(inner.value);
  }
  autosize();
  // 触发检测：组词中不检测（同语音重启守卫）；粘贴产生的 input 不进入触发态（spec §5.1-8）
  if (!(e as InputEvent).isComposing) {
    if ((e as InputEvent).inputType === 'insertFromPaste') trig?.clear();
    else runDetect();
  }
};

// IME 组词结束：落字成为新基线并重启会话（组词期间 onInput 因 isComposing 被跳过）。
// 同步落字到 inner——浏览器在 compositionend 后才补发非组合 input，此处先取元素最新值确保基线含落字。
const onCompositionEnd = (e: Event) => {
  inner.value = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', inner.value);
  if (voice?.status.value === 'listening') restartVoiceFrom(inner.value);
  runDetect(); // 落字后统一检测
};

const doSubmit = () => {
  const text = inner.value.trim();
  // 纯附件发送：text 可空，但须有已传完附件；上传中一律不可发
  if (props.loading || props.disabled || isUploading.value) return;
  // allowEmptySubmit：有外部附加内容（如引用 chip）时放行空文本提交
  if (!text && !hasDone.value && !props.allowEmptySubmit) return;
  // 提交时自动停止语音聆听（守卫之后，确认能提交时再停）
  if (voice?.status.value === 'listening') voice.stop();
  const atts = attach ? attach.drain() : undefined;
  const meta = collectMentions(text);
  // 按实际有值的参数个数分档 emit，不补尾随 undefined（理由同 AiChat.onSend）：
  // emit 的实参个数是可观测契约，本仓有 11 条用例直接断言 emitted 数组的长度。
  if (meta) emit('submit', text, atts?.length ? atts : undefined, meta);
  else if (atts?.length) emit('submit', text, atts);
  else emit('submit', text);
  selectedMentions.length = 0;
  trig?.clear();
  inner.value = '';
  emit('update:modelValue', '');
  // 显式补焦：与本文件其余"改写输入框内容后重新聚焦"的路径（setValue+focus、quote 插入）对齐——
  // 不能只依赖浏览器保留焦点的隐式行为，Enter 提交这一刻常伴随周边 DOM 结构变化（如发出首条
  // 消息触发 Welcome→BubbleList 切换、pendingQuotes 清空导致 header 插槽显隐），足以让 textarea
  // 静默失焦且无人纠正；对已 disabled 的输入框调用 focus() 是浏览器原生空操作，无需额外判断。
  nextTick(() => {
    autosize();
    textareaRef.value?.focus();
  });
};

// 选中候选：replaceWithMeasure 式回填（spec §5.1-2）——
// 最终插入串 = (keepTrigger ? char : '') + insertText；纯 onSelect 项等价 insertText=''，
// 已键入的触发段一并移除。走 setValue 同路径（autosize/v-model/语音基线）。
const applyTriggerSelect = (item: TriggerItem) => {
  const det = trig!.detection.value;
  const el = textareaRef.value;
  if (!det || !el) return;
  const isAt = det.char === '@';
  const keep = item.keepTrigger ?? isAt;
  const body = item.insertText ?? (isAt ? `${item.label} ` : '');
  const ins = (keep ? det.char : '') + body;
  const cursor = el.selectionStart ?? det.startIndex + 1 + det.query.length;
  const next = inner.value.slice(0, det.startIndex) + ins + inner.value.slice(cursor);
  setValue(next);
  const caret = det.startIndex + ins.length;
  nextTick(() => {
    el.setSelectionRange(caret, caret);
    el.focus();
    // 插入后若新文本/光标仍构成触发上下文（自定义 insertText 无尾随空白，如插入 '#话题'），
    // Enter 选中的 keyup 复检会立刻以新 query 重开菜单——而鼠标点选无 keyup 不会，行为不一致。
    // 此处主动对插入后的上下文 detect+dismiss（同一 tick 内完成，menuOpen 批量更新无闪烁）：
    // 同签名复检保持关闭；用户继续键入改变 query 时照常解除驳回。默认回填带尾随空格时
    // detect 为 null，本段为无害空操作。
    trig!.detect(next, caret);
    if (trig!.active.value) trig!.dismiss();
  });
  if (isAt) {
    // 旁路数组记录（配额校验/整体删除见 Task 6）。自定义 insertText 与默认 token
    // 文本（@label）不一致时，提交配额校验会自然将其丢弃——记录无副作用。
    selectedMentions.push({ value: item.value, label: item.label, trigger: det.char });
  }
  item.onSelect?.({ item, trigger: det.char, query: det.query, clear, setValue });
  trig!.clear();
};

// ============ mention 旁路数组语义（spec §5.1-3/4）：不反解析文本 ============
const mentionTokenText = (m: MentionEntity) => `${m.trigger}${m.label}`;

// Backspace 整体删除的匹配：光标前文本以某完整 token（含/不含尾随空格）结尾，
// 多候选取最长（'@张三丰 ' 优先于 '@张三'），返回被删除的整段文本
const findMentionTokenEnd = (before: string): string | null => {
  let best: string | null = null;
  for (const m of selectedMentions) {
    const t = mentionTokenText(m);
    for (const cand of [`${t} `, t]) {
      if (before.endsWith(cand) && (!best || cand.length > best.length)) best = cand;
    }
  }
  return best;
};

const removeOneMention = (token: string) => {
  const norm = token.trimEnd();
  const idx = selectedMentions.findIndex((m) => mentionTokenText(m) === norm);
  if (idx >= 0) selectedMentions.splice(idx, 1);
};

// token 完整出现次数：后随字符须为空白或文本结尾（'@张三' 不匹配 '@张三丰' 内部）
const countOccurrences = (text: string, token: string): number => {
  let n = 0;
  for (let i = text.indexOf(token); i >= 0; i = text.indexOf(token, i + token.length)) {
    const after = text[i + token.length];
    if (after === undefined || /\s/.test(after)) n++;
  }
  return n;
};

// 出现次数配额校验：每种 token 保留数 = min(条目数, 文本中完整出现次数)；
// 超额条目（被手动删改）按数组顺序先进先出保留、后进先出丢弃
const collectMentions = (text: string): SubmitMeta | undefined => {
  if (!selectedMentions.length) return undefined;
  const budget = new Map<string, number>();
  const out: MentionEntity[] = [];
  for (const m of selectedMentions) {
    const token = mentionTokenText(m);
    if (!budget.has(token)) budget.set(token, countOccurrences(text, token));
    const left = budget.get(token)!;
    if (left > 0) {
      budget.set(token, left - 1);
      out.push(m);
    }
  }
  return out.length ? { mentions: out } : undefined;
};

const onKeydown = (e: KeyboardEvent) => {
  // ① IME 守卫最先：组词中 Enter/↑↓/Esc 归输入法（keyCode 229 兼容部分浏览器）。
  //    原「语音 Esc」从守卫前移到守卫后，属 spec 声明的行为修正：组词中 Esc 归输入法取消组词。
  if (e.isComposing || e.keyCode === 229) return;
  // ② 菜单拦截段：菜单打开时接管导航/选中/关闭
  if (menuOpen.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const len = menuItems.value.length;
      if (len) {
        menuActiveIndex.value =
          (menuActiveIndex.value + (e.key === 'ArrowDown' ? 1 : len - 1)) % len;
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault(); // 空列表回车也消费按键：关菜单不提交
      const item = menuItems.value[menuActiveIndex.value];
      if (item) applyTriggerSelect(item);
      else trig!.clear();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      // 必须 dismiss 而非 clear：Esc keydown 关闭后，同一按键的 keyup 会走
      // onCursorMove 复检——文本/光标未变，clear 会导致菜单立刻重开
      trig!.dismiss();
      return;
    }
    if (e.key === 'Tab') trig!.clear(); // 关菜单但放行焦点移动（焦点走了，keyup 不落回 textarea）
  }
  // ②.5 Backspace 整体删除：光标（无选区）恰在完整 mention token 末尾时整体切除
  if (e.key === 'Backspace' && selectedMentions.length) {
    const el = e.target as HTMLTextAreaElement;
    const pos = el.selectionStart ?? 0;
    if (pos > 0 && pos === el.selectionEnd) {
      const token = findMentionTokenEnd(inner.value.slice(0, pos));
      if (token) {
        e.preventDefault();
        setValue(inner.value.slice(0, pos - token.length) + inner.value.slice(pos));
        const caret = pos - token.length;
        nextTick(() => el.setSelectionRange(caret, caret));
        removeOneMention(token);
        return;
      }
    }
  }
  // ③ 语音 Esc 停止聆听（原逻辑，位序后移见 ①）
  if (e.key === 'Escape' && voice?.status.value === 'listening') {
    voice.stop();
    return;
  }
  // ④ Enter 提交判定（原逻辑不变）
  if (e.key !== 'Enter') return;
  const wantShift = props.submitType === 'shiftEnter';
  const matched = wantShift ? e.shiftKey : !e.shiftKey;
  if (matched) {
    e.preventDefault();
    doSubmit();
  }
};

const onSendClick = () => {
  if (props.loading) emit('cancel');
  else doSubmit();
};

const clear = () => {
  inner.value = '';
  emit('update:modelValue', '');
  nextTick(autosize);
  trig?.clear();
  selectedMentions.length = 0;
};

// prefix / header / toolbar / footer 作用域插槽上下文：回传动作句柄 + 受控状态，
// 业务可在官方发送键旁加自定义按钮并复用发送/停止/清空逻辑（详见 SenderSlotScope）。
// 用 reactive 让 loading/disabled/recording/value 以解包后的最新值随渲染回传。
const slotScope = reactive({
  send: doSubmit,
  cancel: () => emit('cancel'),
  clear,
  loading: computed(() => props.loading),
  disabled: computed(() => props.disabled),
  recording: isListening,
  value: inner,
  // 附件 / 语音的开关与状态：让自定义按钮能完整替代内置 attach / voice 项（见 SenderSlotScope）
  toggleAttachments,
  attachmentsOpen: panelOpen,
  attachmentCount: computed(() => attach?.items.value.length ?? 0),
  // attach 是 setup 快照（null 表示未启用附件），非响应式，故直接取布尔而非 computed
  attachmentsEnabled: !!attach,
  toggleVoice,
  voiceSupported: showMic,
});

defineSlots<{
  prefix?: (props: SenderSlotScope) => unknown;
  header?: (props: SenderSlotScope) => unknown;
  toolbar?: (props: SenderSlotScope) => unknown;
  footer?: (props: SenderSlotScope) => unknown;
  /**
   * 替换内置附件面板 UI（仅在启用附件且面板展开时渲染），见 SenderAttachmentsSlotScope。
   * 刻意**不叫** `attachments`：Vue 的组件类型会把同名 slot 与 prop 合并成交叉类型，
   * 与 `attachments` prop 撞名会让该 prop 变得无法赋值（vue-tsc 报 not assignable to 'undefined'）。
   */
  'attachments-panel'?: (props: SenderAttachmentsSlotScope) => unknown;
  /**
   * 只替换**内置**附件面板里的上传占位区（比整块接管 `attachments-panel` 轻得多：
   * 拖放高亮、文件卡片列表、进度与重试全部保留）。仅在走内置面板时生效。
   */
  'attachments-placeholder'?: (props: { pick: () => void; dragIn: boolean }) => unknown;
}>();

/** 命令式写入输入框（划词 ask 的 prompt 注入等）；与 onInput 全同路径（含高度自适应），受控/非受控一致 */
const setValue = (text: string) => {
  inner.value = text;
  emit('update:modelValue', text);
  // nextTick 后再量高：同步 autosize 读到的是 DOM 旧内容——受控模式有 modelValue
  // 回声 watch 纠正，非受控（不绑 v-model）时高度会滞留旧值直到下次用户输入
  void nextTick(autosize);
};

defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear,
  setValue,
  // 与 slotScope 同源：外部持 ref 时也能开关附件面板 / 语音（如把入口放在 Sender 之外的工具条）
  toggleAttachments,
  toggleVoice,
  // 仅供单测验证面板高度过渡的快速 toggle 竞态（VTU 取 Transition 内节点不便，直接单元级调用）
  __onPanelEnter: onPanelEnter,
  __onPanelLeave: onPanelLeave,
});
</script>

<style lang="scss">
/* 发送 / 停止图标以 data URI 内联，而**不是** url('../assets/send-default.svg')：
   本仓构建链路里 rollup-plugin-postcss 没有挂 postcss-url，SCSS 中的相对 url() 既不会被重写
   也不会发射资源文件——产物 es/index.css 会留下一条指向包外不存在路径的引用，图标直接空掉
   （已实测）。内联同时保证「宿主只 import 一个 css 即可」这件事继续成立，不必额外拷贝资源目录。
   两张图都只作 mask 形状用，颜色由 &__send-icon 的 background-color: currentColor 提供，
   SVG 内的 fill 值不参与最终呈现（保留原值只为与源文件逐字一致，便于日后比对替换）。 */
$aix-send-icon-default: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M6.44986 10.3999C6.16986 10.6719 6.12186 11.12 6.36186 11.4401L8.53789 14.5127C9.30591 15.6009 10.9859 15.3528 11.4099 14.0806L15.114 2.94248C15.538 1.67824 14.322 0.46201 13.05 0.88609L1.92179 4.59879C0.641774 5.02287 0.40177 6.70319 1.48979 7.47133L4.56183 9.63974C4.88184 9.87179 5.32984 9.83178 5.60185 9.55973L10.0259 5.14289C10.2499 4.91085 10.6339 4.91085 10.8659 5.14289C11.0899 5.36694 11.0899 5.75101 10.8659 5.98305L6.44986 10.3999Z' fill='%2386909C'/%3E%3C/svg%3E");
$aix-send-icon-stop: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cg clip-path='url(%23clip0_328_4555)'%3E%3Cmask id='mask0_328_4555' style='mask-type:luminance' maskUnits='userSpaceOnUse' x='0' y='0' width='16' height='16'%3E%3Cpath d='M16 0H0V16H16V0Z' fill='white'/%3E%3C/mask%3E%3Cg mask='url(%23mask0_328_4555)'%3E%3Cpath d='M12 8C12 10.2091 10.2091 12 8 12C5.79086 12 4 10.2091 4 8C4 5.79086 5.79086 4 8 4C10.2091 4 12 5.79086 12 8Z' fill='%231546F2'/%3E%3Cpath d='M14.3333 8.00008C14.3333 4.50228 11.4978 1.66675 7.99996 1.66675C4.50216 1.66675 1.66663 4.50228 1.66663 8.00008C1.66663 11.4979 4.50216 14.3334 7.99996 14.3334V15.3334C3.94987 15.3334 0.666626 12.0502 0.666626 8.00008C0.666626 3.94999 3.94987 0.666748 7.99996 0.666748C12.05 0.666748 15.3333 3.94999 15.3333 8.00008C15.3333 12.0502 12.05 15.3334 7.99996 15.3334V14.3334C11.4978 14.3334 14.3333 11.4979 14.3333 8.00008Z' fill='%231546F2'/%3E%3C/g%3E%3C/g%3E%3Cdefs%3E%3CclipPath id='clip0_328_4555'%3E%3Crect width='16' height='16' fill='white'/%3E%3C/clipPath%3E%3C/defs%3E%3C/svg%3E");

.aix-sender {
  display: flex;
  flex-direction: column;

  /* 组件级尺寸旋钮（见 README「样式定制」）：只写 var() fallback、不单独声明默认值 */
  padding: var(
    --aix-sender-padding,
    var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingSM)
  );
  background-color: var(--aix-colorBgContainer);
  gap: var(--aix-sender-gap, var(--aix-sizeXS));

  &.is-disabled {
    background-color: var(--aix-colorBgContainerDisabled);
    box-shadow: none;
  }

  /* ── card（默认）：圆角描边卡片 + 阴影，浮在内容之上 ── */
  &--card {
    transition:
      border-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
      box-shadow var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    box-shadow: var(--aix-shadowSM);

    /* 悬停主色描边，给出"可输入"的预期反馈；聚焦态由下方 focus-within 接管
       （置于 focus-within 之前：同特异度下既悬停又聚焦时 focus-within 胜出，保留焦点环）。 */
    &:hover:not(.is-disabled) {
      border-color: var(--aix-colorPrimaryHover, var(--aix-colorPrimary));
    }

    /* 聚焦时主色描边 + 焦点环，给出清晰的输入焦点反馈 */
    &:focus-within {
      border-color: var(--aix-colorPrimary);
      box-shadow: 0 0 0 var(--aix-controlOutlineWidth) var(--aix-controlOutline);
    }
  }

  /* ── plain（.aix-sender--plain）：贴边通栏形态。
     它的样式就是「上面这些基础声明本身」——不追加边框 / 圆角 / 阴影 / 悬停与聚焦描边，
     因此没有对应的规则块（写一个空规则只会被 stylelint 拦下）。
     也刻意不代画分隔线（border-top 之类）：位置（上/下）、颜色、要不要，各家设计稿都不同，
     组件画了反而多一次覆盖，宿主直接在 .aix-sender--plain 上加自己的边即可。 ── */

  /* 输入行：前缀 + 文本域（发送按钮已挪至下方工具栏行，见 &__toolbar） */
  &__main {
    display: flex;
    align-items: flex-end;
    gap: var(--aix-sizeXS);
  }

  &__prefix {
    display: inline-flex;
    flex: none;
    align-items: center;
    align-self: flex-end;
  }

  /* 顶部扩展区（附件预览 / 引用上下文等），在输入行上方 */
  &__header {
    display: flex;
    flex-direction: column;
    gap: var(--aix-sizeXS);
    padding-bottom: var(--aix-paddingXXS);
  }

  /* 底部工具栏行：始终渲染，左侧工具项 + 发送键共享一行；左右分组由 &__toolbar-spacer 撑开。
     padding 走旋钮：业务自绘 toolbar 时常需要它与 sender 自身 padding 不再叠加（置 0） */
  &__toolbar {
    display: flex;
    align-items: center;
    padding: var(--aix-sender-toolbar-padding, var(--aix-paddingXXS) 0 0);
    gap: var(--aix-sizeXS);
  }

  /* 工具栏行的左右分组占位符：显式插入的 'spacer' 或未插入时自动补在发送键前的隐式占位符，
     共用同一条规则——撑满剩余空间，把自身之后的内容（含发送键）推到行最右侧 */
  &__toolbar-spacer {
    flex: 1 1 auto;
  }

  /* 底部扩展区（字数统计 / 提示语等），在工具栏之下 */
  &__footer {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
  }

  &__input {
    flex: 1;

    /* 自适应高度的下限（内容更少时仍撑住这个高度）。默认 0 = 不设下限，高度纯由内容决定 */
    min-height: var(--aix-sender-min-height, 0);

    /* 自适应高度的上限（超出后内部滚动）。autosize 用镜像 textarea 量高、再单向赋值给真实
       输入框，本上限由 CSS 接管，故调大本变量即可放宽输入框，无需改任何 JS */
    max-height: var(--aix-sender-max-height, 160px);

    /* 旋钮：plain 形态下 sender 自身已给了足够留白，输入框再叠一层 padding 就偏了，置 0 即可 */
    padding: var(--aix-sender-input-padding, var(--aix-paddingXS));
    overflow-y: auto;
    border: none;
    outline: none;
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight);
    resize: none;

    &::placeholder {
      color: var(--aix-colorTextPlaceholder);
    }
  }

  /* 发送按钮：浅灰圆角方底（设计稿语言），图标颜色随状态变化——
     空输入/禁用=次级文本灰（纸飞机），可发送/输出中=主色（纸飞机 / 停止圆点）。
     图标用 currentColor 着色（见 &__send-icon 的 mask 实现）。 */
  &__send {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    /* 组件级尺寸旋钮（见 README「样式定制」）：只写 var() fallback、不声明默认值，
       与 --aix-bubble-max-width 等既有旋钮同约定，可分别定制宽高 */
    width: var(--aix-sender-send-width, var(--aix-controlHeight));
    height: var(--aix-sender-send-height, var(--aix-controlHeight));
    transition:
      background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorFillSecondary);
    color: var(--aix-colorPrimary);
    cursor: pointer;

    /* icons.send / icons.stop 传入的自定义图标：与内置 mask 图标（&__send-icon）等大。
       svg 与 img 并列——icons.* 现在也接受图片地址（见 SenderIconSource），两种形态都得被
       约束到同一尺寸，否则换成 <img> 后按钮会被原图尺寸撑变形。
       组件（svg）形态另继承 currentColor 主题着色；图片形态颜色固定。
       内置图标是 <span> 不是 <svg>/<img>，不受本规则影响。 */
    svg,
    img {
      width: 16px;
      height: 16px;
    }

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFill);
    }

    &:active:not(:disabled) {
      transform: scale(0.92);
    }

    &:disabled {
      color: var(--aix-colorTextTertiary);
      cursor: not-allowed;
    }
  }

  /* 图标本体：以 mask 取设计 SVG 形状，背景填 currentColor 实现主题着色。
     图源走组件级旋钮 --aix-sender-send-icon / --aix-sender-stop-icon，默认值只以 var() 的
     fallback 形式出现、**不单独声明**（与 --aix-bubble-avatar-size 等既有旋钮同约定，见 README
     「样式定制」）：一旦在本元素上声明默认值，宿主写在任意祖先上的同名变量都会被就近覆盖掉。
     -webkit- 前缀交由构建期 autoprefixer 补（本仓 postcss 已挂，且 stylelint 的
     property-no-vendor-prefix 明令不手写前缀）。这也是图源必须留在样式表里的原因之一：
     写进 JS 内联样式的属性根本过不了 postcss，只能自己手写 WebkitMask*。 */
  &__send-icon {
    width: 16px;
    height: 16px;
    background-color: currentColor;
    mask: var(--aix-sender-send-icon, #{$aix-send-icon-default}) no-repeat center / contain;
  }

  /* 输出中：换成停止图标。选择器落在发送键的 is-streaming 上（图标本身无状态类），
     特异度高于上面的 mask 简写，故与源码顺序无关地生效 */
  &__send.is-streaming &__send-icon {
    mask-image: var(--aix-sender-stop-icon, #{$aix-send-icon-stop});
  }

  /* 隐藏文件选择 input */
  &__file-input {
    display: none;
  }

  /* 麦克风按钮 */
  &__mic {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background-color: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    /* svg / img 并列见 &__send 的说明 */
    svg,
    img {
      width: 16px;
      height: 16px;
    }

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }

    &.is-listening {
      background-color: var(--aix-colorPrimaryBg);
      color: var(--aix-colorPrimary);
    }
  }

  /* 回形针按钮：工具栏内，与发送键同尺寸；展开态 is-active 主色高亮（参照 mic is-listening） */
  &__attach-btn {
    display: inline-flex;
    position: relative;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    padding: 0;
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    /* svg / img 并列见 &__send 的说明 */
    svg,
    img {
      width: 16px;
      height: 16px;
    }

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }

    &.is-active {
      background-color: var(--aix-colorPrimaryBg);
      color: var(--aix-colorPrimary);
    }
  }

  /* 收起态数量徽标：绝对定位右上小圆点数字 */
  &__attach-badge {
    display: inline-flex;
    position: absolute;
    top: 0;
    right: 0;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    transform: translate(40%, -40%);
    border-radius: 7px;
    background-color: var(--aix-colorPrimary);
    color: var(--aix-colorTextLight);
    font-size: 10px;
    line-height: 1;
  }
}
</style>
