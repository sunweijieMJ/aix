/**
 * @fileoverview 渲染器相关工具函数
 */

import type { ContentType, RendererDefinition } from '../core/types';

/**
 * 从渲染器定义中获取主要类型
 * 如果 type 是数组，返回第一个；否则直接返回
 *
 * @param renderer 渲染器定义
 * @param defaultType 默认类型，当无法获取时使用
 * @returns 内容类型
 */
export function getRendererPrimaryType(
  renderer: RendererDefinition | undefined | null,
  defaultType: ContentType = 'text',
): ContentType {
  if (!renderer) {
    return defaultType;
  }

  const { type } = renderer;
  if (Array.isArray(type)) {
    return type[0] ?? defaultType;
  }

  return type ?? defaultType;
}

/**
 * 从渲染器定义中获取所有支持的类型
 *
 * @param renderer 渲染器定义
 * @returns 类型数组
 */
export function getRendererTypes(
  renderer: RendererDefinition | undefined | null,
): ContentType[] {
  if (!renderer) {
    return [];
  }

  const { type } = renderer;
  return Array.isArray(type) ? type : [type];
}

/**
 * 检查渲染器是否支持指定类型
 *
 * @param renderer 渲染器定义
 * @param targetType 目标类型
 * @returns 是否支持
 */
export function rendererSupportsType(
  renderer: RendererDefinition | undefined | null,
  targetType: ContentType,
): boolean {
  if (!renderer) {
    return false;
  }

  const types = getRendererTypes(renderer);
  return types.includes(targetType);
}
