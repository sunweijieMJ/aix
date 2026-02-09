/**
 * useTextSelection - 文字选择增强
 * @description 提供文字选择相关的功能
 */
import { ref } from 'vue';

export interface UseTextSelectionOptions {
  /** 文字选择变化回调 */
  onSelectionChange?: (text: string) => void;
}

export interface UseTextSelectionReturn {
  /** 当前选中的文字 */
  selectedText: ReturnType<typeof ref<string>>;
  /** 获取 TextLayer 中选中的文字 */
  getSelectedText: (textLayerContainer?: HTMLElement | null) => string;
  /** 清除选择 */
  clearSelection: () => void;
  /** 复制选中文字到剪贴板 */
  copyToClipboard: () => Promise<boolean>;
}

/**
 * 文字选择 Composable
 */
export function useTextSelection(
  options: UseTextSelectionOptions = {},
): UseTextSelectionReturn {
  const selectedText = ref('');

  /**
   * 获取 TextLayer 中选中的文字
   */
  function getSelectedText(textLayerContainer?: HTMLElement | null): string {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      selectedText.value = '';
      return '';
    }

    // 如果提供了 textLayerContainer，检查选区是否在其中
    if (textLayerContainer) {
      const range = selection.getRangeAt(0);
      if (!textLayerContainer.contains(range.commonAncestorContainer)) {
        selectedText.value = '';
        return '';
      }
    }

    const text = selection.toString().trim();
    selectedText.value = text;
    options.onSelectionChange?.(text);
    return text;
  }

  /**
   * 清除选择
   */
  function clearSelection(): void {
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
    selectedText.value = '';
  }

  /**
   * 复制选中文字到剪贴板
   */
  async function copyToClipboard(): Promise<boolean> {
    const text = selectedText.value;
    if (!text) return false;

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 降级方案
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        return true;
      } catch {
        return false;
      }
    }
  }

  return {
    selectedText,
    getSelectedText,
    clearSelection,
    copyToClipboard,
  };
}
