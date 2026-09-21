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
 * 拆分查询词
 *
 * 图标检索此前把整串 query 当一个 substring 匹配，"用户 头像"、"user account"
 * 这类很自然的多词查询一律 0 命中。这里只按空白和常见分隔符切词，
 * 不像组件检索那样再把中文拆成单字——"用"这种单字会把噪声全捞上来。
 */
function tokenizeQuery(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,，、/]+/)
        .filter(Boolean),
    ),
  ];
}

/**
 * 单个词的匹配分数
 */
function scoreTerm(icon: IconIndexItem, term: string): number {
  let score = 0;

  // 名称完全匹配
  if (icon.name.toLowerCase() === term) {
    score += ICON_SEARCH_WEIGHTS.NAME_EXACT_MATCH;
  } else if (icon.name.toLowerCase().includes(term)) {
    score += ICON_SEARCH_WEIGHTS.NAME_PARTIAL_MATCH;
  }

  // 图标分类匹配
  if (icon.iconCategory && icon.iconCategory.toLowerCase().includes(term)) {
    score += ICON_SEARCH_WEIGHTS.CATEGORY_MATCH;
  }

  // 描述匹配
  if (icon.description && icon.description.toLowerCase().includes(term)) {
    score += ICON_SEARCH_WEIGHTS.DESCRIPTION_MATCH;
  }

  // 标签匹配
  if (icon.tags && Array.isArray(icon.tags)) {
    for (const tag of icon.tags) {
      if (tag.toLowerCase().includes(term)) {
        score += ICON_SEARCH_WEIGHTS.TAG_MATCH;
      }
    }
  }

  // 关键词匹配
  if (icon.keywords && Array.isArray(icon.keywords)) {
    for (const keyword of icon.keywords) {
      if (keyword.toLowerCase().includes(term)) {
        score += ICON_SEARCH_WEIGHTS.KEYWORD_MATCH;
      }
    }
  }

  return score;
}

/**
 * 计算图标搜索匹配分数
 *
 * 多词按 OR 累加：命中词越多分越高，与组件检索（SearchIndex）的口径一致。
 */
export function calculateIconSearchScore(icon: IconIndexItem, query: string): number {
  return tokenizeQuery(query).reduce((sum, term) => sum + scoreTerm(icon, term), 0);
}

/**
 * 是否命中查询里的每一个词
 *
 * 纯 OR 累加的问题是只沾一个词的图标也会进结果：580 个图标里搜 "arrow up"
 * 能捞出 35 个，真正两个词都命中的只有 4 个，total 全是噪声。
 * 调用方据此做「全词优先、没有再退回 OR」。
 */
export function matchesAllIconTerms(icon: IconIndexItem, query: string): boolean {
  const terms = tokenizeQuery(query);
  return terms.length > 0 && terms.every((term) => scoreTerm(icon, term) > 0);
}

/**
 * 获取图标匹配的字段列表
 */
export function getIconMatchedFields(icon: IconIndexItem, query: string): string[] {
  const fields = new Set<string>();

  for (const term of tokenizeQuery(query)) {
    if (icon.name && icon.name.toLowerCase().includes(term)) {
      fields.add('name');
    }
    if (icon.description && icon.description.toLowerCase().includes(term)) {
      fields.add('description');
    }
    if (icon.iconCategory && icon.iconCategory.toLowerCase().includes(term)) {
      fields.add('iconCategory');
    }
    if (icon.tags && icon.tags.some((tag) => tag.toLowerCase().includes(term))) {
      fields.add('tags');
    }
    if (icon.keywords && icon.keywords.some((keyword) => keyword.toLowerCase().includes(term))) {
      fields.add('keywords');
    }
  }

  return [...fields];
}
