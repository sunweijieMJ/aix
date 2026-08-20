<template>
  <nav :class="ns.b()" :aria-label="t.outlineLabel">
    <ul :class="ns.e('list')">
      <li v-for="(entry, i) in entries" :key="entry.messageId" :class="ns.e('item')">
        <button
          :ref="(el) => setTickEl(i, el)"
          type="button"
          :class="[ns.e('tick'), ns.is('active', entry.messageId === activeId)]"
          :style="waveStyle(i)"
          :aria-label="labelOf(entry)"
          :aria-describedby="waveIndex === i ? tooltipId : undefined"
          :aria-current="entry.messageId === activeId ? 'true' : undefined"
          @click="emit('select', entry)"
          @mouseenter="focusWave(i)"
          @mouseleave="blurWave(i)"
          @focus="focusWave(i)"
          @blur="blurWave(i)"
        >
          <!-- 常态只有这一条刻度线：摘要文案改由下方浮层承载，不再在轨道里原地展开
               （原地展开会把整条轨道推宽、挤压正文，且长摘要只能截断） -->
          <span :class="ns.e('tick-mark')" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <!-- 摘要浮层：Teleport 到 body 而非留在 nav 内 —— AiChat 给本组件的定位容器带
         `transform: translateY(-50%)`，而 transform 会成为 fixed 定位的包含块，
         浮层若留在其内，floating-ui 算出的视口坐标会整体偏移；顺带也躲开父级 overflow 裁剪。 -->
    <Teleport to="body">
      <div
        v-if="hoveredEntry"
        :id="tooltipId"
        ref="floatingElRef"
        role="tooltip"
        :class="ns.e('tip')"
        :style="floatingStyles"
      >
        {{ labelOf(hoveredEntry) }}
      </div>
    </Teleport>
  </nav>
</template>

<script lang="ts">
// OutlineEntry 由下方 setup 块 import 提供（两个 script 块共享作用域），
// 此处不重复 import 以符合 import/order（首块相对 import 会排在 setup 块的外部包之前）
export interface MessageOutlineProps {
  /** 可见刻度条目（通常传 useMessageOutline 的 windowed） */
  entries?: OutlineEntry[];
  /** 当前活跃条目的 messageId，决定高亮 */
  activeId?: string;
}

export interface MessageOutlineEmits {
  /** 点击某条刻度：宿主负责滚动定位（组件不碰滚动容器） */
  (e: 'select', entry: OutlineEntry): void;
}
</script>

<script setup lang="ts">
import { useId, useNamespace } from '@aix/hooks';
import { usePopper } from '@aix/popper';
import { computed, ref, watch } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import { useAiChatLocale } from '../composables/useAiChatLocale';
import type { OutlineEntry } from '../composables/useMessageOutline';

const props = withDefaults(defineProps<MessageOutlineProps>(), { entries: () => [] });
const emit = defineEmits<MessageOutlineEmits>();

const ns = useNamespace('message-outline');
const { t } = useAiChatLocale();
const tooltipId = `aix-outline-tip-${useId()}`;

// 纯图片/附件消息派生不出摘要，回退到本地化文案而非留空（否则刻度只有一个光秃秃的点）
const labelOf = (entry: OutlineEntry) => entry.label || t.value.outlineUntitled;

// ── 声波式 hover：以指针所在刻度为波峰，向上下按距离衰减地扩张相邻刻度 ──
// 只把「振幅系数 + 距离」写成 CSS 变量交给样式层，动画本体（缓动、时长、错峰延时）全在 CSS，
// JS 不碰任何几何量，故不产生逐帧计算，也不需要 rAF。
//
// 为什么用 JS 记 index 而不是纯 CSS 兄弟选择器：波峰要向**两侧**衰减，而 CSS 只能向后选兄弟
// （`~`/`+`），向前得靠 `:has()`，且每多覆盖一圈就要多写一组选择器、层级平方增长。
const AMPLITUDE_FALLOFF = [1, 0.58, 0.26, 0.08];

const waveIndex = ref<number | null>(null);
const focusWave = (i: number) => {
  waveIndex.value = i;
};
// 只在「离开的正是当前波峰」时清除：相邻刻度间指针移动会先派发 mouseleave(A) 再 mouseenter(B)，
// 无此守卫时 B 的进入会被 A 的离开覆盖掉（顺序依赖），波峰在快速划过时丢失。
const blurWave = (i: number) => {
  if (waveIndex.value === i) waveIndex.value = null;
};

const waveStyle = (i: number) => {
  const center = waveIndex.value;
  const distance = center == null ? AMPLITUDE_FALLOFF.length : Math.abs(i - center);
  return {
    '--aix-outline-wave': String(AMPLITUDE_FALLOFF[distance] ?? 0),
    // 错峰延时用的距离（波从峰向外扩散，而非整列同时动）；夹到衰减范围内避免远端延时过长
    '--aix-outline-dist': String(Math.min(distance, AMPLITUDE_FALLOFF.length)),
  };
};

// ── 波峰摘要浮层：跟随当前波峰所在刻度定位 ──
// 刻度元素引用表（非响应式数组即可：定位只在 waveIndex 变化时读一次，不参与渲染）
const tickEls: (HTMLElement | null)[] = [];
const setTickEl = (i: number, el: Element | ComponentPublicInstance | null) => {
  tickEls[i] = (el as HTMLElement | null) ?? null;
};

const hoveredEntry = computed(() =>
  waveIndex.value == null ? null : (props.entries[waveIndex.value] ?? null),
);

// strategy 'fixed' + flip/shift：贴着视口右缘的窄轨道上，左侧空间不足时自动翻边、
// 上下溢出时自动收进视口，比自绘 absolute 定位可靠
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'left',
  strategy: 'fixed',
  offset: 10,
});
// 波峰移动即换锚点元素，浮层随之重新定位。entries 也在依赖里：悬停期间 windowed 窗口
// 因新消息滑动时，v-for 按 messageId 换元素，只看 waveIndex 会让锚点悬在已卸载的旧节点
// 上（rect 全 0，浮层跳视口左上角），而 hoveredEntry 实时换成新条目——标签与位置错位。
// flush post：等 :ref 回调把 tickEls 刷成新元素后再取锚点。
watch(
  [waveIndex, () => props.entries],
  ([i]) => {
    referenceRef.value = i == null ? null : (tickEls[i] ?? null);
  },
  { flush: 'post' },
);
// 本地模板 ref 桥接到 usePopper 的 floatingRef（同 QuoteToolbar / ContextWindow 先例）：
// 双 <script> 块下直接绑 usePopper 解构出的 Ref 会触发 vue-tsc noUnusedLocals 误报
const floatingElRef = ref<HTMLElement | null>(null);
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});
</script>

<style lang="scss">
.aix-message-outline {
  display: flex;
  align-items: center;
  pointer-events: none;

  &__list {
    display: flex;
    flex-direction: column;

    /* 刻度之间刻意不留 gap，改由 tick 自身的纵向 padding 撑开间距：
       留 gap 会在两枚刻度之间形成一条收不到指针事件的死区，指针纵向划过时波峰被反复
       置空又重建（塌陷—重涨—塌陷），声波的连续感就没了。padding 撑开则命中区首尾相接。 */
    margin: 0;
    padding: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    justify-content: flex-end;
  }

  &__tick {
    display: flex;
    align-items: center;

    /* 纵向 padding 代替 list 的 gap（见上），横向保持原值 */
    padding: 4px var(--aix-paddingXXS);
    border: none;
    background: transparent;
    cursor: pointer;
    pointer-events: auto;

    /* 波峰与当前活跃项：主色 + 满不透明度。opacity 必须显式拉满——它平时由振幅系数插值
       （0.45～1），活跃项在指针停在别处时振幅为 0，不覆盖就会是一枚"淡掉的主色刻度"。 */
    &:hover .aix-message-outline__tick-mark,
    &.is-active .aix-message-outline__tick-mark {
      opacity: 1;
      background-color: var(--aix-colorPrimary);
    }

    &:focus-visible {
      border-radius: var(--aix-borderRadiusSM);
      outline: 2px solid var(--aix-colorPrimaryBorder);
      outline-offset: 2px;
    }
  }

  /* 声波刻度：宽度与浓淡都由 --aix-outline-wave（0–1 振幅系数，JS 按到波峰的距离下发）驱动。
     缓动用 easeOutBack 一类的回弹曲线而非 easeInOut——后者两头慢、中间快，短距离位移下
     读起来像"黏住了"；回弹曲线起步快、末端轻微过冲后落定，
     才是波纹该有的手感。transition-delay 按到波峰的距离错峰，让形变从波峰向两端扩散。
     两个变量刻意**不在本选择器里声明**，只用 var() 的行内兜底值：它们由 JS 绑在父级 __tick
     上靠继承下来，若这里再写一遍 `--aix-outline-wave: 0`，自身声明会盖掉继承值，波形恒为 0。 */
  &__tick-mark {
    flex: none;
    width: calc(14px + var(--aix-outline-wave, 0) * 15px);
    height: 3px;
    transition:
      width 340ms cubic-bezier(0.34, 1.4, 0.5, 1),
      opacity 340ms cubic-bezier(0.34, 1.4, 0.5, 1),
      background-color var(--aix-motionDurationMid) var(--aix-motionEaseInOut);
    transition-delay: calc(var(--aix-outline-dist, 0) * 28ms);
    border-radius: 2px;
    opacity: calc(0.45 + var(--aix-outline-wave, 0) * 0.55);
    background-color: var(--aix-colorBorder);
  }
}

/* 波峰摘要浮层（Teleport 到 body，故与 .aix-message-outline 平级而非嵌套）。
   定宽 + 高度自适应：定宽让长短摘要的浮层左缘对齐、指针纵向扫过时不会左右抽动；
   高度交给内容，长摘要折行完整展示而不是截断（这正是从轨道内联文案换成浮层的目的）。 */
.aix-message-outline__tip {
  z-index: var(--aix-zIndexTooltip);

  /* 定宽 + 自适应高度 */
  box-sizing: border-box;
  width: 220px;
  padding: var(--aix-paddingXS) var(--aix-paddingSM);
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadius);
  background-color: var(--aix-colorBgElevated);
  box-shadow: var(--aix-shadowMD);
  color: var(--aix-colorText);
  font-size: var(--aix-fontSizeSM);
  line-height: var(--aix-lineHeightSM);

  /* 纯提示层：不接指针事件，避免浮层盖住轨道后把 mouseleave 吃掉导致波峰卡住 */
  pointer-events: none;

  /* 长词/URL 不撑破定宽 */
  overflow-wrap: anywhere;
}

/* 尊重系统「减少动态效果」设置：整体关闭声波放大，只保留「当前项 / 悬浮项高亮」这层必要反馈
   （摘要浮层照常展示——它是信息而非动效）。仅去掉 transition 是不够的：那样振幅仍在生效，
   只是从平滑扩张变成瞬间跳变，对该设置的用户反而更刺激。 */
@media (prefers-reduced-motion: reduce) {
  .aix-message-outline__tick-mark {
    width: 14px;
    transition: none;
    transition-delay: 0s;
    opacity: 1;
  }
}
</style>
