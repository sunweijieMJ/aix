<template>
  <div :class="ns.b()">
    <Skeleton v-if="loading" loading height="200px" />
    <div v-else-if="degraded" :class="ns.e('fallback')" role="img" :aria-label="fallbackText">
      {{ fallbackText }}
    </div>
    <div v-else-if="block.images.length === 1" :class="ns.e('single')">
      <button type="button" :class="ns.e('trigger')" @click="openAt(0, $event)">
        <ImageThumb :src="block.images[0]!.url" :alt="block.images[0]!.alt" />
      </button>
    </div>
    <div v-else :class="ns.e('grid')">
      <button
        v-for="(img, i) in block.images"
        :key="`${img.url}-${i}`"
        type="button"
        :class="ns.e('trigger')"
        @click="openAt(i, $event)"
      >
        <ImageThumb :src="img.thumbnail ?? img.url" :alt="img.alt" />
      </button>
    </div>
    <ImagePreview v-model:open="previewOpen" v-model:index="previewIndex" :images="block.images" />
  </div>
</template>

<script lang="ts">
export interface ImageBlockProps {
  /** image 类型的 block */
  block: Extract<ContentBlock, { type: 'image' }>;
  /** 气泡上下文（注册表统一透传，本组件暂不消费） */
  info: BubbleContentInfo;
  /** 打字机态（注册表统一透传，图片不逐字，故不消费） */
  typing?: boolean;
  /** 交互动作回调（注册表统一透传，本组件暂不消费——纯展示，无回写） */
  onBlockAction?: BlockActionHandler;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import { computed, ref, watch } from 'vue';
import { locale } from '../../locale';
import type { BlockActionHandler, BubbleContentInfo, ContentBlock } from '../../types';
import ImagePreview from '../ImagePreview.vue';
import ImageThumb from '../ImageThumb.vue';
import Skeleton from '../Skeleton.vue';

// 注册表统一向渲染器透传 block/info/typing/onBlockAction；关闭属性继承避免多余 attr 落到根元素。
defineOptions({ inheritAttrs: false });

const props = defineProps<ImageBlockProps>();
const ns = useNamespace('image-block');
const { t } = useLocale(locale);

const loading = computed(() => props.block.state === 'loading');
// 除了显式 error，images 为空（如占位块尚未补图、或调用方忘记设 state）也按降级处理——
// 否则会落进下方 grid 分支渲染一个空 v-for，界面上只剩一块没有任何反馈的空白。
const degraded = computed(() => props.block.state === 'error' || props.block.images.length === 0);
const fallbackText = computed(() => props.block.errorText || t.value.imageLoadError);

const previewOpen = ref(false);
const previewIndex = ref(0);
// e 显式打到被点击的缩略图按钮上再打开预览：Safari 默认不给鼠标点击的 <button> 赋键盘焦点，
// 若单纯依赖 document.activeElement，ImagePreview 关闭时的焦点归还会落到错误元素。
const openAt = (i: number, e: MouseEvent) => {
  (e.currentTarget as HTMLElement | null)?.focus();
  previewIndex.value = i;
  previewOpen.value = true;
};

// block 转为 loading/降级态时（如业务复用同一 block id 重新生成图片）自动收起已打开的预览，
// 避免用户面对一个图片和下载按钮都消失、只剩遮罩的空白 Modal，还得手动关闭才能脱困。
watch(
  () => [loading.value, degraded.value] as const,
  ([isLoading, isDegraded]) => {
    if (isLoading || isDegraded) previewOpen.value = false;
  },
);
</script>

<style lang="scss">
.aix-image-block {
  margin-top: var(--aix-marginSM);

  &__fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 120px;
    padding: var(--aix-paddingMD);
    border: 1px dashed var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadius);
    background: var(--aix-colorFillQuaternary);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    text-align: center;
  }

  &__trigger {
    display: block;
    padding: 0;
    border: none;
    background: transparent;
    cursor: zoom-in;
  }

  &__single &__trigger {
    max-width: 320px;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    max-width: 400px;
    gap: var(--aix-marginXS);
  }

  &__grid &__trigger :deep(img),
  &__grid &__trigger :deep(.aix-md-image) {
    width: 100%;
    height: 96px;
    object-fit: cover;
  }
}
</style>
