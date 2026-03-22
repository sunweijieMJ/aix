import type { Placement, Strategy, Middleware } from '@floating-ui/vue';
import type { InjectionKey, Ref } from 'vue';

export type { Placement, Strategy, Middleware };

/** 触发器类型 */
export type TriggerType =
  | 'hover'
  | 'click'
  | 'focus'
  | 'contextmenu'
  | 'manual';

// ==================== Popper (底层) ====================

export interface PopperProps {
  /**
   * 浮动元素相对于参考元素的位置
   * @default 'bottom'
   */
  placement?: Placement;

  /**
   * CSS 定位策略
   * @default 'absolute'
   */
  strategy?: Strategy;

  /**
   * 参考元素与浮动元素之间的距离 (px)
   * @default 8
   */
  offset?: number;

  /**
   * 是否显示箭头
   * @default false
   */
  arrow?: boolean;

  /**
   * 箭头大小 (px)
   * @default 8
   */
  arrowSize?: number;

  /**
   * 是否启用翻转 (空间不足时自动翻转到对面)
   * @default true
   */
  flip?: boolean;

  /**
   * 是否启用平移 (溢出边界时自动平移)
   * @default true
   */
  shift?: boolean;

  /**
   * Teleport 目标
   * @default 'body'
   */
  teleportTo?: string | HTMLElement;

  /**
   * 是否禁用 Teleport
   * @default false
   */
  teleportDisabled?: boolean;

  /**
   * 过渡动画名称
   * @default 'aix-popper-fade'
   */
  transition?: string;

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 受控的显示状态 (v-model:open)
   */
  open?: boolean;

  /**
   * 浮动元素的自定义 class
   */
  popperClass?: string | string[] | Record<string, boolean>;

  /**
   * 浮动元素的自定义 style
   */
  popperStyle?: string | Record<string, string>;

  /**
   * 自定义 z-index
   */
  zIndex?: number;

  /**
   * 额外的 Floating UI middleware（追加到内置的 offset/flip/shift/arrow 之后）
   */
  middleware?: Middleware[];
}

export interface PopperEmits {
  /** 显示状态变更 */
  (e: 'update:open', value: boolean): void;
  /** 显示后触发 */
  (e: 'show'): void;
  /** 隐藏后触发 */
  (e: 'hide'): void;
  /** 显示前触发 */
  (e: 'before-show'): void;
  /** 隐藏前触发 */
  (e: 'before-hide'): void;
}

export interface PopperExpose {
  /** 显示浮动元素 */
  show: () => void;
  /** 隐藏浮动元素 */
  hide: () => void;
  /** 手动更新位置 */
  update: () => void;
  /** 参考元素引用（用于手动绑定触发元素） */
  referenceRef: Ref<HTMLElement | null>;
}

// ==================== Tooltip ====================

export interface TooltipProps {
  /**
   * 提示内容
   */
  content?: string;

  /**
   * 弹出位置
   * @default 'top'
   */
  placement?: Placement;

  /**
   * 显示延迟 (ms)
   * @default 100
   */
  showDelay?: number;

  /**
   * 隐藏延迟 (ms)
   * @default 100
   */
  hideDelay?: number;

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 受控的显示状态 (v-model:open)
   */
  open?: boolean;

  /**
   * 箭头大小 (px)
   * @default 6
   */
  arrowSize?: number;

  /**
   * 过渡动画名称
   * @default 'aix-popper-fade'
   */
  transition?: string;

  /**
   * Teleport 目标
   * @default 'body'
   */
  teleportTo?: string | HTMLElement;

  /**
   * 是否禁用 Teleport
   * @default false
   */
  teleportDisabled?: boolean;
}

export interface TooltipEmits {
  (e: 'update:open', value: boolean): void;
  (e: 'show'): void;
  (e: 'hide'): void;
}

export interface TooltipExpose {
  show: () => void;
  hide: () => void;
}

// ==================== Popover ====================

export interface PopoverProps {
  /**
   * 标题
   */
  title?: string;

  /**
   * 触发方式
   * @default 'click'
   */
  trigger?: Extract<TriggerType, 'click' | 'hover' | 'focus' | 'manual'>;

  /**
   * 弹出位置
   * @default 'top'
   */
  placement?: Placement;

  /**
   * 弹出层宽度
   */
  width?: number | string;

  /**
   * 是否显示箭头
   * @default true
   */
  arrow?: boolean;

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 受控的显示状态 (v-model:open)
   */
  open?: boolean;

  /**
   * 偏移距离 (px)
   * @default 12
   */
  offset?: number;

  /**
   * 过渡动画名称
   * @default 'aix-popper-fade'
   */
  transition?: string;

  /**
   * Teleport 目标
   * @default 'body'
   */
  teleportTo?: string | HTMLElement;

  /**
   * 浮动元素的自定义 class
   */
  popperClass?: string | string[] | Record<string, boolean>;

  /**
   * 是否禁用 Teleport
   * @default false
   */
  teleportDisabled?: boolean;

  /**
   * 显示延迟 (ms，hover 模式生效)
   * @default 100
   */
  showDelay?: number;

  /**
   * 隐藏延迟 (ms，hover 模式生效)
   * @default 100
   */
  hideDelay?: number;
}

export interface PopoverEmits {
  (e: 'update:open', value: boolean): void;
  (e: 'show'): void;
  (e: 'hide'): void;
}

export interface PopoverExpose {
  show: () => void;
  hide: () => void;
}

// ==================== Dropdown ====================

export interface DropdownMenuItem {
  /** 命令标识 */
  command: string | number;
  /** 显示文本 */
  label: string;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /**
   * 是否在此项前显示分割线
   * @default false
   */
  divided?: boolean;
}

export interface DropdownProps {
  /**
   * 触发方式
   * @default 'click'
   */
  trigger?: Extract<TriggerType, 'click' | 'hover'>;

  /**
   * 弹出位置
   * @default 'bottom-start'
   */
  placement?: Placement;

  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * 受控的显示状态 (v-model:open)
   */
  open?: boolean;

  /**
   * 选择后是否自动关闭
   * @default true
   */
  hideOnClick?: boolean;

  /**
   * 显示延迟 (ms，hover 模式)
   * @default 150
   */
  showDelay?: number;

  /**
   * 隐藏延迟 (ms，hover 模式)
   * @default 150
   */
  hideDelay?: number;

  /**
   * Teleport 目标
   * @default 'body'
   */
  teleportTo?: string | HTMLElement;

  /**
   * 是否禁用 Teleport
   * @default false
   */
  teleportDisabled?: boolean;

  /**
   * 浮动元素的自定义 class
   */
  popperClass?: string | string[] | Record<string, boolean>;

  /**
   * 菜单项数据 (也可用 slot)
   */
  options?: DropdownMenuItem[];
}

export interface DropdownEmits {
  /** 受控模式状态变更 */
  (e: 'update:open', value: boolean): void;
  /** 菜单项点击时触发 */
  (e: 'command', command: string | number): void;
  /** 显示状态变更时触发 */
  (e: 'visible-change', visible: boolean): void;
}

export interface DropdownExpose {
  show: () => void;
  hide: () => void;
}

// ==================== DropdownItem ====================

export interface DropdownItemProps {
  /** 命令标识 */
  command?: string | number;
  /** 显示文本 */
  label?: string;
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;
  /**
   * 是否在此项前显示分割线
   * @default false
   */
  divided?: boolean;
}

export interface DropdownItemEmits {
  (e: 'click', command: string | number | undefined): void;
}

// ==================== Shared Context ====================

export interface DropdownContext {
  handleItemClick: (command?: string | number) => void;
}

export const DROPDOWN_INJECTION_KEY: InjectionKey<DropdownContext> =
  Symbol('AixDropdown');

// ==================== ContextMenu ====================

export interface ContextMenuProps {
  /**
   * 是否禁用
   * @default false
   */
  disabled?: boolean;

  /**
   * Teleport 目标
   * @default 'body'
   */
  teleportTo?: string | HTMLElement;

  /**
   * 是否禁用 Teleport
   * @default false
   */
  teleportDisabled?: boolean;

  /**
   * 浮动元素的自定义 class
   */
  popperClass?: string | string[] | Record<string, boolean>;
}

export interface ContextMenuEmits {
  /** 菜单项点击时触发 */
  (e: 'command', command: string | number): void;
  /** 显示状态变更时触发 */
  (e: 'visible-change', visible: boolean): void;
}

export interface ContextMenuExpose {
  show: (event: MouseEvent) => void;
  hide: () => void;
}
