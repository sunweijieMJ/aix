// 复制到镜像 div 的关键样式：影响文本排版与盒尺寸的属性（rc-mentions / textarea-caret-position 同思路）
const MIRROR_PROPS = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'letterSpacing',
  'lineHeight',
  'textTransform',
  'wordSpacing',
  'textIndent',
] as const;

/**
 * 计算 textarea 中指定下标字符处的**视口坐标** rect（镜像 measure div 法）：
 * 复制 textarea 排版样式到隐藏 div，填入 index 前文本 + 标记 span，
 * 读标记相对镜像的偏移后映射回 textarea 视口位置（扣除 scrollTop/scrollLeft）。
 * 测量失败（jsdom 零尺寸 / 异常）返回 null，调用方降级整框定位。
 */
export function getCaretRect(textarea: HTMLTextAreaElement, index: number): DOMRect | null {
  try {
    const style = window.getComputedStyle(textarea);
    const mirror = document.createElement('div');
    for (const p of MIRROR_PROPS) {
      mirror.style[p as 'width'] = style[p as 'width'];
    }
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.top = '0';
    mirror.style.left = '-9999px';
    // 对齐 textarea 换行行为：保留空白并强制断行
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordBreak = 'break-word';
    mirror.textContent = textarea.value.slice(0, index);
    const marker = document.createElement('span');
    // 标记字符：取 index 处字符占位；越界/行尾用零宽空格保证 span 有 rect
    // （必须写显式转义 \u200b，源码里的不可见字面量易在编辑/格式化中丢失）
    marker.textContent = textarea.value.charAt(index) || '\u200b';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    let markerRect: DOMRect;
    let mirrorRect: DOMRect;
    try {
      markerRect = marker.getBoundingClientRect();
      mirrorRect = mirror.getBoundingClientRect();
    } finally {
      // 测量段之后必须移除镜像节点，即便中途测量抛异常也不留残留（外层 catch 兜底其余异常路径）
      document.body.removeChild(mirror);
    }
    if (markerRect.width === 0 && markerRect.height === 0) return null; // jsdom / 测量失败
    const taRect = textarea.getBoundingClientRect();
    const top = taRect.top + (markerRect.top - mirrorRect.top) - textarea.scrollTop;
    const left = taRect.left + (markerRect.left - mirrorRect.left) - textarea.scrollLeft;
    return new DOMRect(left, top, Math.max(markerRect.width, 1), markerRect.height);
  } catch {
    return null;
  }
}
