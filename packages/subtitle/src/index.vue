<template>
  <transition name="subtitle-fade">
    <div
      v-if="visible && displayText"
      class="subtitle"
      :class="[
        `subtitle--${position}`,
        `subtitle--bg-${background}`,
        { 'subtitle--single-line': isSingleLineEffective },
      ]"
      :style="subtitleStyle"
    >
      <!-- 自定义 slot - 传递字幕文本和分段信息 -->
      <slot
        :text="currentSegmentText"
        :full-text="displayText"
        :current-segment="currentSegmentIndex + 1"
        :total-segments="segmentCount"
      >
        <!-- 默认渲染 -->
        <div class="subtitle__text">{{ currentSegmentText }}</div>
      </slot>
    </div>
  </transition>
</template>

<script setup lang="ts">
/**
 * 字幕显示组件
 *
 * 支持加载 VTT/SRT/JSON/SBV/ASS 格式字幕文件，根据时间显示对应字幕
 */
import { computed, watch, toRef } from 'vue';
import type { SubtitleProps, SubtitleEmits, SubtitleExpose } from './types';
import { useSegment } from './useSegment';
import { useSubtitle } from './useSubtitle';

defineOptions({
  name: 'AixSubtitle',
});

const props = withDefaults(defineProps<SubtitleProps>(), {
  visible: true,
  position: 'bottom',
  fontSize: 20,
  background: 'blur',
  maxWidth: '1200px',
  singleLine: false,
  autoSegment: false,
  segmentDuration: 3000,
});

const emit = defineEmits<SubtitleEmits>();

// 转换 currentTime 为 ref
const currentTimeRef = toRef(() => props.currentTime ?? 0);

// 使用字幕 Composable
const { cues, currentCue, currentIndex, loading, error, load, getCueAtTime } =
  useSubtitle({
    currentTime: currentTimeRef,
    onChange: (cue, index) => {
      emit('change', cue, index);
    },
  });

// 监听 source 变化，重新加载
watch(
  () => props.source,
  async (newSource) => {
    if (newSource) {
      try {
        await load(newSource);
        emit('loaded', cues.value);
      } catch (e) {
        emit('error', e instanceof Error ? e : new Error(String(e)));
      }
    }
  },
  { immediate: true },
);

// 显示的文本
const displayText = computed(() => {
  return currentCue.value?.text || '';
});

// 使用分段 Composable
const { currentSegmentIndex, segmentCount, currentSegmentText } = useSegment({
  text: displayText,
  currentCue,
  autoSegment: toRef(() => props.autoSegment),
  visible: toRef(() => props.visible),
  fixedHeight: toRef(() => props.fixedHeight),
  fontSize: toRef(() => props.fontSize),
  maxWidth: toRef(() => props.maxWidth),
  segmentDuration: toRef(() => props.segmentDuration),
});

// singleLine 模式是否有效（需要同时设置 fixedHeight）
const isSingleLineEffective = computed(() => {
  return (
    props.singleLine && props.fixedHeight !== undefined && props.fixedHeight > 0
  );
});

// 字幕样式
const subtitleStyle = computed(() => {
  const fontSize =
    typeof props.fontSize === 'number' ? `${props.fontSize}px` : props.fontSize;
  const maxWidth =
    typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth;
  const fixedHeight = props.fixedHeight ? `${props.fixedHeight}px` : undefined;

  return {
    '--subtitle-font-size': fontSize,
    '--subtitle-max-width': maxWidth,
    '--subtitle-fixed-height': fixedHeight,
  };
});

// 暴露方法
defineExpose<SubtitleExpose>({
  getCues: () => cues.value,
  getCurrentCue: () => currentCue.value,
  getCurrentIndex: () => currentIndex.value,
  getCueAtTime,
  reload: async () => {
    if (props.source) {
      await load(props.source);
    }
  },
  loading,
  error,
});
</script>

<style scoped lang="scss">
/**
 * Subtitle 组件样式
 *
 * 可定制 CSS 变量 (通过父组件或 style 属性设置):
 * --subtitle-padding:        内边距，默认 8px 12px
 * --subtitle-border-radius:  圆角，默认 8px
 * --subtitle-text-color:     文字颜色，默认 rgb(255 255 255 / 0.95)
 * --subtitle-text-shadow:    文字阴影，默认 0 1px 4px rgb(0 0 0 / 0.5)
 * --subtitle-line-height:    行高，默认 1.6
 * --subtitle-bg-blur:        毛玻璃背景色，默认 rgb(0 0 0 / 0.4)
 * --subtitle-bg-solid:       渐变背景，默认 linear-gradient(两边透明，中间 30% 黑色)
 * --subtitle-border-color:   边框颜色 (blur 模式)，默认 rgb(255 255 255 / 0.1)
 * --subtitle-blur-amount:    模糊程度，默认 10px
 * --subtitle-transition:     过渡动画时长，默认 0.2s
 *
 * 使用示例:
 * <Subtitle style="--subtitle-text-color: yellow; --subtitle-bg-blur: rgb(0 0 0 / 0.6);" />
 */
.subtitle {
  display: flex;
  position: relative;
  z-index: 1;
  align-items: center;
  justify-content: center;
  padding: var(--subtitle-padding, 8px 12px);
  border-radius: var(--subtitle-border-radius, 8px);

  // 位置变体
  &--top {
    align-self: flex-start;
  }

  &--bottom {
    align-self: flex-end;
  }

  &--center {
    align-self: center;
  }

  // 背景变体
  &--bg-blur {
    border: 1px solid var(--subtitle-border-color, rgb(255 255 255 / 0.1));
    background: var(--subtitle-bg-blur, rgb(0 0 0 / 0.4));
    backdrop-filter: blur(var(--subtitle-blur-amount, 10px));
  }

  &--bg-solid {
    // 设计稿: opacity: 0.3; background: linear-gradient(90deg, rgba(0,0,0,0) 0%, #000 47.91%, rgba(0,0,0,0) 100%)
    background: var(
      --subtitle-bg-solid,
      linear-gradient(
        90deg,
        rgb(0 0 0 / 0) 0%,
        rgb(0 0 0 / 0.3) 47.91%,
        rgb(0 0 0 / 0) 100%
      )
    );
  }

  &--bg-none {
    background: transparent;
  }

  // 单行模式（固定高度）
  &--single-line {
    height: var(--subtitle-fixed-height);
    overflow: hidden;
  }
}

.subtitle__text {
  max-width: var(--subtitle-max-width, 1200px);
  color: var(--subtitle-text-color, rgb(255 255 255 / 0.95));
  font-size: var(--subtitle-font-size, 20px);
  line-height: var(--subtitle-line-height, 1.6);
  text-align: center;
  text-shadow: var(--subtitle-text-shadow, 0 1px 4px rgb(0 0 0 / 0.5));
  word-break: break-all;
  white-space: pre-wrap;
}

// 淡入淡出动画
.subtitle-fade-enter-active,
.subtitle-fade-leave-active {
  transition:
    opacity var(--subtitle-transition, 0.2s) ease,
    transform var(--subtitle-transition, 0.2s) ease;
}

.subtitle-fade-enter-from,
.subtitle-fade-leave-to {
  transform: translateY(10px);
  opacity: 0;
}
</style>
