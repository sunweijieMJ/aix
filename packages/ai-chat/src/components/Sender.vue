<template>
  <div
    ref="rootRef"
    :class="[
      ns.b(),
      ns.is('disabled', disabled),
      ns.is('has-toolbar', !!$slots.toolbar || hasVisibleToolbarItems),
    ]"
    @drop="onDrop"
    @dragover="onDragOver"
    @dragenter="onRootDragEnter"
    @dragleave="onRootDragLeave"
  >
    <!-- 顶部扩展区：常用于附件预览 / 引用上下文等，位于输入行上方 -->
    <div v-if="$slots.header" :class="ns.e('header')">
      <slot name="header" v-bind="slotScope" />
    </div>
    <!-- 附件面板：展开收起带高度过渡（JS hooks 读 scrollHeight；jsdom 高度 0 自然短路） -->
    <Transition v-if="attach" :css="false" @enter="onPanelEnter" @leave="onPanelLeave">
      <AttachmentsPanel
        v-if="panelOpen"
        :items="attach.items.value"
        @pick="openFilePicker"
        @drop="onPanelDrop"
        @remove="attach.remove"
        @retry="onPanelRetry"
        @close="panelOpen = false"
      />
    </Transition>
    <!-- 隐藏文件 input：附件启用时挂载 -->
    <input
      v-if="attach"
      ref="fileInputRef"
      type="file"
      multiple
      :accept="props.attachments?.accept"
      :class="ns.e('file-input')"
      @change="onFileChange"
    />
    <div :class="ns.e('main')">
      <span v-if="$slots.prefix" :class="ns.e('prefix')">
        <slot name="prefix" v-bind="slotScope" />
      </span>
      <textarea
        ref="textareaRef"
        :class="ns.e('input')"
        :value="inner"
        :placeholder="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :aria-label="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :disabled="disabled"
        rows="1"
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
         发送键固定在最右——未显式插入 'spacer' 时靠 CSS margin-left:auto 自动推到最右；
         数组里显式放了 'spacer'，则改由该占位符切分左右分组（其后内容含发送键被推到右侧），见下方补充的隐式 spacer 判断 -->
    <div :class="ns.e('toolbar')">
      <template v-for="item in toolbarItems" :key="typeof item === 'string' ? item : item.key">
        <button
          v-if="item === 'attach' && attach"
          type="button"
          :class="[ns.e('attach-btn'), ns.is('active', panelOpen)]"
          :aria-label="t.attachButton"
          :title="t.attachButton"
          :disabled="disabled"
          @click="panelOpen = !panelOpen"
        >
          <Attachment />
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
          @click="onMicClick"
        >
          <Mic />
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
           而不是单独给发送键加 margin-left:auto——避免两种推右方式并存、多个 auto margin 分摊空间的歧义 -->
      <span v-if="!hasExplicitSpacer" :class="ns.e('toolbar-spacer')" aria-hidden="true" />
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
        <span :class="ns.e('send-icon')" :style="sendIconStyle" aria-hidden="true" />
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
   */
  attachments?: UseAttachmentsOptions;
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
}

// 触发菜单实例 id 自增计数器：置于模块顶层（非 setup 块），保证多实例 menuId 唯一，
// 且不因组件重新 setup（如 keep-alive 重建）而重置。
let triggerMenuUid = 0;
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace } from '@aix/hooks';
import { Attachment, Mic } from '@aix/icons';
import { ref, computed, watch, nextTick, reactive } from 'vue';
import type { Component } from 'vue';
// 发送按钮图标采用设计稿导出的本地 SVG 资源：默认态为纸飞机、输出中为停止圆点。
// 以 CSS mask 渲染，使图标颜色随按钮 color（主题变量）变化，而非 SVG 内置色，符合主题系统约定。
import sendIconUrl from '../assets/send-default.svg';
import stopIconUrl from '../assets/send-streaming.svg';
import { useAttachments } from '../composables/useAttachments';
import type { UseAttachmentsOptions } from '../composables/useAttachments';
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
import AttachmentsPanel from './AttachmentsPanel.vue';
import TriggerMenu from './TriggerMenu.vue';

const props = withDefaults(defineProps<SenderProps>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  submitType: 'enter',
  allowEmptySubmit: false,
  toolbarItems: () => ['attach', 'voice'] as SenderToolbarItems,
});
const emit = defineEmits<SenderEmits>();
const ns = useNamespace('sender');
const { t } = useLocale(locale);

// 附件状态机：未启用时为 null，模板/逻辑全部以 attach 为开关，零开销（静态配置，setup 快照）
const attach = props.attachments ? useAttachments(props.attachments) : null;

// ============ 触发菜单（静态配置，setup 快照；未配置时 trig 为 null 零开销） ============
const triggers = (() => {
  if (!props.triggers?.length) return [];
  const seen = new Set<string>();
  for (const tc of props.triggers) {
    if (seen.has(tc.char)) {
      console.warn(`[ai-chat] Sender triggers 触发字符 "${tc.char}" 重复，后者将覆盖前者`);
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
  if (props.disabled) return; // disabled 覆盖附件全部交互
  const input = e.target as HTMLInputElement;
  if (input.files?.length) attach?.add(input.files);
  input.value = ''; // 允许重复选同一文件
};
const onDrop = (e: DragEvent) => {
  if (!attach || props.disabled || !e.dataTransfer?.files.length) return;
  e.preventDefault();
  attach.add(e.dataTransfer.files);
};
// 面板内拖放/重试事件被面板 stopPropagation、不经根级守卫，须单独受 disabled 约束——
// 面板可在可用态展开后才被禁用（如表单提交期间），此时附件交互应一并失效
const onPanelDrop = (files: FileList | File[]) => {
  if (!props.disabled) attach?.add(files);
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
// 真实离开判定：relatedTarget 仍在根内（子元素间移动）不算离开——与面板同模式防闪烁。
// 此处不收起面板（拖拽离开不应关闭已展开面板），仅保留守卫语义占位，避免误触发其他逻辑。
const onRootDragLeave = (e: DragEvent) => {
  if (!attach) return;
  const el = e.currentTarget as HTMLElement;
  if (el.contains(e.relatedTarget as Node | null)) return;
  // 拖拽真实离开根区域：无副作用（面板展开态保持），守卫仅为对齐面板防闪烁模式
};
const onPaste = (e: ClipboardEvent) => {
  if (!attach || props.disabled || !e.clipboardData?.files.length) return;
  e.preventDefault(); // 文件粘贴接管；纯文本粘贴不受影响
  attach.add(e.clipboardData.files);
};

const hasDone = computed(() => !!attach && attach.items.value.some((it) => it.status === 'done'));
const isUploading = computed(() => attach?.isUploading.value ?? false);

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

// 按状态切换 mask 图标（输出中=停止，否则=发送）。mask 相关属性全部走内联样式（含 -webkit- 前缀），
// 避免依赖构建期 autoprefixer，确保在 Storybook / Safari 下也能正确渲染。
const sendIconStyle = computed(() => {
  const img = `url("${props.loading ? stopIconUrl : sendIconUrl}")`;
  return {
    maskImage: img,
    maskRepeat: 'no-repeat',
    maskPosition: 'center',
    maskSize: 'contain',
    WebkitMaskImage: img,
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    WebkitMaskSize: 'contain',
  };
});

// 自适应高度：内容增减时按 scrollHeight 撑高，上限由 CSS max-height 接管（超出后内部滚动）
const autosize = () => {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
};

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
          console.warn(
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
  // meta 存在才携带第三参：无 meta 时保持旧签名（一/两参）完全兼容
  if (meta) emit('submit', text, atts?.length ? atts : undefined, meta);
  else if (atts?.length) emit('submit', text, atts);
  else emit('submit', text);
  selectedMentions.length = 0;
  trig?.clear();
  inner.value = '';
  emit('update:modelValue', '');
  nextTick(autosize);
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
});

defineSlots<{
  prefix?: (props: SenderSlotScope) => unknown;
  header?: (props: SenderSlotScope) => unknown;
  toolbar?: (props: SenderSlotScope) => unknown;
  footer?: (props: SenderSlotScope) => unknown;
}>();

/** 命令式写入输入框（划词 ask 的 prompt 注入等）；与 onInput 全同路径（含高度自适应），受控/非受控一致 */
const setValue = (text: string) => {
  inner.value = text;
  emit('update:modelValue', text);
  autosize();
};

defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear,
  setValue,
  // 仅供单测验证面板高度过渡的快速 toggle 竞态（VTU 取 Transition 内节点不便，直接单元级调用）
  __onPanelEnter: onPanelEnter,
  __onPanelLeave: onPanelLeave,
});
</script>

<style lang="scss">
.aix-sender {
  display: flex;
  flex-direction: column;
  padding: var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingXS) var(--aix-paddingSM);
  transition:
    border-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut),
    box-shadow var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadiusLG);
  background-color: var(--aix-colorBgContainer);
  box-shadow: var(--aix-shadowSM);
  gap: var(--aix-sizeXS);

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

  &.is-disabled {
    background-color: var(--aix-colorBgContainerDisabled);
    box-shadow: none;
  }

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

  /* 底部工具栏行：始终渲染，左侧工具项 + 发送键共享一行；左右分组由 &__toolbar-spacer 撑开 */
  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
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
    max-height: 160px;
    padding: var(--aix-paddingXS);
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
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    transition:
      background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      color var(--aix-motionDurationFast) var(--aix-motionEaseInOut),
      transform var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorFillSecondary);
    color: var(--aix-colorPrimary);
    cursor: pointer;

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

  /* 图标本体：以 mask 取设计 SVG 形状，背景填 currentColor 实现主题着色（mask 图与定位见内联 style）。 */
  &__send-icon {
    width: 16px;
    height: 16px;
    background-color: currentColor;
  }

  /* 隐藏文件选择 input */
  &__file-input {
    display: none;
  }

  /* 麦克风按钮：工具栏行内，与附件按钮同尺寸 */
  &__mic {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background-color: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
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

  /* 回形针按钮：工具栏内；展开态 is-active 主色高亮（参照 mic is-listening） */
  &__attach-btn {
    display: inline-flex;
    position: relative;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    padding: 0;
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
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
