/**
 * useContextMenu - 右键菜单
 * @description 管理 PDF 查看器的右键菜单
 */
import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { DEFAULT_CONTEXT_MENU_CONFIG } from '../constants';
import type {
  ContextMenuConfig,
  ContextMenuItem,
  ContextMenuContext,
  ContextMenuType,
  PdfImageInfo,
} from '../types';

export interface UseContextMenuOptions {
  /** 配置 getter (支持响应式) */
  config?: () => Partial<ContextMenuConfig>;
  /** 获取选中文字的函数 */
  getSelectedText?: () => string;
  /** 获取选中图片的函数 */
  getSelectedImages?: () => PdfImageInfo[];
  /** 获取当前页码的函数 */
  getCurrentPage?: () => number;
  /** 菜单项点击回调 */
  onMenuClick?: (item: ContextMenuItem, context: ContextMenuContext) => void;
}

export interface UseContextMenuReturn {
  /** 是否显示 */
  visible: Ref<boolean>;
  /** 菜单位置 */
  position: Ref<{ x: number; y: number }>;
  /** 当前上下文 */
  context: Ref<ContextMenuContext | null>;
  /** 当前菜单项 */
  menuItems: ComputedRef<ContextMenuItem[]>;
  /** 显示菜单 */
  show: (event: MouseEvent) => void;
  /** 隐藏菜单 */
  hide: () => void;
  /** 处理菜单项点击 */
  handleMenuClick: (item: ContextMenuItem) => void;
}

/**
 * 右键菜单 Composable
 */
export function useContextMenu(
  options: UseContextMenuOptions = {},
): UseContextMenuReturn {
  /** 获取合并后的配置 */
  function getMergedConfig(): ContextMenuConfig {
    return {
      ...DEFAULT_CONTEXT_MENU_CONFIG,
      ...options.config?.(),
    };
  }

  const visible = ref(false);
  const position = ref({ x: 0, y: 0 });
  const context = ref<ContextMenuContext | null>(null);

  /**
   * 判断菜单类型
   */
  function getMenuType(
    selectedText: string,
    selectedImages: PdfImageInfo[],
  ): ContextMenuType {
    const hasText = selectedText.length > 0;
    const hasImages = selectedImages.length > 0;

    if (hasText && hasImages) return 'mixed';
    if (hasText) return 'text';
    if (hasImages) return 'image';
    return 'empty';
  }

  /**
   * 当前菜单项
   */
  const menuItems = computed<ContextMenuItem[]>(() => {
    if (!context.value) return [];

    switch (context.value.type) {
      case 'text':
        return getMergedConfig().textMenuItems ?? [];
      case 'image':
        return getMergedConfig().imageMenuItems ?? [];
      case 'mixed':
        return getMergedConfig().mixedMenuItems ?? [];
      case 'empty':
        return getMergedConfig().emptyMenuItems ?? [];
      default:
        return [];
    }
  });

  /**
   * 显示菜单
   */
  function show(event: MouseEvent): void {
    if (!getMergedConfig().enabled) return;

    event.preventDefault();

    const selectedText = options.getSelectedText?.() ?? '';
    const selectedImages = options.getSelectedImages?.() ?? [];
    const currentPage = options.getCurrentPage?.() ?? 1;
    const menuType = getMenuType(selectedText, selectedImages);

    // 如果是空白区域且没有配置空白菜单，不显示
    const config = getMergedConfig();
    if (
      menuType === 'empty' &&
      (!config.emptyMenuItems || config.emptyMenuItems.length === 0)
    ) {
      return;
    }

    context.value = {
      type: menuType,
      selectedText,
      selectedImages,
      pageNumber: currentPage,
      position: { x: event.clientX, y: event.clientY },
    };

    position.value = { x: event.clientX, y: event.clientY };
    visible.value = true;
  }

  /**
   * 隐藏菜单
   */
  function hide(): void {
    visible.value = false;
  }

  /**
   * 处理菜单项点击
   */
  function handleMenuClick(item: ContextMenuItem): void {
    if (item.disabled || item.divider) return;

    if (context.value) {
      options.onMenuClick?.(item, context.value);
    }

    hide();
  }

  return {
    visible,
    position,
    context,
    menuItems,
    show,
    hide,
    handleMenuClick,
  };
}
