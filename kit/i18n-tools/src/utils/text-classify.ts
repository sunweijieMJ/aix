/**
 * 框架无关的「这段文本值不值得翻译」判定。
 *
 * 与提取器分离：判据只看字符串本身（URL / 版本号 / CSS 值 / 组件库枚举值），
 * 与 Vue 模板节点或 JSX 节点毫无关系。此前只长在 VueTextExtractor 上，React 端
 * 因而没有这道闸——`<p>18px</p>`、`<p>https://a.com</p>` 会被当成用户可见文案
 * 提取成 key 送去 LLM 翻译。收口到这里供两端共用。
 */

/**
 * 是否是不需要翻译的技术文本（URL、邮箱、版本号、CSS 值、纯符号等）。
 *
 * 调用方必须先放行含中文的字符串——本判定不看中文，`https://例子.com` 这类
 * 混合串应由上游的「含中文即提取」规则先命中。
 */
export function isNonTranslatableText(str: string): boolean {
  const trimmed = str.trim();

  // URL
  if (/^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed)) return true;

  // Email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;

  // 版本号: v1.2.3, 1.0.0, 1.0.0-beta.1
  if (/^v?\d+(\.\d+)+(-[\w.]+)?$/.test(trimmed)) return true;

  // CSS 数值: 10px, 1.5rem, 100%, 0.5em
  if (/^\d+(\.\d+)?(px|em|rem|vh|vw|vmin|vmax|%|pt|cm|mm|in|ch|ex)$/i.test(trimmed)) return true;

  // CSS 颜色: #fff, #ffffff, #ffffffaa
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;

  // CSS 函数: rgb(), rgba(), hsl(), var()
  if (/^(rgb|rgba|hsl|hsla|var)\s*\(/.test(trimmed)) return true;

  // 文件路径: ./foo, ../bar, /path
  if (/^\.{0,2}\/\S+$/.test(trimmed)) return true;

  // 纯符号 / 标点：不含任何字母或数字（兜底）。
  // 例如 → ← × ✓ ··· 这类字符没有翻译意义，但它们既不是 URL 也不是 CSS。
  // 必须放在最后做兜底，确保前面已识别的特定模式不会被这条规则覆盖。
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return true;

  return false;
}

/** 组件库（Element Plus 等）的配置枚举值，出现在属性值里时不是可见文案。 */
const TECHNICAL_CONFIG_VALUES = new Set([
  // Element Plus type 属性值
  'primary',
  'success',
  'warning',
  'danger',
  'info',
  'text',
  'error',
  // Element Plus size 属性值
  'large',
  'default',
  'small',
  'mini',
  // 位置相关
  'top',
  'bottom',
  'left',
  'right',
  'center',
  'top-start',
  'top-end',
  'bottom-start',
  'bottom-end',
  'left-start',
  'left-end',
  'right-start',
  'right-end',
  // 主题和效果
  'dark',
  'light',
  'plain',
  // 其他常见配置值
  'always',
  'hover',
  'never',
  'click',
  'focus',
  'manual',
  'horizontal',
  'vertical',
  'card',
  'border-card',
  // 布尔值字符串形式（虽然通常用 boolean，但有时会用字符串）
  'true',
  'false',
]);

/**
 * 是否是组件库配置值（不需要国际化）。
 *
 * 只对属性值一类的上下文使用：文本节点里的 "default" / "small" 完全可能是真文案，
 * 调用方须先短路放行文本节点（见 VueTextExtractor.shouldExtractInternal 的次序）。
 */
export function isTechnicalConfigValue(str: string): boolean {
  return TECHNICAL_CONFIG_VALUES.has(str.toLowerCase());
}
