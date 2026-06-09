/**
 * 复制文本到剪贴板，带降级兜底。
 *
 * 优先用异步 Clipboard API（`navigator.clipboard.writeText`），但它有两个硬性限制：
 * 1. **仅安全上下文**：HTTPS / localhost 才有 `navigator.clipboard`，普通 HTTP（内网部署常见）下为 undefined；
 * 2. **旧浏览器**不支持。
 * 故不可用或写入失败（权限被拒 / 非聚焦）时，降级到 `document.execCommand('copy')`
 * （已废弃但仍是 HTTP / 旧环境的事实标准；需在用户手势的同步调用栈内触发）。
 *
 * @returns 是否复制成功（两条路径都失败返回 false，调用方据此决定是否给反馈）
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
