/**
 * @fileoverview 内容渲染器 Hook
 * 管理渲染器的获取和加载
 *
 * 流式渲染优化策略（参考 ant-design/x）：
 * 1. 防抖更新：减少解析和渲染频率
 * 2. 稳定 Block ID：内容增量更新时保持 ID 不变，避免 Vue 重新创建 DOM
 * 3. 增量检测：只在内容结构变化时重新加载渲染器
 */

import {
  ref,
  watch,
  computed,
  shallowRef,
  type Ref,
  type Component,
  type ComputedRef,
} from 'vue';
import { ContentParser } from '../core/ContentParser';
import { rendererRegistry } from '../core/RendererRegistry';
import type {
  ContentType,
  ContentBlock,
  RendererDefinition,
} from '../core/types';

/** 流式渲染节流间隔（毫秒） */
const STREAMING_THROTTLE_MS = 30;

/**
 * useContentRenderer 返回类型
 */
interface UseContentRendererReturn {
  /** 解析后的内容块 */
  blocks: Ref<ContentBlock[]>;
  /** 渲染器定义映射 */
  rendererDefs: Ref<Map<string, RendererDefinition>>;
  /** 渲染器组件映射 */
  rendererComponents: Ref<Map<string, Component>>;
  /** 加载状态 */
  loading: Ref<boolean>;
  /** 错误信息 */
  error: Ref<Error | null>;
  /** 是否有多个内容块 */
  isMultiBlock: ComputedRef<boolean>;
  /** 重新加载 */
  reload: () => Promise<void> | undefined;
}

/**
 * 内容渲染器 Hook
 */
export function useContentRenderer(
  content: Ref<string>,
  options?: {
    /** 强制指定类型 */
    type?: Ref<ContentType | undefined> | ContentType;
    /** 自定义解析器 */
    parser?:
      | Ref<((content: string) => ContentBlock | ContentBlock[]) | undefined>
      | ((content: string) => ContentBlock | ContentBlock[]);
  },
): UseContentRendererReturn {
  const contentParser = new ContentParser(rendererRegistry);

  /** 解析后的内容块 */
  const blocks = ref<ContentBlock[]>([]);

  /** 渲染器定义映射 */
  const rendererDefs = ref<Map<string, RendererDefinition>>(new Map());

  /** 渲染器组件映射 */
  const rendererComponents = shallowRef<Map<string, Component>>(new Map());

  /** 加载状态 */
  const loading = ref(false);

  /** 错误信息 */
  const error = ref<Error | null>(null);

  /** 是否有多个内容块 */
  const isMultiBlock = computed(() => blocks.value.length > 1);

  // ========== 流式渲染优化 ==========
  /** 节流定时器 */
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上次更新时间 */
  let lastUpdateTime = 0;
  /** 待处理的内容（用于确保最后一次更新被处理） */
  let pendingContent: string | null = null;
  /** 上一次处理的内容长度 */
  let lastProcessedLength = 0;
  /** 稳定的 Block ID 映射（按类型+位置） */
  const stableBlockIds = new Map<string, string>();

  // 获取 options 中的值（支持 Ref 和普通值）
  const typeRef = computed(() => {
    const t = options?.type;
    return t && typeof t === 'object' && 'value' in t
      ? t.value
      : (t as ContentType | undefined);
  });

  const parserRef = computed(() => {
    const p = options?.parser;
    return p && typeof p === 'object' && 'value' in p
      ? p.value
      : (p as ((content: string) => ContentBlock | ContentBlock[]) | undefined);
  });

  /**
   * 生成稳定的 Block ID
   * 关键：使用类型+位置作为 key，保持 ID 稳定
   */
  function getStableBlockId(type: ContentType, index: number): string {
    const key = `${type}-${index}`;
    if (!stableBlockIds.has(key)) {
      stableBlockIds.set(
        key,
        `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      );
    }
    return stableBlockIds.get(key)!;
  }

  /**
   * 解析内容（带稳定 ID 优化）
   */
  function parseContent(raw: string): ContentBlock[] {
    const parser = parserRef.value;
    const type = typeRef.value;

    let result: ContentBlock | ContentBlock[];

    if (parser) {
      result = parser(raw);
    } else if (type) {
      result = contentParser.parseAs(raw, type);
    } else {
      result = contentParser.parse(raw);
    }

    const blockList = Array.isArray(result) ? result : [result];

    // 使用稳定 ID 替换原有 ID
    return blockList.map((block, index) => ({
      ...block,
      id: getStableBlockId(block.type, index),
    }));
  }

  /**
   * 检查是否需要重新加载渲染器
   * 只有当 block 类型变化时才需要重新加载
   */
  function needsReloadRenderers(
    oldBlocks: ContentBlock[],
    newBlocks: ContentBlock[],
  ): boolean {
    if (oldBlocks.length !== newBlocks.length) return true;
    return oldBlocks.some((old, i) => old.type !== newBlocks[i]?.type);
  }

  /**
   * 加载渲染器组件
   */
  async function loadRenderers(blockList: ContentBlock[]) {
    const newDefs = new Map<string, RendererDefinition>();
    const newComponents = new Map<string, Component>();

    for (const block of blockList) {
      const type = block.type;

      // 复用已加载的组件
      if (rendererComponents.value.has(block.id)) {
        const existingDef = rendererDefs.value.get(block.id);
        const existingComponent = rendererComponents.value.get(block.id);
        if (existingDef) newDefs.set(block.id, existingDef);
        if (existingComponent) newComponents.set(block.id, existingComponent);
        continue;
      }

      // 获取渲染器定义
      let def = rendererRegistry.getByType(type);
      if (!def) {
        def = rendererRegistry.detect(block.raw);
      }

      if (def) {
        newDefs.set(block.id, def);

        // 加载组件
        try {
          const component = await rendererRegistry.loadComponent(def.name);
          if (component) {
            newComponents.set(block.id, component);
          }
        } catch (e) {
          console.error(
            `[useContentRenderer] 加载渲染器 "${def.name}" 失败:`,
            e,
          );
        }
      }
    }

    rendererDefs.value = newDefs;
    rendererComponents.value = newComponents;
  }

  /**
   * 处理内容更新（带流式优化）
   * 使用节流策略：保证更新频率不超过 STREAMING_THROTTLE_MS，同时确保最后一次更新被处理
   */
  async function handleContentUpdate(
    newVal: string | undefined,
    immediate = false,
  ) {
    if (!newVal) {
      blocks.value = [];
      rendererDefs.value = new Map();
      rendererComponents.value = new Map();
      stableBlockIds.clear();
      lastProcessedLength = 0;
      lastUpdateTime = 0;
      pendingContent = null;
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      return;
    }

    // 检测是否为流式更新（内容长度增加且已有内容）
    const isStreamingUpdate =
      newVal.length > lastProcessedLength && blocks.value.length > 0;

    // 非流式更新或强制立即更新
    if (!isStreamingUpdate || immediate) {
      await doUpdate(newVal);
      lastUpdateTime = Date.now();
      return;
    }

    // 流式更新：使用节流策略
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;

    if (timeSinceLastUpdate >= STREAMING_THROTTLE_MS) {
      // 距离上次更新已超过节流间隔，立即更新
      await doUpdate(newVal);
      lastUpdateTime = now;
      pendingContent = null;
    } else {
      // 记录待处理内容，设置定时器确保最后一次更新被处理
      pendingContent = newVal;
      if (!throttleTimer) {
        throttleTimer = setTimeout(() => {
          throttleTimer = null;
          if (pendingContent) {
            void doUpdate(pendingContent);
            lastUpdateTime = Date.now();
            pendingContent = null;
          }
        }, STREAMING_THROTTLE_MS - timeSinceLastUpdate);
      }
    }
  }

  /**
   * 实际执行更新
   */
  async function doUpdate(newVal: string) {
    loading.value = true;
    error.value = null;

    try {
      const oldBlocks = blocks.value;
      const parsed = parseContent(newVal);

      // 更新 blocks（保持稳定 ID）
      blocks.value = parsed;
      lastProcessedLength = newVal.length;

      // 只在需要时重新加载渲染器
      if (needsReloadRenderers(oldBlocks, parsed)) {
        await loadRenderers(parsed);
      } else {
        // 更新现有 block 的内容，复用渲染器
        const newDefs = new Map<string, RendererDefinition>();
        const newComponents = new Map<string, Component>();
        for (const block of parsed) {
          const existingDef = rendererDefs.value.get(block.id);
          const existingComponent = rendererComponents.value.get(block.id);
          if (existingDef) newDefs.set(block.id, existingDef);
          if (existingComponent) newComponents.set(block.id, existingComponent);
        }
        // 如果有新的 block 需要加载渲染器
        const needsLoad = parsed.some(
          (b) => !rendererComponents.value.has(b.id),
        );
        if (needsLoad) {
          await loadRenderers(parsed);
        } else {
          rendererDefs.value = newDefs;
          rendererComponents.value = newComponents;
        }
      }
    } catch (e) {
      error.value = e instanceof Error ? e : new Error(String(e));
      console.error('[useContentRenderer] 解析失败:', e);
    } finally {
      loading.value = false;
    }
  }

  // 监听内容和 options 变化（使用数组形式的多源监听）
  watch(
    [content, typeRef, parserRef],
    () => {
      void handleContentUpdate(content.value);
    },
    { immediate: true },
  );

  return {
    /** 解析后的内容块 */
    blocks,
    /** 渲染器定义映射 */
    rendererDefs,
    /** 渲染器组件映射 */
    rendererComponents,
    /** 加载状态 */
    loading,
    /** 错误信息 */
    error,
    /** 是否有多个内容块 */
    isMultiBlock,
    /** 重新加载 */
    reload: () => {
      if (content.value) {
        stableBlockIds.clear();
        const parsed = parseContent(content.value);
        blocks.value = parsed;
        return loadRenderers(parsed);
      }
    },
  };
}
