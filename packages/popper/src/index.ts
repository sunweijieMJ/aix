import type { App } from 'vue';
import ContextMenu from './components/ContextMenu.vue';
import Dropdown from './components/Dropdown.vue';
import DropdownItem from './components/DropdownItem.vue';
import Popover from './components/Popover.vue';
import Popper from './components/Popper.vue';
import PopperArrow from './components/PopperArrow.vue';
import Tooltip from './components/Tooltip.vue';

// 样式
import './styles/index.scss';

// 类型导出
export type {
  PopperProps,
  PopperEmits,
  PopperExpose,
  TooltipProps,
  TooltipEmits,
  TooltipExpose,
  PopoverProps,
  PopoverEmits,
  PopoverExpose,
  DropdownProps,
  DropdownEmits,
  DropdownExpose,
  DropdownMenuItem,
  DropdownItemProps,
  DropdownItemEmits,
  ContextMenuProps,
  ContextMenuEmits,
  ContextMenuExpose,
  DropdownContext,
  TriggerType,
  Placement,
  Strategy,
  Middleware,
} from './types';

// 组件导出
export { Popper, PopperArrow, Tooltip, Popover, Dropdown, DropdownItem, ContextMenu };

// Composable 导出
export {
  usePopper,
  usePopperTrigger,
  createVirtualElement,
  createMenuKeyDown,
} from './composables';

export type {
  UsePopperOptions,
  UsePopperReturn,
  UsePopperTriggerOptions,
  UsePopperTriggerReturn,
  MenuKeyboardOptions,
} from './composables';

// 注入 Key
export { DROPDOWN_INJECTION_KEY } from './types';

// 语言包
export { locale as popperLocale, zhCN as popperZhCN, enUS as popperEnUS } from './locale';
export type { PopperLocale } from './locale';

// 插件
export default {
  install(app: App) {
    app.component('AixPopper', Popper);
    app.component('AixTooltip', Tooltip);
    app.component('AixPopover', Popover);
    app.component('AixDropdown', Dropdown);
    app.component('AixDropdownItem', DropdownItem);
    app.component('AixContextMenu', ContextMenu);
  },
};
