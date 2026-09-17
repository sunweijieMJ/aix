import type { MenuIconSource } from '../types';

/** 图标来源的渲染方式 */
export type MenuIconKind = 'component' | 'url' | 'class';

/** 字符串图标里出现路径分隔符或 data 协议即视为图片地址，字体图标类名不会含这两者 */
export function resolveMenuIconKind(icon: MenuIconSource): MenuIconKind {
  if (typeof icon !== 'string') return 'component';
  return icon.includes('/') || icon.startsWith('data:') ? 'url' : 'class';
}
