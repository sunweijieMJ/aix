<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="dialogEl"
      :class="ns.b()"
      role="dialog"
      aria-modal="true"
      :aria-label="t.imagePreviewLabel"
      tabindex="-1"
      @keydown.esc="close"
      @keydown.left="prev"
      @keydown.right="next"
      @keydown.tab="onTab"
    >
      <div :class="ns.e('mask')" @click="close" />
      <div :class="ns.e('content')">
        <div :class="ns.e('toolbar')">
          <span v-if="images.length > 1" :class="ns.e('counter')">
            {{ currentIndex + 1 }} / {{ images.length }}
          </span>
          <a
            v-if="activeHref"
            :class="ns.e('action')"
            :href="activeHref"
            download
            :aria-label="t.imagePreviewDownload"
            :title="t.imagePreviewDownload"
          >
            <Download />
          </a>
          <button
            type="button"
            :class="ns.e('action')"
            :aria-label="t.imagePreviewClose"
            :title="t.imagePreviewClose"
            @click="close"
          >
            <Close />
          </button>
        </div>
        <button
          v-if="images.length > 1"
          type="button"
          :class="[ns.e('nav'), ns.e('nav-prev')]"
          :aria-label="t.imagePreviewPrev"
          :disabled="currentIndex === 0"
          @click="prev"
        >
          <ArrowLeft />
        </button>
        <img v-if="activeHref" :class="ns.e('image')" :src="activeHref" :alt="active?.alt || ''" />
        <button
          v-if="images.length > 1"
          type="button"
          :class="[ns.e('nav'), ns.e('nav-next')]"
          :aria-label="t.imagePreviewNext"
          :disabled="currentIndex === images.length - 1"
          @click="next"
        >
          <ArrowRight />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
export interface ImagePreviewProps {
  /** 预览图片列表 */
  images: ImageItem[];
  /** 受控当前下标（v-model:index）；不传走非受控，内部维护 */
  index?: number;
  /** 受控开关（v-model:open）；不传走非受控，内部维护，默认关闭 */
  open?: boolean;
}
export interface ImagePreviewEmits {
  (e: 'update:index', i: number): void;
  (e: 'update:open', v: boolean): void;
  (e: 'close'): void;
}
</script>

<script setup lang="ts">
import { useControllable, useNamespace } from '@aix/hooks';
import { ArrowLeft, ArrowRight, Close, Download } from '@aix/icons';
import { computed, nextTick, ref, watch } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import type { ImageItem } from '../types';
import { safeImageSrc } from '../utils/url';

// open 是纯 boolean 类型 prop：Vue 对「无显式 default 的 Boolean 类型 prop」在缺省时会隐式
// cast 成 false（而非 undefined），若不显式声明 default: undefined，useControllable 的
// isControlled() 判断会永远读到 false、误判为「受控」，导致非受控模式失效
// （与 QuoteConfig.quote 的 boolean 联合 prop 同款坑，见 quote 功能实现记录）。
const props = withDefaults(defineProps<ImagePreviewProps>(), { open: undefined });
const emit = defineEmits<ImagePreviewEmits>();

const ns = useNamespace('image-preview');
const { t } = useAiChatLocale();

const { state: isOpen, setState: setOpen } = useControllable<boolean>({
  prop: () => props.open,
  defaultValue: false,
  onChange: (v) => emit('update:open', v),
});
const { state: currentIndex, setState: setIndex } = useControllable<number>({
  prop: () => props.index,
  defaultValue: 0,
  onChange: (v) => emit('update:index', v),
});

const active = computed(() => props.images[currentIndex.value]);
/**
 * 协议白名单：images 来自模型 / 生图工具输出（不可信）。下载入口是 href 而非 img src，
 * 不过白名单则 `javascript:` 会原样渲染成可点击链接，构成点击型 XSS
 * （`<img src>` 不执行脚本，但同一份 url 走 href 就会）。
 * 用 safeImageSrc 而非 safeUrl：图片预览的下载入口必须放行 `data:image/*` 与 `blob:`
 * （生图工具与本地预览的常规形态），且这里恒带 `download` 属性、不是导航型链接。
 * 不安全 url 归一为 undefined → 下载按钮与图片一并不渲染，而不是渲染一个可点的坏链接。
 */
const activeHref = computed(() => safeImageSrc(active.value?.url));

// images 变短（如上游列表被替换/删图）时当前下标可能越界 → active 变 undefined，
// 图片与下载按钮消失只剩导航的空白帧。钳制到末张；经 setIndex 通知，受控父组件可同步回填。
watch(
  () => props.images.length,
  (len) => {
    if (len > 0 && currentIndex.value > len - 1) setIndex(len - 1);
  },
);

const close = () => {
  setOpen(false);
  emit('close');
};
// 边界导航后按钮变 disabled 会被浏览器抛弃焦点（落回 body）：dialog 根上的 keydown
// （Esc/←/→/Tab）全部失效，Esc 关不掉、焦点陷阱破口——焦点丢失或落在 disabled 元素上时
// 移回 dialog 根（tabindex=-1 可编程聚焦），键盘继续可用
const restoreKeyboardFocus = () => {
  void nextTick(() => {
    const root = dialogEl.value;
    if (!root) return;
    const ae = document.activeElement;
    if (!ae || ae === document.body || (ae instanceof HTMLButtonElement && ae.disabled)) {
      root.focus();
    }
  });
};
const prev = () => {
  if (currentIndex.value > 0) setIndex(currentIndex.value - 1);
  restoreKeyboardFocus();
};
const next = () => {
  if (currentIndex.value < props.images.length - 1) setIndex(currentIndex.value + 1);
  restoreKeyboardFocus();
};

// 焦点管理：打开时把焦点移入对话框，关闭时归还给触发元素（Modal 是本包首个真正的全屏
// 强打断浮层，比 QuoteSheet/TriggerMenu 更需要显式焦点归还，属新增交互模式）
const dialogEl = ref<HTMLElement | null>(null);
let lastActive: HTMLElement | null = null;
watch(isOpen, (open) => {
  if (open) {
    lastActive = document.activeElement as HTMLElement | null;
    nextTick(() => dialogEl.value?.focus());
  } else {
    lastActive?.focus();
    lastActive = null;
  }
});

// 焦点陷阱：aria-modal="true" 承诺背景内容不可达，必须配合把 Tab 焦点圈在对话框内部，
// 否则走到首尾可聚焦元素后再按 Tab 会被浏览器带出 Teleport 到 body 下的对话框，落回背景 DOM。
const onTab = (e: KeyboardEvent) => {
  const root = dialogEl.value;
  if (!root) return;
  const focusables = root.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
};
</script>

<style lang="scss">
.aix-image-preview {
  position: fixed;
  inset: 0;
  z-index: 1000;

  &__mask {
    position: absolute;
    inset: 0;
    background: var(--aix-colorBgMask);
  }

  &__content {
    display: flex;
    position: relative;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  &__toolbar {
    display: flex;
    position: absolute;
    z-index: 1;
    top: var(--aix-paddingMD);
    right: var(--aix-paddingMD);
    align-items: center;
    gap: var(--aix-marginXS);
  }

  &__counter {
    color: var(--aix-colorWhite);
    font-size: var(--aix-fontSizeSM);
  }

  // 按钮底色刻意用固定的 rgb(255 255 255 / …) 而非 var(--aix-colorFillSecondary)：Modal 是固定
  // 深色背景的全屏看图器（不随 App 明暗主题切换），colorFillSecondary 在浅色主题下是
  // rgb(0 0 0 / 0.06)（深色，会在深色遮罩上"隐身"）——用 token 反而是回归。这是「固定深色控件条」
  // 的既有惯例（packages/video 的 DefaultControls.vue/PlaybackControls.vue 同款写法），非硬编码疏漏。
  &__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeight);
    height: var(--aix-controlHeight);
    border: none;
    border-radius: var(--aix-borderRadius);
    background: rgb(255 255 255 / 0.12);
    color: var(--aix-colorWhite);
    cursor: pointer;

    &:hover {
      background: rgb(255 255 255 / 0.24);
    }

    svg {
      width: 18px;
      height: 18px;
    }
  }

  &__nav {
    display: inline-flex;
    position: absolute;
    top: 50%;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    transform: translateY(-50%);
    border: none;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.12);
    color: var(--aix-colorWhite);
    cursor: pointer;

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &:not(:disabled):hover {
      background: rgb(255 255 255 / 0.24);
    }

    svg {
      width: 20px;
      height: 20px;
    }
  }

  &__nav-prev {
    left: var(--aix-paddingMD);
  }

  &__nav-next {
    right: var(--aix-paddingMD);
  }

  &__image {
    max-width: 90vw;
    max-height: 90vh;
    object-fit: contain;
  }
}
</style>
