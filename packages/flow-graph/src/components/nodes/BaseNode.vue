<template>
  <ContextMenu
    ref="contextMenuRef"
    trigger="manual"
    :popper-class="menuPopperClass"
    @command="onCommand"
  >
    <!--
      右键行为：仅屏蔽菜单 UI，保留 `node-right-click` 事件透传。
      - `.prevent` 阻止浏览器默认右键菜单；
      - 不加 `.stop`：事件继续冒泡到 `.vue-flow__node`，让 vue-flow emit `nodeContextMenu`，
        FlowGraph 据此 emit 对外的 `node-right-click`（公开 API，README 文档化）；
      - 不弹菜单是因为 ContextMenu 使用了 `trigger="manual"`，不会自动响应 contextmenu。
    -->
    <div
      ref="wrapperRef"
      class="aix-flow-node__wrapper"
      :class="{ 'aix-flow-node__wrapper--connectable': connectable }"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @contextmenu.prevent
    >
      <!--
        节点本体容器：hover 监听只挂在这里，与下方"label"分离，
        避免悬停 label 时也触发菜单。body 完全填充 wrapper 的几何矩形，
        与原来直接挂 wrapper 的 hover 命中区一致。
      -->
      <div
        ref="bodyRef"
        class="aix-flow-node__body"
        @mouseenter="onBodyMouseEnter"
        @mouseleave="onBodyMouseLeave"
      >
        <NodeActiveCross
          v-if="nodeState === 'active'"
          :uid="`n-${id}`"
          :color="data?.color || fallbackColor"
          :colors="data?.pathColors ?? []"
        />
        <slot
          :size="size"
          :node-state="nodeState"
          :clicking="clicking"
          :on-click="onNodeLeftClick"
        />
        <Handle type="target" :position="Position.Left" class="aix-flow-node__handle" />
        <Handle type="source" :position="Position.Right" class="aix-flow-node__handle" />
      </div>
      <!--
        节点上方常驻 label：
        - 默认固定宽度 + 单行省略；hover label 自身时展开完整文本；
        - 拖拽期间隐藏，避免跟随节点抖动；
        - 缩放过小（zoom < threshold）时整体隐藏，避免画面拥挤；
        - selecting 高亮时强制显示（即使 zoom 小于阈值），作为高亮态身份兜底。
      -->
      <div
        v-if="showLabel"
        class="aix-flow-node__label"
        :class="{ 'aix-flow-node__label--selecting': data?.selecting }"
        :style="labelStyle"
      >
        {{ data?.label }}
      </div>
    </div>
    <template #menu>
      <DropdownItem command="copy">
        <img src="../../assets/icon-copy.svg" class="aix-flow-node-menu__icon" alt="" />
        {{ t.copy }}
      </DropdownItem>
      <DropdownItem
        command="delete"
        :class="[
          'aix-flow-node-menu__delete',
          { 'aix-flow-node-menu__delete--disabled': !nodeDeletable },
        ]"
      >
        <svg
          class="aix-flow-node-menu__icon"
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path
            d="M12.75 4.5H16.5V6H15V15.75C15 16.1642 14.6642 16.5 14.25 16.5H3.75C3.33579 16.5 3 16.1642 3 15.75V6H1.5V4.5H5.25V2.25C5.25 1.83579 5.58579 1.5 6 1.5H12C12.4142 1.5 12.75 1.83579 12.75 2.25V4.5ZM13.5 6H4.5V15H13.5V6ZM6.75 8.25H8.25V12.75H6.75V8.25ZM9.75 8.25H11.25V12.75H9.75V8.25ZM6.75 3V4.5H11.25V3H6.75Z"
            fill="currentColor"
          />
        </svg>
        {{ t.delete }}
      </DropdownItem>
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
/**
 * 节点公共骨架：
 * - 统一安装 ContextMenu（复制/删除）、节点上方常驻 label、NodeActiveCross、Handle；
 * - 统一挂载 useNodeInteraction（点击/右键/复制/删除的状态同步）；
 * - 视觉通过默认 slot 暴露 `{ size, nodeState, onClick }`，由子类渲染形状；
 * - Handle 的 pointer-events 由 `connectable` 控制。
 */
import { ContextMenu, DropdownItem, type ContextMenuExpose } from '@aix/popper';
import { Handle, Position, useVueFlow, type HandleConnectable } from '@vue-flow/core';
import { computed, inject, onScopeDispose, ref, toRef, useId, watch } from 'vue';
import { useNodeInteraction } from '../../composables/useNodeInteraction';
import zhCN from '../../locale/zh-CN';
import {
  FlowGraphLocaleKey,
  FlowNodeLabelConfigKey,
  FlowNodeMenuConfigKey,
  type NodeData,
} from '../../types';
import NodeActiveCross from './NodeActiveCross.vue';

/**
 * BaseNode 仅声明自己实际使用的 NodeProps 字段 + 两个扩展 prop。
 * 子类通过 `v-bind="$props"` 透传给 BaseNode，未声明的字段会落到 $attrs 被忽略。
 */
interface Props {
  id: string;
  data?: NodeData;
  dragging?: boolean;
  connectable?: HandleConnectable;
  /** 节点默认尺寸（px）：当 data.size 未设置时使用 */
  defaultSize: number;
  /** NodeActiveCross 颜色回退值：当 data.color 未设置时使用 */
  fallbackColor: string;
}

defineOptions({ name: 'AixFlowBaseNode', inheritAttrs: false });

const props = defineProps<Props>();

/** 节点尺寸（像素），回退到 defaultSize */
const size = computed(() => props.data?.size ?? props.defaultSize);

/** i18n：从 FlowGraph 注入；脱离 FlowGraph 单独使用时回退中文兜底 */
const t = inject(
  FlowGraphLocaleKey,
  computed(() => zhCN),
);

/**
 * 常驻 label 显示策略：
 * - 配置由 FlowGraph 通过 InjectionKey 注入；BaseNode 单独使用时回退到默认（启用、阈值 0.6）
 * - 缩放低于阈值（看全景时）整体隐藏，避免画面密密麻麻
 * - 拖拽期间隐藏，避免跟随节点抖动
 * - selecting 高亮时强制显示，作为高亮态的身份兜底（即使 zoom 小于阈值）
 */
const labelConfig = inject(FlowNodeLabelConfigKey, null);
const { viewport } = useVueFlow();
const showLabel = computed(() => {
  if (labelConfig && !labelConfig.enabled.value) return false;
  if (!props.data?.label) return false;
  if (props.dragging) return false;
  if (props.data?.dimmed) return false;
  if (props.data?.selecting) return true;
  const threshold = labelConfig?.zoomThreshold.value ?? 0.6;
  return viewport.value.zoom >= threshold;
});

const { nodeState, clicking, onNodeClick, onCommand } = useNodeInteraction({
  id: props.id,
  data: toRef(props, 'data'),
});

/**
 * 菜单触发开关：节点 `data.menuOnClick / menuOnHover` 优先于全局 prop。
 * 脱离 FlowGraph 单独使用时回退到 true（保留默认行为）。
 */
const menuConfig = inject(FlowNodeMenuConfigKey, null);
const menuOnClickEnabled = computed(
  () => props.data?.menuOnClick ?? menuConfig?.onClick.value ?? true,
);
const menuOnHoverEnabled = computed(
  () => props.data?.menuOnHover ?? menuConfig?.onHover.value ?? true,
);

/**
 * 当前节点是否可删除：默认 `true`，业务设置 `data.deletable === false` 时菜单项置灰不可点。
 * 键盘删除路径的拦截在 FlowGraph 的 `onKeyDelete` 中实现，会额外触发 `node-delete-blocked` 事件。
 */
const nodeDeletable = computed(() => props.data?.deletable !== false);

/**
 * selecting 高亮时，label 描边色只取 `data.activeColor`（业务在高亮某条路径时写入该路径的颜色），
 * 通过 CSS 变量交给样式层消费；不回退 `data.color`，因为多路径共用节点的 `data.color` 可能是
 * `conic-gradient(...)` 字符串（业务侧多色拼接），无法用作 `outline-color`。
 * 无 activeColor 时（URL 定位/单点高亮等非路径语境）由 CSS 主题色兜底。
 */
const labelStyle = computed<Record<string, string> | undefined>(() => {
  if (!props.data?.selecting) return undefined;
  const color = props.data?.activeColor;
  return color ? { '--aix-flow-node-label-border-color': color } : undefined;
});

const contextMenuRef = ref<ContextMenuExpose | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const bodyRef = ref<HTMLElement | null>(null);

/**
 * Hover 显示菜单：
 * - 每个 BaseNode 实例分配一个唯一 popper-class 后缀，便于在轮询时定位"自己"那个浮层；
 * - 用 Vue 3.5 的 useId() 生成稳定唯一 id，兼容 SSR 与 HMR；
 * - useId 形如 `v-0` / `:r0:`，统一替换非 token 字符以确保可作为 CSS 类名 / 选择器使用。
 */
const menuId = useId().replace(/[^a-zA-Z0-9_-]/g, '_');
const menuPopperClass = `aix-flow-node-menu aix-flow-node-menu--${menuId}`;

/**
 * 鼠标 hover 节点时显示菜单；离开后延迟关闭，给用户时间跨过节点与菜单之间 4px 间隙去操作菜单。
 *
 * 隐藏策略采用"延迟 + 自轮询 :hover"，理由：
 * - 菜单是 Teleport 到 body 的，wrapper:hover 不包含菜单，
 *   单纯依赖 wrapper 的 mouseleave 会让用户在跨越间隙时菜单瞬间消失；
 * - 在菜单浮层上挂 mouseenter/leave 监听存在时序竞态：菜单 v-if 渲染后还要等 nextTick，
 *   而用户从节点滑入菜单可能更快，监听挂上之前的 mouseenter 会被错过；
 * - 用 setTimeout 到点时通过 `Element.matches(':hover')` 直接读浏览器原生 hover 状态，
 *   命中时再短轮询，原生状态既无监听时序问题，也涵盖菜单内部子元素的 hover 传递。
 *
 * 与点击 active 的关系：active 由 useNodeInteraction 持有；只要节点处于 active，
 * 这里的 tryHide 不主动隐藏，把关闭交给 watch(nodeState) 走点击/外点关闭路径。
 */
const HIDE_DELAY = 200;
const HIDE_POLL = 100;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function clearHideTimer() {
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function tryHide() {
  hideTimer = null;
  if (nodeState.value === 'active') return;
  // 仅看 body 与菜单是否仍被 hover：wrapper 还包含 label，
  // 鼠标停在 label 上不应阻止菜单关闭。
  const menuEl = document.querySelector(`.aix-flow-node-menu--${menuId}`) as HTMLElement | null;
  if (bodyRef.value?.matches(':hover') || menuEl?.matches(':hover')) {
    hideTimer = setTimeout(tryHide, HIDE_POLL);
    return;
  }
  contextMenuRef.value?.hide();
}

function scheduleHideMenu() {
  clearHideTimer();
  hideTimer = setTimeout(tryHide, HIDE_DELAY);
}

function onBodyMouseEnter() {
  clearHideTimer();
  if (!menuOnHoverEnabled.value) return;
  // 仍以 wrapper 为锚定位菜单，保持与点击触发时的对齐位置一致
  if (wrapperRef.value) contextMenuRef.value?.show(wrapperRef.value);
}

function onBodyMouseLeave() {
  // 即便 hover 关闭也允许调度隐藏：可能是 click 路径打开的菜单残留，
  // tryHide 内部会再判一次 active 状态来决定真正是否隐藏。
  scheduleHideMenu();
}

onScopeDispose(clearHideTimer);

/**
 * 节点左击：切换 active/default 状态。切到 active 时以"节点元素"为锚弹出菜单；
 * 关菜单由下面的 watch(nodeState) 统一负责（包括外部 reset 路径），此处不重复处理。
 *
 * 为什么不传 event：以鼠标坐标定位时，菜单会被钉在点击瞬间的屏幕位置；
 * 业务方常会在 node-click 之后调用 `fitView` 把节点平移到画布中心，
 * 此时虚拟元素的 rect 不变，菜单就会和节点脱节。改成传节点 wrapper 元素后，
 * floating-ui 的 autoUpdate（默认 layoutShift IntersectionObserver）会跟随节点
 * 位移自动重定位，菜单始终贴在节点下方。
 *
 * 注意：nodeState 来自 props.data，更新是异步（vue-flow store → props patch → computed），
 * 不能在 onNodeClick() 之后立刻读"切换后状态"。这里基于"切换前状态"预判 willActivate。
 * 右键不弹菜单（ContextMenu 用 `trigger="manual"`），但事件冒泡到 vue-flow，
 * FlowGraph 据此 emit `node-right-click`（详见 template 注释）。
 */
function onNodeLeftClick(_event: MouseEvent) {
  const willActivate = nodeState.value !== 'active';
  onNodeClick();
  if (!menuOnClickEnabled.value) return;
  if (willActivate && wrapperRef.value) contextMenuRef.value?.show(wrapperRef.value);
}

/**
 * 节点 active 由 useNodeInteraction 内部多个路径切换（如全局 mousedown 的 resetAllNodeStates）。
 * manual 模式下 ContextMenu 不再自动监听点击外部，因此必须 watch nodeState：
 * 一旦非 active，主动关闭菜单，避免"节点未选中但菜单还挂着"的视觉残留。
 */
watch(nodeState, (s) => {
  if (s !== 'active') contextMenuRef.value?.hide();
});

defineExpose({ size, nodeState });
</script>

<style>
.vue-flow__node-default:has(.aix-flow-node__wrapper) {
  width: auto !important;
  padding: 0 !important;
  overflow: visible !important;
  border: none !important;
  background: transparent !important;
  box-shadow: none !important;
}

/*
  节点 hover 或路径高亮（selecting）时抬高所在 .vue-flow__node 的 z-index：
  label 渲染在节点内，vue-flow 给每个节点内联了 z-index，label 自身的 z-index 只在本节点
  局部 stacking context 内生效；相邻节点（尤其后渲染的）会遮住当前节点的 label。
  这里压过 vue-flow 的内联值，确保 hover/高亮态的节点连同 label 一起浮在上层。
*/
.vue-flow__node:has(.aix-flow-node__wrapper:hover),
.vue-flow__node:has(.aix-flow-node__label--selecting) {
  z-index: 1000 !important;
}

.aix-flow-node__wrapper {
  position: relative;
}

/*
  节点本体容器：撑满 wrapper 的几何矩形，
  作为 hover 区与绝对定位子元素（NodeActiveCross / Handle）的定位锚点。
  与原直接挂在 wrapper 上的视觉等价，但把 hover 区与外侧的 label 隔离开。
*/
.aix-flow-node__body {
  position: relative;
  width: 100%;
  height: 100%;
}

/*
  把节点与 label 之间 6px 视觉间隙补成 hover 命中区，避免 mouse 跨越时短暂离开
  wrapper hover 状态导致 label 闪烁。伪元素是 wrapper 的后代 → 落在它上面时
  wrapper:hover 仍为真，hover 连续不断。宽度取 label max-width 保证不论 mouse
  竖直方向偏左/偏右都能命中。
*/
.aix-flow-node__wrapper::before {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  width: 178px;
  height: 6px;
  transform: translateX(-50%);
}

.aix-flow-node__wrapper .vue-flow__handle {
  width: 10px;
  height: 10px;
  border: none;
  opacity: 0;
  background: transparent;
  pointer-events: none;
}

.aix-flow-node__wrapper .aix-flow-node__handle {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.aix-flow-node__wrapper--connectable .aix-flow-node__handle {
  pointer-events: auto;
}

/*
  节点上方常驻 label：
  - 默认固定宽度 + 单行省略；
  - 鼠标 hover label 自身时去掉宽度限制展开完整文本；
  - pointer-events: auto 仅作用于 label 区域，节点本身的点击/拖拽不受影响（label 在节点外侧上方）。
*/
.aix-flow-node__label {
  position: absolute;
  z-index: 2;
  bottom: calc(100% + 6px);
  left: 50%;
  box-sizing: border-box;

  /*
    width: max-content + max-width: 178px
    --------------------------------------
    absolutely 定位元素 `width: auto` 走 shrink-to-fit，公式 min(max-content, max(min-content, 可用宽度))。
    切到 `white-space: normal` 后 min-content 退化到单字宽，加上节点 size 决定的"可用宽度"很小，
    shrink-to-fit 会崩成 1 字宽（每行 1 个字）。
    `width: max-content` 强制按完整单行宽计算（不受 white-space 影响），再由 max-width 兜底到 178px。
    短文本仍按内容宽度 tight-fit，长文本稳定截到 178px 后由换行规则铺成多行。
  */
  width: max-content;
  max-width: 178px;

  /* 默认单行：内容高度 = padding(8+8) + line-height(20) = 36px */
  max-height: 36px;
  padding: 8px 12px;
  overflow: hidden;
  transform: translateX(-50%);
  transition: max-height 0.22s ease 0.3s;
  border-radius: 12px;
  background: var(--aix-colorBgElevated, #fff);
  box-shadow: 0 6px 36px 0 rgb(0 0 0 / 0.12);
  color: var(--aix-colorTextSecondary, #4e5969);
  font-size: 12px;
  line-height: 20px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;

  /*
    label 可接收 hover：mouse 移到 label 上时（label 是 wrapper 的后代），
    wrapper:hover 仍然为真，展开态可持续。
    宽度由 `width: max-content` 锁定（仅高度变化），不再有 width 抖动循环。
    transition-delay 0.1s 兜底：跨越节点与 label 之间 6px 间隙时给一个小宽限，
    避免在间隙瞬间立即坍缩；hover 进入时仍立即展开（delay 0s）。
  */
  user-select: none;
}

/*
  hover 节点本身时：宽度保持 178px，仅高度增加用于多行换行；
  white-space 不可 transition 直接 snap，max-height 平滑过渡形成"高度展开"效果。
*/
.aix-flow-node__wrapper:hover .aix-flow-node__label {
  z-index: 10;
  max-height: 200px;
  transition-delay: 0s;
  white-space: normal;
  overflow-wrap: anywhere;
}

/*
  selecting 高亮：用 outline 描边，不占布局空间且跟随 border-radius，
  避免与 box-shadow 叠加导致布局抖动。
  描边色优先取业务传入的路径色（通过内联 CSS 变量注入），无则回退到主题色。
*/
.aix-flow-node__label--selecting {
  outline: 1px solid var(--aix-flow-node-label-border-color, var(--aix-colorPrimary, #1546f2));
}

/* 圆形 / 六边形共用的点击反馈动画 */
@keyframes aix-node-click {
  0% {
    transform: scale(1);
  }

  40% {
    transform: scale(0.88);
  }

  100% {
    transform: scale(1);
  }
}
</style>
