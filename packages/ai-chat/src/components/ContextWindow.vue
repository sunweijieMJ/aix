<template>
  <div ref="root" :class="[ns.b(), ns.is('open', open)]">
    <button
      type="button"
      :class="[ns.e('trigger'), ns.is('warn', isWarn)]"
      :aria-label="t.contextWindowLabel"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="toggle"
    >
      <DataUsage :class="ns.e('icon')" />
      <span :class="ns.e('summary')">{{ summary }}</span>
    </button>
    <div v-if="open" :class="ns.e('panel')" role="dialog" :aria-label="t.contextWindowTitle">
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
   * 展示用占比（0–1）。缺省由 used/total 计算；
   * total 为 0 时按 0 处理（不产生 NaN/Infinity）。
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
import { useLocale, useNamespace, useClickOutside } from '@aix/hooks';
import { DataUsage } from '@aix/icons';
import { ref, computed } from 'vue';
import { locale } from '../locale';

const props = withDefaults(defineProps<ContextWindowProps>(), {
  used: 0,
  total: 0,
  compressible: false,
  compressing: false,
  warnRatio: 0.8,
});
const emit = defineEmits<ContextWindowEmits>();

const ns = useNamespace('context-window');
const { t } = useLocale(locale);
const root = ref<HTMLElement | null>(null);
const open = ref(false);

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

const summary = computed(() => `${format.value(props.used)}/${format.value(props.total)}`);
const usageText = computed(() =>
  t.value.contextWindowUsage
    .replace('{used}', format.value(props.used))
    .replace('{total}', format.value(props.total))
    .replace('{percent}', percentText.value),
);

const toggle = () => (open.value = !open.value);

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

  &__panel {
    position: absolute;
    z-index: 10;
    bottom: calc(100% + var(--aix-marginXXS));
    left: 0;
    min-width: 200px;
    padding: var(--aix-paddingSM);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background-color: var(--aix-colorBgElevated);
    box-shadow: var(--aix-boxShadowSecondary);
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
