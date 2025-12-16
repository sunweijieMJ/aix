/**
 * @fileoverview HTML 净化工具
 * 防止 XSS 攻击
 */

import DOMPurify from 'dompurify';
import type { Config as DOMPurifyConfig } from 'dompurify';

/**
 * 默认 DOMPurify 配置
 */
const defaultConfig: DOMPurifyConfig = {
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'img',
    'strong',
    'em',
    'del',
    's',
    'u',
    'mark',
    'span',
    'div',
    'sup',
    'sub',
    'input', // 用于 checkbox
  ],
  ALLOWED_ATTR: [
    'href',
    'src',
    'alt',
    'title',
    'target',
    'rel',
    'class',
    'id',
    'style',
    'type',
    'checked',
    'disabled', // 用于 checkbox
    'width',
    'height',
    'colspan',
    'rowspan',
  ],
  ALLOW_DATA_ATTR: false,
};

/**
 * 净化 HTML 内容
 */
export function sanitizeHtml(html: string, config?: DOMPurifyConfig): string {
  const mergedConfig = { ...defaultConfig, ...config };
  return DOMPurify.sanitize(html, mergedConfig);
}
