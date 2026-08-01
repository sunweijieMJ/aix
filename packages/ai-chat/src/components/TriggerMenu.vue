<template>
  <!-- Teleport 到 body：菜单为 fixed 定位，若留在 Sender 内，业务把 AiChat/Sender 嵌进带
       transform/filter/will-change 的容器（抽屉、动画面板）时，fixed 会相对该祖先包含块
       定位并可能被其 overflow 裁剪。脱出到 body 后坐标恒相对视口，与 popper fixed 策略一致。
       注意：主题变量从 :root/[data-theme] 继承不受影响，但局部 ThemeScope 场景的作用域
       token 不会跟随（与各组件库 teleport 弹层的通行权衡一致）。 -->
  <Teleport to="body">
    <!-- role 随有无候选项切换：listbox 的子元素只应是 option/group，加载 / 空态时把状态文案
         塞进 listbox 属结构违规。此时本就没有可选项，整块按状态区暴露更贴切——role="status"
         自带 polite 活动区语义，「加载中 / 无匹配结果」还能被自动播报。 -->
    <div
      :id="menuId"
      ref="floatingElRef"
      :class="ns.b()"
      :style="floatingStyles"
      :role="hasOptions ? 'listbox' : 'status'"
      :aria-label="hasOptions ? t.triggerMenuLabel : undefined"
      @mousedown.prevent
    >
      <div v-if="loading" :class="ns.e('status')">{{ t.triggerMenuLoading }}</div>
      <div v-else-if="!items.length" :class="ns.e('status')">{{ t.triggerMenuEmpty }}</div>
      <template v-else>
        <!-- key 用下标而非 item.value：TriggerItem.value 没有唯一性约束（类型上只是 string，
             候选常来自后端搜索接口），重名 value 会让 v-for key 撞车 → Vue 告警 + 列表渲染错乱。
             下标本就是本菜单的身份口径——option 的 id 与 aria-activedescendant 指向的都是
             `${menuId}-option-${i}`，键盘导航的 activeIndex 也是下标；且候选在 query 变化时
             是整体替换（非局部增删），选项本身无内部状态，用下标不会产生复用错位。 -->
        <div
          v-for="(item, i) in items"
          :id="`${menuId}-option-${i}`"
          :key="i"
          :class="[ns.e('item'), ns.is('active', i === activeIndex)]"
          role="option"
          :aria-selected="i === activeIndex"
          @mouseenter="emit('update:activeIndex', i)"
          @click="emit('select', item)"
        >
          <component :is="item.icon" v-if="item.icon" :class="ns.e('icon')" />
          <span :class="ns.e('label')">{{ item.label }}</span>
          <span v-if="item.description" :class="ns.e('desc')">{{ item.description }}</span>
        </div>
      </template>
    </div>
  </Teleport>
</template>

<script lang="ts">
export interface TriggerMenuProps {
  /** 候选项（已由 Sender 侧解析/过滤完成） */
  items: TriggerItem[];
  /** 异步 items 加载中 */
  loading: boolean;
  /** 受控高亮下标（键盘导航由 Sender keydown 驱动，焦点不进菜单） */
  activeIndex: number;
  /** listbox 的 DOM id；选项 id 约定为 `${menuId}-option-${i}`，供 aria-activedescendant */
  menuId: string;
  /** 虚拟锚点工厂：@ 用 caret rect、/ 用 Sender 整框 rect（含降级），由调用方决定 */
  getAnchorRect: () => DOMRect;
  /**
   * 虚拟锚点的宿主元素（floating-ui VirtualElement.contextElement）：
   * autoUpdate 借此找到滚动祖先挂监听——缺省时锚点在可滚动容器内滚动不会触发重定位
   */
  contextEl?: HTMLElement | null;
}
export interface TriggerMenuEmits {
  (e: 'select', item: TriggerItem): void;
  (e: 'update:activeIndex', i: number): void;
}
</script>

<script setup lang="ts">
import { useLocale, useNamespace } from '@aix/hooks';
import { usePopper } from '@aix/popper';
import { computed, ref, watch, watchEffect } from 'vue';
import { locale } from '../locale';
import type { TriggerItem } from '../types';

const props = defineProps<TriggerMenuProps>();
const emit = defineEmits<TriggerMenuEmits>();
const ns = useNamespace('trigger-menu');
const { t } = useLocale(locale);

// 有可选项时才是 listbox；加载中 / 空结果时整块降级为状态区（见模板注释）
const hasOptions = computed(() => !props.loading && props.items.length > 0);

// 虚拟参考元素（同 QuoteToolbar 先例）：caret/整框没有稳定真实元素，用闭包桥接
const { referenceRef, floatingRef, floatingStyles } = usePopper({
  placement: 'top-start',
  strategy: 'fixed',
  offset: 4,
});
watchEffect(() => {
  referenceRef.value = {
    getBoundingClientRect: props.getAnchorRect,
    // contextElement 让 autoUpdate 挂上锚点侧滚动祖先监听（textarea 在可滚动容器内时菜单跟随）
    contextElement: props.contextEl ?? undefined,
  } as unknown as HTMLElement;
});

// 本地 ref 桥接 floatingRef（同 QuoteToolbar：双 script 块下 vue-tsc noUnusedLocals 误报规避）
const floatingElRef = ref<HTMLElement | null>(null);
watch(floatingElRef, (el) => {
  floatingRef.value = el;
});

// 键盘导航为 aria-activedescendant 模式（焦点不进菜单），浏览器不会自动把高亮项滚入可视区，
// 长列表键盘上下移时高亮项会滑出 max-height 视窗成为盲选，故在高亮下标变化时手动滚动。
// flush:'post' 确保 DOM 已按新 activeIndex 渲染；items 异步更新时以空引用守卫兜底。
watch(
  () => props.activeIndex,
  (i) => {
    const options = floatingElRef.value?.querySelectorAll<HTMLElement>('[role="option"]');
    options?.[i]?.scrollIntoView({ block: 'nearest' });
  },
  { flush: 'post' },
);
</script>

<style lang="scss">
.aix-trigger-menu {
  display: flex;
  z-index: 1000;
  flex-direction: column;
  min-width: 180px;
  max-width: 320px;
  max-height: 240px;
  padding: var(--aix-paddingXXS);
  overflow-y: auto;
  border: 1px solid var(--aix-colorBorderSecondary);
  border-radius: var(--aix-borderRadius);
  background-color: var(--aix-colorBgElevated);
  box-shadow: var(--aix-shadowMD);

  &__status {
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__item {
    display: flex;
    align-items: center;
    padding: var(--aix-paddingXS) var(--aix-paddingSM);
    border-radius: var(--aix-borderRadiusSM);
    cursor: pointer;
    gap: var(--aix-sizeXS);

    &.is-active {
      background-color: var(--aix-colorFillSecondary);
    }
  }

  &__icon {
    display: inline-flex;
    flex: none;

    svg {
      width: 16px;
      height: 16px;
    }
  }

  &__label {
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
  }

  &__desc {
    overflow: hidden;
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
