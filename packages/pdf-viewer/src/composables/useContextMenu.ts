/**
 * useContextMenu - 右键菜单
 * @description 管理 PDF 查看器的右键菜单上下文和菜单项
 * 定位、click-outside、ESC 关闭由 @aix/popper ContextMenu 组件处理
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
  /** 当前上下文 */
  context: Ref<ContextMenuContext | null>;
  /** 当前菜单项 */
  menuItems: ComputedRef<ContextMenuItem[]>;
  /** 更新上下文（在 show 之前调用） */
  updateContext: (event: MouseEvent) => boolean;
  /** 处理菜单项点击（通过 command 匹配） */
  handleCommand: (command: string | number) => void;
}

/**
 * 右键菜单 Composable
 */
export function useContextMenu(options: UseContextMenuOptions = {}): UseContextMenuReturn {
  /** 获取合并后的配置 */
  function getMergedConfig(): ContextMenuConfig {
    return {
      ...DEFAULT_CONTEXT_MENU_CONFIG,
      ...options.config?.(),
    };
  }

  const context = ref<ContextMenuContext | null>(null);

  /**
   * 判断菜单类型
   */
  function getMenuType(selectedText: string, selectedImages: PdfImageInfo[]): ContextMenuType {
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
   * 更新上下文（在 Popper ContextMenu show 之前调用）
   * @returns true 表示应该显示菜单，false 表示不应显示
   */
  function updateContext(event: MouseEvent): boolean {
    if (!getMergedConfig().enabled) return false;

    const selectedText = options.getSelectedText?.() ?? '';
    const selectedImages = options.getSelectedImages?.() ?? [];
    const currentPage = options.getCurrentPage?.() ?? 1;
    const menuType = getMenuType(selectedText, selectedImages);

    // 如果是空白区域且没有配置空白菜单，不阻止浏览器默认右键菜单
    const config = getMergedConfig();
    if (menuType === 'empty' && (!config.emptyMenuItems || config.emptyMenuItems.length === 0)) {
      return false;
    }

    // 确定要显示自定义菜单后再阻止浏览器默认行为
    event.preventDefault();

    context.value = {
      type: menuType,
      selectedText,
      selectedImages,
      pageNumber: currentPage,
      position: { x: event.clientX, y: event.clientY },
    };

    return true;
  }

  /**
   * 通过 command 处理菜单项点击
   */
  function handleCommand(command: string | number): void {
    const item = menuItems.value.find((i) => i.id === command);
    if (!item || item.disabled || item.divider) return;

    if (context.value) {
      options.onMenuClick?.(item, context.value);
    }
  }

  return {
    context,
    menuItems,
    updateContext,
    handleCommand,
  };
}
