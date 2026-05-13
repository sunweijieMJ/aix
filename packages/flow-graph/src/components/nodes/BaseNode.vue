<template>
  <ContextMenu
    ref="contextMenuRef"
    trigger="manual"
    popper-class="aix-flow-node-menu"
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
      class="aix-flow-node__wrapper"
      :class="{ 'aix-flow-node__wrapper--connectable': connectable }"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @contextmenu.prevent
    >
      <NodeActiveCross
        v-if="nodeState === 'active'"
        :uid="`n-${id}`"
        :color="data?.color || fallbackColor"
        :colors="data?.pathColors ?? []"
      />
      <slot :size="size" :node-state="nodeState" :clicking="clicking" :on-click="onNodeLeftClick" />
      <Handle type="target" :position="Position.Left" class="aix-flow-node__handle" />
      <Handle type="source" :position="Position.Right" class="aix-flow-node__handle" />
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
      >
        {{ data?.label }}
      </div>
    </div>
    <template #menu>
      <DropdownItem command="copy">
        <img src="../../assets/icon-copy.svg" class="aix-flow-node-menu__icon" alt="" />
        {{ t.copy }}
      </DropdownItem>
      <DropdownItem command="delete" class="aix-flow-node-menu__delete">
        <img src="../../assets/icon-delete.svg" class="aix-flow-node-menu__icon" alt="" />
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
import { computed, inject, ref, toRef, watch } from 'vue';
import { useNodeInteraction } from '../../composables/useNodeInteraction';
import zhCN from '../../locale/zh-CN';
import { FlowGraphLocaleKey, FlowNodeLabelConfigKey, type NodeData } from '../../types';
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
  if (props.data?.selecting) return true;
  const threshold = labelConfig?.zoomThreshold.value ?? 0.6;
  return viewport.value.zoom >= threshold;
});

const { nodeState, clicking, onNodeClick, onCommand } = useNodeInteraction({
  id: props.id,
  data: toRef(props, 'data'),
});

const contextMenuRef = ref<ContextMenuExpose | null>(null);

/**
 * 节点左击：切换 active/default 状态。切到 active 时按鼠标坐标弹出菜单；
 * 关菜单由下面的 watch(nodeState) 统一负责（包括外部 reset 路径），此处不重复处理。
 *
 * 注意：nodeState 来自 props.data，更新是异步（vue-flow store → props patch → computed），
 * 不能在 onNodeClick() 之后立刻读"切换后状态"。这里基于"切换前状态"预判 willActivate。
 * 右键不弹菜单（ContextMenu 用 `trigger="manual"`），但事件冒泡到 vue-flow，
 * FlowGraph 据此 emit `node-right-click`（详见 template 注释）。
 */
function onNodeLeftClick(event: MouseEvent) {
  const willActivate = nodeState.value !== 'active';
  onNodeClick();
  if (willActivate) contextMenuRef.value?.show(event);
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

.aix-flow-node__wrapper {
  position: relative;
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

.aix-flow-node__label--selecting {
  background: var(--aix-colorPrimary, #1546f2);
  color: var(--aix-colorTextLight, #fff);
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
