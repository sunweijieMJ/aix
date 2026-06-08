<template>
  <div
    :class="[
      ns.b(),
      ns.is('disabled', disabled),
      ns.is('has-toolbar', !!$slots.toolbar || !!attach),
    ]"
    @drop="onDrop"
    @dragover="onDragOver"
    @dragenter="onRootDragEnter"
    @dragleave="onRootDragLeave"
  >
    <!-- 顶部扩展区：常用于附件预览 / 引用上下文等，位于输入行上方 -->
    <div v-if="$slots.header" :class="ns.e('header')"><slot name="header" /></div>
    <!-- 附件面板：展开收起带高度过渡（JS hooks 读 scrollHeight；jsdom 高度 0 自然短路） -->
    <Transition v-if="attach" :css="false" @enter="onPanelEnter" @leave="onPanelLeave">
      <AttachmentsPanel
        v-if="panelOpen"
        :items="attach.items.value"
        :accept="props.attachments?.accept"
        @pick="openFilePicker"
        @drop="attach.add($event)"
        @remove="attach.remove"
        @retry="attach.retry"
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
      <span v-if="$slots.prefix" :class="ns.e('prefix')"><slot name="prefix" /></span>
      <textarea
        ref="textareaRef"
        :class="ns.e('input')"
        :value="inner"
        :placeholder="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :aria-label="isListening ? t.voiceListening : placeholder || t.senderPlaceholder"
        :disabled="disabled"
        rows="1"
        @input="onInput"
        @keydown="onKeydown"
        @paste="onPaste"
        @compositionend="onCompositionEnd"
      />
      <button
        v-if="showMic"
        type="button"
        :class="[ns.e('mic'), ns.is('listening', isListening)]"
        :aria-label="isListening ? t.voiceStopButton : t.voiceButton"
        :title="isListening ? t.voiceStopButton : t.voiceButton"
        :disabled="disabled"
        @click="onMicClick"
      >
        <Mic />
      </button>
      <button
        type="button"
        :class="[ns.e('send'), ns.is('streaming', loading)]"
        :disabled="disabled || (!loading && (isUploading || (!inner.trim() && !hasDone)))"
        :aria-label="loading ? t.stopButton : isUploading ? t.attachmentUploading : t.sendButton"
        :title="loading ? t.stopButton : isUploading ? t.attachmentUploading : t.sendButton"
        @click="onSendClick"
      >
        <span :class="ns.e('send-icon')" :style="sendIconStyle" aria-hidden="true" />
      </button>
    </div>
    <!-- 底部工具栏：附件启用 或 提供 toolbar slot 时渲染 -->
    <div v-if="$slots.toolbar || attach" :class="ns.e('toolbar')">
      <!-- 回形针按钮：附件启用时显示，点击 toggle 面板；收起且有条目时带数量徽标 -->
      <button
        v-if="attach"
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
      <slot name="toolbar" />
    </div>
    <!-- 底部扩展区：位于工具栏之下，用于字数统计 / 提示语 / 自定义页脚等 -->
    <div v-if="$slots.footer" :class="ns.e('footer')"><slot name="footer" /></div>
  </div>
</template>

<script lang="ts">
import type { AttachmentItem, VoiceConfig } from '../types';
import type { UseAttachmentsOptions } from '../composables/useAttachments';

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
}
export interface SenderEmits {
  /** 输入框文本变化（v-model 同步） */
  (e: 'update:modelValue', v: string): void;
  /**
   * 提交发送：text 当前文本（可为空串=纯附件发送）；attachments 仅在启用附件且有已传完条目时存在。
   * error 态附件不随本次发送消耗，留在预览区等待用户重试或删除。
   */
  (e: 'submit', v: string, attachments?: AttachmentItem[]): void;
  /** 取消 / 停止（loading 态下点停止按钮触发） */
  (e: 'cancel'): void;
}
</script>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useLocale } from '@aix/hooks';
import { Attachment, Mic } from '@aix/icons';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';
import { useAttachments } from '../composables/useAttachments';
import { useVoiceInput } from '../composables/useVoiceInput';
import AttachmentsPanel from './AttachmentsPanel.vue';
// 发送按钮图标采用设计稿导出的本地 SVG 资源：默认态为纸飞机、输出中为停止圆点。
// 以 CSS mask 渲染，使图标颜色随按钮 color（主题变量）变化，而非 SVG 内置色，符合主题系统约定。
import sendIconUrl from '../assets/send-default.svg';
import stopIconUrl from '../assets/send-streaming.svg';

const props = withDefaults(defineProps<SenderProps>(), {
  modelValue: '',
  loading: false,
  disabled: false,
  submitType: 'enter',
});
const emit = defineEmits<SenderEmits>();
const ns = useNamespace('sender');
const { t } = useLocale(locale);

// 附件状态机：未启用时为 null，模板/逻辑全部以 attach 为开关，零开销（静态配置，setup 快照）
const attach = props.attachments ? useAttachments(props.attachments) : null;

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
    node.removeEventListener('transitionend', finish);
    node.style.height = 'auto'; // 撑完置 auto，允许内容后续自然变化
    node.style.overflow = '';
    node.style.transition = '';
    node.__panelCleanup = undefined;
    done();
  };
  node.addEventListener('transitionend', finish);
  timer = setTimeout(finish, 300);
  // cleanup 只解绑监听/timer，不动样式（新动画的入口会接管样式），避免误清新动画的起始态
  node.__panelCleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', finish);
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
    node.removeEventListener('transitionend', finish);
    node.style.height = '';
    node.style.overflow = '';
    node.style.transition = '';
    node.__panelCleanup = undefined;
    done();
  };
  node.addEventListener('transitionend', finish);
  timer = setTimeout(finish, 300);
  node.__panelCleanup = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    node.removeEventListener('transitionend', finish);
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

// 聆听中文本被手动改写时重启识别会话：旧会话在途的 interim/final 被令牌守卫丢弃（防重复拼接），
// 以改写后的内容为新基线继续聆听。调用方须先确认 voice 处于 listening 态。
const restartVoiceFrom = (text: string) => {
  voice!.stop();
  committedBase = text;
  voice!.start();
};

const onMicClick = () => {
  if (!voice) return;
  if (voice.status.value === 'listening') {
    voice.stop();
  } else {
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
};

// IME 组词结束：落字成为新基线并重启会话（组词期间 onInput 因 isComposing 被跳过）。
// 同步落字到 inner——浏览器在 compositionend 后才补发非组合 input，此处先取元素最新值确保基线含落字。
const onCompositionEnd = (e: Event) => {
  inner.value = (e.target as HTMLTextAreaElement).value;
  emit('update:modelValue', inner.value);
  if (voice?.status.value === 'listening') restartVoiceFrom(inner.value);
};

const doSubmit = () => {
  const text = inner.value.trim();
  // 纯附件发送：text 可空，但须有已传完附件；上传中一律不可发
  if (props.loading || props.disabled || isUploading.value) return;
  if (!text && !hasDone.value) return;
  // 提交时自动停止语音聆听（守卫之后，确认能提交时再停）
  if (voice?.status.value === 'listening') voice.stop();
  const atts = attach ? attach.drain() : undefined;
  // 无附件（或 drain 结果为空）时不传第三参数，保持与旧签名完全兼容
  if (atts?.length) {
    emit('submit', text, atts);
  } else {
    emit('submit', text);
  }
  inner.value = '';
  emit('update:modelValue', '');
  nextTick(autosize);
};

const onKeydown = (e: KeyboardEvent) => {
  // Esc 停止语音聆听
  if (e.key === 'Escape' && voice?.status.value === 'listening') {
    voice.stop();
    return;
  }
  // IME 输入法组词期间（拼音/假名选词）按 Enter 仅用于确认候选词，不应触发提交。
  // keyCode 229 兼容部分浏览器在组词时不设置 isComposing 的情况。
  if (e.isComposing || e.keyCode === 229) return;
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

defineExpose({
  focus: () => textareaRef.value?.focus(),
  clear: () => {
    inner.value = '';
    emit('update:modelValue', '');
    nextTick(autosize);
  },
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

  /* 输入行：前缀 + 文本域 + 发送按钮 */
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

  /* 底部工具栏行 */
  &__toolbar {
    display: flex;
    align-items: center;
    gap: var(--aix-sizeXS);
    padding-top: var(--aix-paddingXXS);
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

  /* 麦克风按钮：输入行内，发送按钮左侧 */
  &__mic {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    border: none;
    border-radius: var(--aix-borderRadiusLG);
    background-color: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover:not(:disabled) {
      background-color: var(--aix-colorFillSecondary);
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
