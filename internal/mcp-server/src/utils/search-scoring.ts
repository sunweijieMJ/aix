/**
 * 搜索评分工具
 *
 * 组件搜索评分由 SearchIndex (search-index.ts) 统一处理，
 * 此文件仅保留图标搜索评分逻辑。
 */

import type { IconIndexItem } from '../types/index';

/**
 * 图标搜索匹配权重配置
 */
export const ICON_SEARCH_WEIGHTS = {
  NAME_EXACT_MATCH: 100,
  NAME_PARTIAL_MATCH: 50,
  CATEGORY_MATCH: 30,
  DESCRIPTION_MATCH: 20,
  TAG_MATCH: 15,
  KEYWORD_MATCH: 10,
};

/**
 * 计算图标搜索匹配分数
 */
export function calculateIconSearchScore(
  icon: IconIndexItem,
  query: string,
): number {
  let score = 0;
  const queryLower = query.toLowerCase();

  // 名称完全匹配
  if (icon.name.toLowerCase() === queryLower) {
    score += ICON_SEARCH_WEIGHTS.NAME_EXACT_MATCH;
  } else if (icon.name.toLowerCase().includes(queryLower)) {
    score += ICON_SEARCH_WEIGHTS.NAME_PARTIAL_MATCH;
  }

  // 图标分类匹配
  if (
    icon.iconCategory &&
    icon.iconCategory.toLowerCase().includes(queryLower)
  ) {
    score += ICON_SEARCH_WEIGHTS.CATEGORY_MATCH;
  }

  // 描述匹配
  if (icon.description && icon.description.toLowerCase().includes(queryLower)) {
    score += ICON_SEARCH_WEIGHTS.DESCRIPTION_MATCH;
  }

  // 标签匹配
  if (icon.tags && Array.isArray(icon.tags)) {
    for (const tag of icon.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += ICON_SEARCH_WEIGHTS.TAG_MATCH;
      }
    }
  }

  // 关键词匹配
  if (icon.keywords && Array.isArray(icon.keywords)) {
    for (const keyword of icon.keywords) {
      if (keyword.toLowerCase().includes(queryLower)) {
        score += ICON_SEARCH_WEIGHTS.KEYWORD_MATCH;
      }
    }
  }

  return score;
}

/**
 * 获取图标匹配的字段列表
 */
export function getIconMatchedFields(
  icon: IconIndexItem,
  query: string,
): string[] {
  const fields: string[] = [];
  const queryLower = query.toLowerCase();

  if (icon.name && icon.name.toLowerCase().includes(queryLower)) {
    fields.push('name');
  }
  if (icon.description && icon.description.toLowerCase().includes(queryLower)) {
    fields.push('description');
  }
  if (
    icon.iconCategory &&
    icon.iconCategory.toLowerCase().includes(queryLower)
  ) {
    fields.push('iconCategory');
  }
  if (
    icon.tags &&
    icon.tags.some((tag) => tag.toLowerCase().includes(queryLower))
  ) {
    fields.push('tags');
  }
  if (
    icon.keywords &&
    icon.keywords.some((keyword) => keyword.toLowerCase().includes(queryLower))
  ) {
    fields.push('keywords');
  }

  return fields;
}
