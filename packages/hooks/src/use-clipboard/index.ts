import { ref, type Ref } from 'vue';
import { useTimeout } from '../use-timeout';

/**
 * 复制文本到剪贴板，带降级兜底（纯函数，无响应式状态）。
 *
 * 优先用异步 Clipboard API（`navigator.clipboard.writeText`），但它有两个硬性限制：
 * 1. **仅安全上下文**：HTTPS / localhost 才有 `navigator.clipboard`，普通 HTTP（内网部署常见）下为 undefined；
 * 2. **旧浏览器**不支持。
 * 故不可用或写入失败（权限被拒 / 非聚焦）时，降级到 `document.execCommand('copy')`
 * （已废弃但仍是 HTTP / 旧环境的事实标准；需在用户手势的同步调用栈内触发）。
 *
 * @returns 是否复制成功（两条路径都失败返回 false）
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 权限被拒 / 非聚焦 / 非安全上下文等：继续尝试 execCommand 兜底
    }
  }
  return legacyCopy(text);
}

/** document.execCommand('copy') 兜底：离屏 textarea 选中后执行复制 */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const ta = document.createElement('textarea');
  ta.value = text;
  // 离屏但可选中：固定定位 + 近乎不可见，避免滚动跳动与闪烁
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.width = '1px';
  ta.style.height = '1px';
  ta.style.padding = '0';
  ta.style.border = 'none';
  ta.style.opacity = '0';
  ta.setAttribute('readonly', '');
  document.body.appendChild(ta);
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(ta);
  }
}

export interface UseClipboardOptions {
  /** copied 状态自动回落 false 的毫秒数，默认 1500；设为 0 则不自动重置 */
  copiedDuration?: number;
}

export interface UseClipboardReturn {
  /** 最近一次复制是否成功；copiedDuration 后自动回落 false */
  copied: Readonly<Ref<boolean>>;
  /** 复制文本，返回是否成功 */
  copy: (text: string) => Promise<boolean>;
}

/**
 * 剪贴板复制 hook：复制 + 兜底 + copied 反馈态（自动重置）
 *
 * 在 copyText 之上叠加「复制成功 → copied=true → copiedDuration 后自动回落」的反馈态，
 * 省去各组件手写 `setTimeout(() => copied = false, 1500)`。
 *
 * @example
 * ```ts
 * const { copy, copied } = useClipboard();
 * await copy('hello'); // copied 短暂置 true，用于「已复制」气泡反馈
 * ```
 */
export function useClipboard(options: UseClipboardOptions = {}): UseClipboardReturn {
  const { copiedDuration = 1500 } = options;
  const copied = ref(false);

  // 复用 useTimeout 做自动重置：start 具 restart 语义，连续复制会重新计时；scope 销毁自动清理
  const { start } = useTimeout(() => {
    copied.value = false;
  }, copiedDuration);

  async function copy(text: string): Promise<boolean> {
    const ok = await copyText(text);
    if (ok) {
      copied.value = true;
      if (copiedDuration > 0) start();
    }
    return ok;
  }

  return { copied, copy };
}
