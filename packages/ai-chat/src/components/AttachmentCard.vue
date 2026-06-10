<template>
  <div
    :class="[ns.b(), isImage && ns.m('image'), item.status === 'error' && ns.is('error')]"
    :title="errorTitle"
  >
    <!-- ===== 图片卡：68×68 正方形缩略图（adx file-card-image：width/height 68）===== -->
    <template v-if="isImage">
      <img
        v-if="!thumbError"
        :class="ns.e('thumb')"
        :src="item.url"
        :alt="item.name"
        @error="thumbError = true"
      />
      <!-- 缩略图加载失败（url 失效/404/跨域）时回退文件类型图标，与文件卡视觉一致 -->
      <span
        v-else
        :class="ns.e('thumb-fallback')"
        :style="{ color: typeMeta.colorVar }"
        aria-hidden="true"
      >
        <component :is="typeMeta.icon" />
      </span>
      <!-- 名称悬浮条（adx 图片卡名称省略，悬浮底部） -->
      <span :class="ns.e('name')">{{ item.name }}</span>
      <!-- uploading / error 时缩略图上盖 mask（adx file-img-mask） -->
      <div v-if="item.status === 'uploading' || item.status === 'error'" :class="ns.e('mask')">
        <span v-if="item.status === 'uploading'" :class="ns.e('mask-progress')">
          {{ item.percent != null ? `${Math.round(item.percent)}%` : '…' }}
        </span>
        <span v-else :class="ns.e('mask-error')">!</span>
      </div>
      <!-- 进度条（隐藏的不确定态轨道，供测试 / 无 mask 文本场景） -->
      <div v-if="item.status === 'uploading'" :class="ns.e('progress')">
        <div
          :class="[ns.e('progress-bar'), item.percent == null && ns.is('indeterminate')]"
          :style="item.percent != null ? { width: `${item.percent}%` } : undefined"
        />
      </div>
    </template>

    <!-- ===== 文件卡：左图标 + 右双行（名称 / 描述）（adx file-card File 结构）===== -->
    <template v-else>
      <span :class="ns.e('icon')" :style="{ color: typeMeta.colorVar }" aria-hidden="true">
        <component :is="typeMeta.icon" />
      </span>
      <div :class="ns.e('info')">
        <span :class="ns.e('name')">{{ item.name }}</span>
        <!-- 描述行：uploading→进度条 / error→红字错误信息 / 其余→「后缀 · 大小」 -->
        <div v-if="item.status === 'uploading'" :class="ns.e('progress')">
          <div
            :class="[ns.e('progress-bar'), item.percent == null && ns.is('indeterminate')]"
            :style="item.percent != null ? { width: `${item.percent}%` } : undefined"
          />
        </div>
        <span
          v-else-if="item.status === 'error' && errorTitle"
          :class="[ns.e('size'), ns.em('size', 'error')]"
        >
          {{ errorTitle }}
        </span>
        <span v-else-if="descText" :class="ns.e('size')">{{ descText }}</span>
      </div>
    </template>

    <!-- 重试按钮：error 态原位显示 -->
    <button
      v-if="item.status === 'error'"
      type="button"
      :class="ns.e('btn')"
      :aria-label="t.attachmentRetry"
      :title="t.attachmentRetry"
      @click="emit('retry')"
    >
      <Refresh />
    </button>
    <!-- 删除按钮：右上角凸出，hover/focus-within 显示 -->
    <button
      v-if="removable"
      type="button"
      :class="ns.e('remove')"
      :aria-label="t.attachmentRemove"
      :title="t.attachmentRemove"
      @click="emit('remove')"
    >
      <Close />
    </button>
  </div>
</template>

<script lang="ts">
/** 卡片条目：稳定形态（气泡回显）或带过程态（输入区预览）皆可 */
export type AttachmentCardItem = AttachmentItem &
  Partial<Pick<PendingAttachment, 'status' | 'percent' | 'error'>>;

export interface AttachmentCardProps {
  item: AttachmentCardItem;
  /** 是否显示删除按钮（输入区预览 true / 气泡回显 false），默认 false */
  removable?: boolean;
}
export interface AttachmentCardEmits {
  (e: 'remove'): void;
  (e: 'retry'): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { Refresh, Close } from '@aix/icons';
import { computed, ref, watch } from 'vue';
import type { PendingAttachment } from '../composables/useAttachments';
import { useNamespace } from '../composables/useNamespace';
import { locale } from '../locale';
import type { AttachmentItem } from '../types';
import { getFileTypeMeta } from '../utils/fileTypes';

const props = withDefaults(defineProps<AttachmentCardProps>(), { removable: false });
const emit = defineEmits<AttachmentCardEmits>();
const ns = useNamespace('attachment-card');
const { t } = useLocale(locale);

const isImage = computed(() => !!props.item.url && (props.item.mime ?? '').startsWith('image/'));

// 缩略图加载失败标记；换源（如重试上传得到新 url）后重置，给新地址重新加载的机会
const thumbError = ref(false);
watch(
  () => props.item.url,
  () => {
    thumbError.value = false;
  },
);

/** 文件类型展示元数据（图标 + 颜色变量） */
const typeMeta = computed(() => getFileTypeMeta(props.item.name, props.item.mime));

const sizeText = computed(() => {
  const s = props.item.size;
  if (s == null) return '';
  if (s < 1024) return `${s} B`;
  if (s < 1024 * 1024) return `${(s / 1024).toFixed(1)} KB`;
  return `${(s / 1024 / 1024).toFixed(1)} MB`;
});

/** 文件名后缀（大写，去掉点），如 report.pdf → PDF */
const extText = computed(() => {
  const name = props.item.name ?? '';
  const dotIdx = name.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx >= name.length - 1) return '';
  return name.slice(dotIdx + 1).toUpperCase();
});

/** 描述行文本：「后缀大写 · 大小」（对齐 adx 描述行），仅有其一时降级显示 */
const descText = computed(() => {
  const parts = [extText.value, sizeText.value].filter(Boolean);
  return parts.join(' · ');
});

const errorTitle = computed(() => {
  const err = props.item.error;
  if (props.item.status !== 'error' || err == null) return undefined;
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
});
</script>

<style lang="scss">
// ============================================================================
// 视觉规格对齐 ant-design-x（file-card）。adx antd token → aix token 映射：
//   colorFillTertiary → --aix-colorFillTertiary（卡片底色）
//   paddingSM/padding → --aix-paddingSM / --aix-padding（内边距）
//   marginSM          → --aix-marginSM（图标与内容间距）
//   fontSize/fontSizeSM → --aix-fontSize（名称 14px）/ --aix-fontSizeSM（描述 12px）
//   colorTextBase     → --aix-colorTextBase（名称色）
//   colorTextDescription → --aix-colorTextDescription（描述色）
//   borderRadius      → --aix-borderRadius
// adx 卡片固定宽 268px；我们输入区面板较窄，取 248px（介于 adx 268 与原 240 之间，
// 保留双行布局空间，且与面板列表 wrap 排布更协调）。
// ============================================================================
.aix-attachment-card {
  display: inline-flex;
  position: relative;
  box-sizing: border-box;
  align-items: center;
  width: 248px; // adx 268px → 面板场景收窄为 248px
  padding: var(--aix-paddingSM) var(--aix-padding, var(--aix-paddingSM));
  overflow: hidden;
  border: 1px solid transparent; // adx 文件卡无边框，靠底色区分；error 时上色
  border-radius: var(--aix-borderRadius);
  background-color: var(--aix-colorFillTertiary);

  &.is-error {
    border-color: var(--aix-colorError);
  }

  &__icon {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    margin-right: var(--aix-marginSM);

    // adx 图标 fontSizeHeading1-2 ≈ 36px；aix 无 heading token，固定 32px
    svg {
      width: 32px;
      height: 32px;
    }
  }

  &__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    gap: var(--aix-marginXXS);
  }

  &__name {
    overflow: hidden;
    color: var(--aix-colorTextBase, var(--aix-colorText));
    font-size: var(--aix-fontSize);
    line-height: var(--aix-lineHeight, 1.5);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__size {
    overflow: hidden;
    color: var(--aix-colorTextDescription, var(--aix-colorTextTertiary));
    font-size: var(--aix-fontSizeSM);
    line-height: var(--aix-lineHeightLG, 1.6);
    text-overflow: ellipsis;
    white-space: nowrap;

    // error 描述行：红字错误信息
    &--error {
      color: var(--aix-colorError);
    }
  }

  &__progress {
    height: 4px;
    margin-top: 2px;
    overflow: hidden;
    border-radius: 2px;
    background-color: var(--aix-colorFillSecondary);
  }

  &__progress-bar {
    height: 100%;
    transition: width var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    background-color: var(--aix-colorPrimary);

    &.is-indeterminate {
      width: 40%;
      animation: aix-attachment-indeterminate 1.2s var(--aix-motionEaseInOut) infinite;
    }
  }

  // ==========================================================================
  // 图片卡变体：68×68 正方形缩略图（adx file-card-image 固定 68×68）
  // ==========================================================================
  &--image {
    width: 68px; // adx 图片卡固定尺寸，无对应 token，硬编码 + 注释
    height: 68px;
    padding: 0;
    background-color: var(--aix-colorFillTertiary);

    .aix-attachment-card__thumb {
      width: 100%;
      height: 100%;
      border-radius: inherit;
      object-fit: cover;
    }

    // 缩略图加载失败的兜底图标位（居中文件类型图标，色值由内联 style 按类型给出）
    .aix-attachment-card__thumb-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;

      svg {
        width: 32px;
        height: 32px;
      }
    }

    // 名称悬浮底部省略条（adx 图片卡名称浮层）
    .aix-attachment-card__name {
      position: absolute;
      right: 0;
      bottom: 0;
      left: 0;
      padding: 2px var(--aix-paddingXXS);

      // 遮罩走 colorBgMask 令牌（亮/暗主题均为黑系半透明），随主题统一调整
      background: linear-gradient(transparent, var(--aix-colorBgMask));

      // 盖在深色渐变上的文字恒白：colorWhite（亮色=白，暗色无翻转）而非 colorTextLight（暗色会翻黑）
      color: var(--aix-colorWhite);
      font-size: var(--aix-fontSizeSM);
      line-height: 1.4;
    }
  }

  // 图片卡 mask：上传中进度 / error 标记（adx file-img-mask 居中盖层）
  &__mask {
    display: flex;
    position: absolute;
    align-items: center;
    justify-content: center;
    background: var(--aix-colorBgMask); // 黑系半透明遮罩令牌，亮/暗主题统一

    // 深色半透明 mask 上文字恒白：用 colorWhite（暗色不翻转），勿用 colorTextLight
    color: var(--aix-colorWhite);
    font-size: var(--aix-fontSize);
    inset: 0;
  }

  &__mask-error {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--aix-colorError);
    font-weight: 600;
  }

  // 图片卡内进度轨道：贴底细条（mask 文本之外的视觉补充）
  &--image &__progress {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    margin-top: 0;
    border-radius: 0;
  }

  // 重试按钮：保持原位内联风格
  &__btn {
    display: inline-flex;
    flex: none;
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
      width: 14px;
      height: 14px;
    }

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }
  }

  // 删除按钮：右上角凸出，hover/focus-within 时显示
  &__remove {
    display: inline-flex;
    position: absolute;
    top: 0;
    right: 0;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    transform: translate(50%, -50%);
    transition: opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: 50%;
    opacity: 0;
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    // 扩展触控热区：视觉不变，满足触屏 44px 命中准则
    &::before {
      content: '';
      position: absolute;
      inset: -14px;
    }

    svg {
      width: 10px;
      height: 10px;
    }

    &:hover {
      background-color: var(--aix-colorFillTertiary);
      color: var(--aix-colorText);
    }
  }

  // 卡片 hover 或 focus-within 时显示删除按钮
  &:hover &__remove,
  &:focus-within &__remove {
    opacity: 1;
  }

  // 触屏设备：无 hover 能力时常显删除按钮
  @media (hover: none) {
    &__remove {
      opacity: 1;
    }
  }
}

@keyframes aix-attachment-indeterminate {
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(350%);
  }
}
</style>
