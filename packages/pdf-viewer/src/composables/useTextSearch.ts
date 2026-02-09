/**
 * useTextSearch - PDF 文本搜索
 * @description 在 PDF 文档中搜索文本，支持高亮显示和导航
 */
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { ref, computed, type Ref, type ComputedRef } from 'vue';

/** 搜索匹配结果 */
export interface SearchMatch {
  /** 页码 */
  pageNumber: number;
  /** 匹配索引 (页内) */
  matchIndex: number;
  /** 匹配文本 */
  text: string;
}

/** 页面文本缓存 */
interface PageTextCache {
  pageNumber: number;
  text: string;
  /** 匹配位置数组 [startIndex, endIndex][] */
  matches: [number, number][];
}

export interface UseTextSearchOptions {
  /** 搜索变化回调 */
  onSearchChange?: (keyword: string, total: number) => void;
  /** 当前匹配变化回调 */
  onMatchChange?: (current: number, match: SearchMatch | null) => void;
}

export interface UseTextSearchReturn {
  /** 搜索关键词 */
  keyword: Ref<string>;
  /** 是否正在搜索 */
  searching: Ref<boolean>;
  /** 搜索结果总数 */
  totalMatches: ComputedRef<number>;
  /** 当前匹配索引 (1-based) */
  currentMatchIndex: Ref<number>;
  /** 当前匹配信息 */
  currentMatch: ComputedRef<SearchMatch | null>;
  /** 所有匹配结果 */
  matches: Ref<SearchMatch[]>;
  /** 执行搜索 */
  search: (pdf: PDFDocumentProxy, keyword: string) => Promise<void>;
  /** 下一个匹配 */
  nextMatch: () => SearchMatch | null;
  /** 上一个匹配 */
  prevMatch: () => SearchMatch | null;
  /** 跳转到指定匹配 */
  gotoMatch: (index: number) => SearchMatch | null;
  /** 清除搜索 */
  clearSearch: () => void;
  /** 高亮指定页面的匹配项 */
  highlightMatches: (container: HTMLElement, pageNumber: number) => void;
  /** 清除高亮 */
  clearHighlights: (container: HTMLElement) => void;
}

/** 搜索并行批大小 */
const SEARCH_BATCH_SIZE = 10;

/**
 * 文本搜索 Composable
 */
export function useTextSearch(
  options: UseTextSearchOptions = {},
): UseTextSearchReturn {
  const keyword = ref('');
  const searching = ref(false);
  const matches = ref<SearchMatch[]>([]);
  const currentMatchIndex = ref(0);
  const pageTextCache = ref<Map<number, PageTextCache>>(new Map());

  // 用于取消过期的搜索操作
  let currentSearchId = 0;

  const totalMatches = computed(() => matches.value.length);

  const currentMatch = computed<SearchMatch | null>(() => {
    if (
      currentMatchIndex.value < 1 ||
      currentMatchIndex.value > matches.value.length
    ) {
      return null;
    }
    return matches.value[currentMatchIndex.value - 1] ?? null;
  });

  /**
   * 搜索单个页面的文本内容
   */
  async function searchPage(
    pdf: PDFDocumentProxy,
    pageNum: number,
    lowerKeyword: string,
    keywordLength: number,
  ): Promise<{
    pageNum: number;
    pageText: string;
    pageMatches: [number, number][];
    searchMatches: SearchMatch[];
  }> {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .join('');

    const lowerText = pageText.toLowerCase();
    const pageMatches: [number, number][] = [];
    const searchMatches: SearchMatch[] = [];

    let searchIndex = 0;
    let matchIndexInPage = 0;

    while (true) {
      const foundIndex = lowerText.indexOf(lowerKeyword, searchIndex);
      if (foundIndex === -1) break;

      pageMatches.push([foundIndex, foundIndex + keywordLength]);
      searchMatches.push({
        pageNumber: pageNum,
        matchIndex: matchIndexInPage,
        text: pageText.substring(foundIndex, foundIndex + keywordLength),
      });

      searchIndex = foundIndex + 1;
      matchIndexInPage++;
    }

    return { pageNum, pageText, pageMatches, searchMatches };
  }

  /**
   * 执行搜索（按批并行处理页面）
   */
  async function search(
    pdf: PDFDocumentProxy,
    searchKeyword: string,
  ): Promise<void> {
    const trimmedKeyword = searchKeyword.trim();

    // 取消之前的搜索
    const searchId = ++currentSearchId;

    // 清空之前的结果
    matches.value = [];
    currentMatchIndex.value = 0;
    pageTextCache.value.clear();

    if (!trimmedKeyword) {
      keyword.value = '';
      options.onSearchChange?.('', 0);
      return;
    }

    keyword.value = trimmedKeyword;
    searching.value = true;

    try {
      const lowerKeyword = trimmedKeyword.toLowerCase();
      const allMatches: SearchMatch[] = [];

      // 按批并行处理页面（每批 SEARCH_BATCH_SIZE 页）
      for (
        let batchStart = 1;
        batchStart <= pdf.numPages;
        batchStart += SEARCH_BATCH_SIZE
      ) {
        // 批间检查取消
        if (searchId !== currentSearchId) return;

        const batchEnd = Math.min(
          batchStart + SEARCH_BATCH_SIZE - 1,
          pdf.numPages,
        );
        const batchPromises: ReturnType<typeof searchPage>[] = [];

        for (let pageNum = batchStart; pageNum <= batchEnd; pageNum++) {
          batchPromises.push(
            searchPage(pdf, pageNum, lowerKeyword, trimmedKeyword.length),
          );
        }

        // Promise.all 保持页码顺序
        const batchResults = await Promise.all(batchPromises);

        for (const result of batchResults) {
          allMatches.push(...result.searchMatches);
          pageTextCache.value.set(result.pageNum, {
            pageNumber: result.pageNum,
            text: result.pageText,
            matches: result.pageMatches,
          });
        }
      }

      // 最终检查是否被取消
      if (searchId !== currentSearchId) return;

      matches.value = allMatches;

      if (allMatches.length > 0) {
        currentMatchIndex.value = 1;
        options.onMatchChange?.(1, allMatches[0] ?? null);
      }

      options.onSearchChange?.(trimmedKeyword, allMatches.length);
    } finally {
      // 只有当前搜索才更新 searching 状态
      if (searchId === currentSearchId) {
        searching.value = false;
      }
    }
  }

  /**
   * 下一个匹配
   */
  function nextMatch(): SearchMatch | null {
    if (matches.value.length === 0) return null;

    let newIndex = currentMatchIndex.value + 1;
    if (newIndex > matches.value.length) {
      newIndex = 1; // 循环到第一个
    }

    currentMatchIndex.value = newIndex;
    const match = matches.value[newIndex - 1] ?? null;
    options.onMatchChange?.(newIndex, match);
    return match;
  }

  /**
   * 上一个匹配
   */
  function prevMatch(): SearchMatch | null {
    if (matches.value.length === 0) return null;

    let newIndex = currentMatchIndex.value - 1;
    if (newIndex < 1) {
      newIndex = matches.value.length; // 循环到最后一个
    }

    currentMatchIndex.value = newIndex;
    const match = matches.value[newIndex - 1] ?? null;
    options.onMatchChange?.(newIndex, match);
    return match;
  }

  /**
   * 跳转到指定匹配
   */
  function gotoMatch(index: number): SearchMatch | null {
    if (index < 1 || index > matches.value.length) return null;

    currentMatchIndex.value = index;
    const match = matches.value[index - 1] ?? null;
    options.onMatchChange?.(index, match);
    return match;
  }

  /**
   * 清除搜索
   */
  function clearSearch(): void {
    keyword.value = '';
    matches.value = [];
    currentMatchIndex.value = 0;
    pageTextCache.value.clear();
    options.onSearchChange?.('', 0);
  }

  /**
   * 高亮指定页面的匹配项
   * 使用 DOM API 构建节点，避免 innerHTML XSS 风险，并保留原始 span 元素
   */
  function highlightMatches(container: HTMLElement, pageNumber: number): void {
    // 先清除现有高亮
    clearHighlights(container);

    if (!keyword.value) return;

    const cache = pageTextCache.value.get(pageNumber);
    if (!cache || cache.matches.length === 0) return;

    // 获取当前页在所有匹配中的起始全局索引
    let globalStartIndex = 0;
    for (const match of matches.value) {
      if (match.pageNumber === pageNumber) break;
      globalStartIndex++;
    }

    // 收集所有 text span 及其在拼接文本中的偏移区间
    const textSpans = Array.from(
      container.querySelectorAll('span[role="presentation"]'),
    );
    const spanInfos: {
      span: HTMLElement;
      text: string;
      start: number;
      end: number;
    }[] = [];
    let textOffset = 0;

    for (const spanEl of textSpans) {
      const text = spanEl.textContent ?? '';
      spanInfos.push({
        span: spanEl as HTMLElement,
        text,
        start: textOffset,
        end: textOffset + text.length,
      });
      textOffset += text.length;
    }

    // 基于缓存的匹配位置（全页拼接文本偏移），计算每个 span 内需要高亮的区间
    const spanEdits = new Map<
      number,
      { start: number; end: number; globalIndex: number }[]
    >();

    for (let mi = 0; mi < cache.matches.length; mi++) {
      const matchPair = cache.matches[mi];
      if (!matchPair) continue;
      const [matchStart, matchEnd] = matchPair;
      const globalIdx = globalStartIndex + mi;

      for (let si = 0; si < spanInfos.length; si++) {
        const info = spanInfos[si];
        if (!info) continue;
        const overlapStart = Math.max(matchStart, info.start);
        const overlapEnd = Math.min(matchEnd, info.end);

        if (overlapStart < overlapEnd) {
          if (!spanEdits.has(si)) {
            spanEdits.set(si, []);
          }
          spanEdits.get(si)!.push({
            start: overlapStart - info.start,
            end: overlapEnd - info.start,
            globalIndex: globalIdx,
          });
        }
      }
    }

    // 对需要修改的 span 做高亮替换
    for (const [si, ranges] of spanEdits) {
      const info = spanInfos[si];
      if (!info) continue;
      const { span, text } = info;

      span.dataset.originalText = text;
      ranges.sort((a, b) => a.start - b.start);

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;

      for (const range of ranges) {
        if (range.start > lastIndex) {
          fragment.appendChild(
            document.createTextNode(text.substring(lastIndex, range.start)),
          );
        }

        const mark = document.createElement('mark');
        mark.className = `aix-pdf-search-highlight${range.globalIndex + 1 === currentMatchIndex.value ? ' aix-pdf-search-highlight--current' : ''}`;
        mark.textContent = text.substring(range.start, range.end);
        fragment.appendChild(mark);

        lastIndex = range.end;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex)),
        );
      }

      span.textContent = '';
      span.appendChild(fragment);
    }
  }

  /**
   * 清除高亮
   * 通过 data-original-text 还原原始文本，保留 span 元素结构
   */
  function clearHighlights(container: HTMLElement): void {
    const highlightedSpans = container.querySelectorAll(
      'span[data-original-text]',
    );
    highlightedSpans.forEach((span) => {
      const originalText = (span as HTMLElement).dataset.originalText;
      if (originalText !== undefined) {
        span.textContent = originalText;
        delete (span as HTMLElement).dataset.originalText;
      }
    });
  }

  return {
    keyword,
    searching,
    totalMatches,
    currentMatchIndex,
    currentMatch,
    matches,
    search,
    nextMatch,
    prevMatch,
    gotoMatch,
    clearSearch,
    highlightMatches,
    clearHighlights,
  };
}
