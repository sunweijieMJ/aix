<template>
  <!-- keydown 挂根节点而非面板：点开后焦点仍在触发器上，Esc 需由触发器冒泡上来才收得到 -->
  <div ref="root" :class="[ns.b(), ns.is('open', open)]" @keydown.escape.stop="close">
    <button
      ref="triggerElRef"
      type="button"
      :class="[ns.e('trigger'), ns.is('warn', isWarn)]"
      :aria-label="t.contextWindowLabel"
      :aria-expanded="open"
      @click="toggle"
    >
      <DataUsage :class="ns.e('icon')" />
      <span :class="ns.e('summary')">{{ summary }}</span>
    </button>
    <!-- role 用 group 而非 dialog：这是个非模态的 disclosure，打开时焦点刻意留在触发器上
         （用量条是「瞥一眼」的信息，不该抢走输入焦点）。声明 dialog 会让 AT 用户预期焦点
         自动移入并被困住，与实际行为不符；aria-expanded + 带名字的 group 才是这里的语义。 -->
    <div
      v-if="open"
      ref="floatingElRef"
      :class="ns.e('panel')"
      :style="floatingStyles"
      role="group"
      :aria-label="t.contextWindowTitle"
    >
      <div :class="ns.e('panel-title')">{{ t.contextWindowTitle }}</div>
      <div
        :class="ns.e('bar')"
        role="progressbar"
        :aria-valuenow="Math.round(ratio * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuetext="usageText"
      >
        <div :class="[ns.e('bar-fill'), ns.is('warn', isWarn)]" :style="{ width: fillWidth }" />
      </div>
      <div :class="ns.e('usage')">{{ usageText }}</div>
      <button
        v-if="compressible"
        type="button"
        :class="ns.e('compress')"
        :disabled="compressing"
        @click="onCompress"
      >
        {{ compressing ? t.contextCompressing : t.contextCompress }}
      </button>
    </div>
  </div>
</template>

<script lang="ts">
export interface ContextWindowProps {
  /** 已用 token 数 */
  used?: number;
  /** 上下文窗口总量 */
  total?: number;
  /**
   * 展示用占比（0–1）。缺省由 used/total 计算；total 为 0 时按 0 处理（不产生 NaN/Infinity）。
   *
   * 后端只回百分比、不回 token 数时可只传本项：`total` 为 0 即视为「窗口总量未知」，
   * 摘要与用量文案一并退化为纯百分比，不会显示无意义的 `0/0`。
   */
  percent?: number;
  /** 是否提供「压缩会话」入口，默认 false */
  compressible?: boolean;
  /** 压缩进行中：按钮禁用并显示进行中文案 */
  compressing?: boolean;
  /** 数值格式化，缺省按 k 单位（12000 → 12k） */
  formatter?: (n: number) => string;
  /** 进入告警配色的占比阈值（0–1），默认 0.8 */
  warnRatio?: number;
}

export interface ContextWindowEmits {
  /** 用户点击压缩：组件不发请求，宿主自行处理并回写 used */
  (e: 'compress'): void;
}
</script>

<script setup lang="ts">
import { useNamespace, useClickOutside } from '@aix/hooks';
import { DataUsage } from '@aix/icons';
import { usePopper } from '@aix/popper';
import { ref, computed, watch } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';

const props = withDefaults(defineProps<ContextWindowProps>(), {
  used: 0,
  total: 0,
  compressible: false,
  compressing: false,
  warnRatio: 0.8,
});
const emit = defineEmits<ContextWindowEmits>();

const ns = useNamespace('context-window');
const { t } = useAiChatLocale();
const root = ref<HTMLElement | null>(null);
const open = ref(false);

// 弹层定位交给 @aix/popper（包内 TriggerMenu / QuoteToolbar 同款）：
// strategy 'fixed' + flip/shift 默认开启，面板不会被工具栏/对话容器的 overflow 裁掉，
// 上方空间不足时自动翻到下方。自绘 `position:absolute; bottom:100%` 做不到这两件事。
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'top-start',
  strategy: 'fixed',
  offset: 8,
});
// 本地模板 ref 桥接（同 QuoteToolbar 先例）：双 <script> 块下直接绑 usePopper 的 Ref
// 会触发 vue-tsc noUnusedLocals 误报
const triggerElRef = ref<HTMLElement | null>(null);
const floatingElRef = ref<HTMLElement | null>(null);
watch(triggerElRef, (el) => {
  referenceRef.value = el;
});
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

/** 默认格式化：<1000 直接取整，否则 k 单位并去掉多余的 .0 */
const defaultFormatter = (n: number): string => {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${(Math.round(k * 10) / 10).toString().replace(/\.0$/, '')}k`;
};
const format = computed(() => props.formatter ?? defaultFormatter);

// total 为 0（未知窗口大小）时占比按 0，避免除零产生 NaN/Infinity 污染样式与 aria
const ratio = computed(() => {
  if (props.percent != null) return Math.min(Math.max(props.percent, 0), 1);
  if (!props.total) return 0;
  return Math.min(Math.max(props.used / props.total, 0), 1);
});
const isWarn = computed(() => ratio.value >= props.warnRatio);
const percentText = computed(() => `${Math.round(ratio.value * 100)}%`);
const fillWidth = computed(() => `${ratio.value * 100}%`);

// 窗口总量未知（total 为 0）：token 文案退化为纯百分比。
// 宿主只拿得到比例（后端不回 token 数）时只传 percent 即可，不会看到无意义的 `0/0`；
// 占比本身仍由 ratio 统一裁决（percent 优先），文案与进度条不会各说各话。
const unknownTotal = computed(() => !props.total);

const summary = computed(() =>
  unknownTotal.value
    ? percentText.value
    : `${format.value(props.used)}/${format.value(props.total)}`,
);
const usageText = computed(() =>
  unknownTotal.value
    ? t.value.contextWindowUsagePercent.replace('{percent}', percentText.value)
    : t.value.contextWindowUsage
        .replace('{used}', format.value(props.used))
        .replace('{total}', format.value(props.total))
        .replace('{percent}', percentText.value),
);

const toggle = () => (open.value = !open.value);

// Esc 关闭并把焦点还给触发器：键盘用户 Tab 进面板后必须有出路（与 ModelSelector 的
// Escape 约定一致），否则只能靠鼠标点外部关闭。
const close = () => {
  open.value = false;
  triggerElRef.value?.focus();
};

const onCompress = () => {
  if (props.compressing) return;
  emit('compress');
};

// 点击组件外部关闭面板（与 ModelSelector 同一套约定，仅在打开时监听）
useClickOutside({
  excludeRefs: computed(() => [root.value]),
  handler: () => (open.value = false),
  enabled: open,
});
</script>

<style lang="scss">
.aix-context-window {
  display: inline-flex;
  position: relative;

  &__trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--aix-sizeXXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorTextSecondary);
    }

    &.is-warn {
      color: var(--aix-colorWarning);
    }
  }

  &__icon {
    width: 14px;
    height: 14px;
  }

  &__summary {
    font-variant-numeric: tabular-nums;
  }

  // 定位（position/top/left）由 floating-ui 以内联样式写入，此处只管外观
  &__panel {
    z-index: 10;
    min-width: 200px;
    padding: var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorBgElevated);
    box-shadow: var(--aix-shadowMD);
  }

  &__panel-title {
    margin-bottom: var(--aix-marginXS);
    color: var(--aix-colorTextHeading);
    font-size: var(--aix-fontSizeSM);
    font-weight: 500;
  }

  &__bar {
    height: 6px;
    overflow: hidden;
    border-radius: 3px;
    background-color: var(--aix-colorFillSecondary);
  }

  &__bar-fill {
    height: 100%;
    transition: width var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    border-radius: 3px;
    background-color: var(--aix-colorPrimary);

    &.is-warn {
      background-color: var(--aix-colorWarning);
    }
  }

  &__usage {
    margin-top: var(--aix-marginXS);
    color: var(--aix-colorTextSecondary);
    font-size: var(--aix-fontSizeSM);
    font-variant-numeric: tabular-nums;
  }

  &__compress {
    width: 100%;
    margin-top: var(--aix-marginXS);
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    transition: all var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorder);
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSizeSM);
    cursor: pointer;

    &:hover:not(:disabled) {
      border-color: var(--aix-colorPrimary);
      color: var(--aix-colorPrimary);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }
}
</style>
