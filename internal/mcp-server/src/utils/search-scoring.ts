/**
 * 搜索评分工具
 */

import type { ComponentInfo } from '../types/index';

/**
 * 搜索匹配权重配置
 */
export const SEARCH_SCORE_WEIGHTS = {
  // 组件搜索权重
  COMPONENT_NAME_MATCH: 100,
  PACKAGE_NAME_MATCH: 80,
  DESCRIPTION_MATCH: 60,
  CATEGORY_MATCH: 40,
  TAG_MATCH: 30,
  PROP_NAME_MATCH: 20,
  PROP_DESCRIPTION_MATCH: 10,

  // 图标搜索权重
  ICON_NAME_EXACT_MATCH: 100,
  ICON_NAME_PARTIAL_MATCH: 50,
  ICON_CATEGORY_MATCH: 30,
  ICON_DESCRIPTION_MATCH: 20,
  ICON_TAG_MATCH: 15,
  ICON_KEYWORD_MATCH: 10,
};

/**
 * 计算组件搜索匹配分数
 */
export function calculateComponentSearchScore(
  component: ComponentInfo,
  query: string,
): number {
  let score = 0;
  const queryLower = query.toLowerCase();

  // 名称匹配（最高分）
  if (component.name.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.COMPONENT_NAME_MATCH;
  }

  // 包名匹配
  if (component.packageName.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.PACKAGE_NAME_MATCH;
  }

  // 描述匹配
  if (component.description.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.DESCRIPTION_MATCH;
  }

  // 分类匹配
  if (component.category.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.CATEGORY_MATCH;
  }

  // 标签匹配
  if (component.tags && Array.isArray(component.tags)) {
    for (const tag of component.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += SEARCH_SCORE_WEIGHTS.TAG_MATCH;
      }
    }
  }

  // Props 匹配
  if (component.props && Array.isArray(component.props)) {
    for (const prop of component.props) {
      if (prop.name.toLowerCase().includes(queryLower)) {
        score += SEARCH_SCORE_WEIGHTS.PROP_NAME_MATCH;
      }
      if (prop.description?.toLowerCase().includes(queryLower)) {
        score += SEARCH_SCORE_WEIGHTS.PROP_DESCRIPTION_MATCH;
      }
    }
  }

  return score;
}

/**
 * 计算图标搜索匹配分数
 */
export function calculateIconSearchScore(icon: any, query: string): number {
  let score = 0;
  const queryLower = query.toLowerCase();

  // 名称完全匹配
  if (icon.name.toLowerCase() === queryLower) {
    score += SEARCH_SCORE_WEIGHTS.ICON_NAME_EXACT_MATCH;
  } else if (icon.name.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.ICON_NAME_PARTIAL_MATCH;
  }

  // 图标分类匹配
  if (
    icon.iconCategory &&
    icon.iconCategory.toLowerCase().includes(queryLower)
  ) {
    score += SEARCH_SCORE_WEIGHTS.ICON_CATEGORY_MATCH;
  }

  // 描述匹配
  if (icon.description && icon.description.toLowerCase().includes(queryLower)) {
    score += SEARCH_SCORE_WEIGHTS.ICON_DESCRIPTION_MATCH;
  }

  // 标签匹配
  if (icon.tags && Array.isArray(icon.tags)) {
    for (const tag of icon.tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += SEARCH_SCORE_WEIGHTS.ICON_TAG_MATCH;
      }
    }
  }

  // 关键词匹配
  if (icon.keywords && Array.isArray(icon.keywords)) {
    for (const keyword of icon.keywords) {
      if (keyword.toLowerCase().includes(queryLower)) {
        score += SEARCH_SCORE_WEIGHTS.ICON_KEYWORD_MATCH;
      }
    }
  }

  return score;
}

/**
 * 获取组件匹配的字段列表
 */
export function getComponentMatchedFields(
  component: ComponentInfo,
  query: string,
): string[] {
  const fields: string[] = [];
  const queryLower = query.toLowerCase();

  if (component.name.toLowerCase().includes(queryLower)) {
    fields.push('name');
  }
  if (component.packageName.toLowerCase().includes(queryLower)) {
    fields.push('packageName');
  }
  if (component.description.toLowerCase().includes(queryLower)) {
    fields.push('description');
  }
  if (component.category.toLowerCase().includes(queryLower)) {
    fields.push('category');
  }
  if (
    component.tags &&
    component.tags.some((tag) => tag.toLowerCase().includes(queryLower))
  ) {
    fields.push('tags');
  }

  return fields;
}

/**
 * 获取图标匹配的字段列表
 */
export function getIconMatchedFields(icon: any, query: string): string[] {
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
    icon.tags.some((tag: string) => tag.toLowerCase().includes(queryLower))
  ) {
    fields.push('tags');
  }
  if (
    icon.keywords &&
    icon.keywords.some((keyword: string) =>
      keyword.toLowerCase().includes(queryLower),
    )
  ) {
    fields.push('keywords');
  }

  return fields;
}
