/**
 * @fileoverview 渲染器注册中心
 * 单例模式，管理所有渲染器的注册、获取和加载
 */

import type { Component } from 'vue';
import type { ContentType, RendererDefinition } from './types';

/**
 * 渲染器注册中心
 */
class RendererRegistry {
  private static instance: RendererRegistry;

  /** 渲染器定义映射 (name -> definition) */
  private renderers = new Map<string, RendererDefinition>();

  /** 类型到渲染器名称映射 (type -> [names]) */
  private typeMap = new Map<ContentType, string[]>();

  /** 正在加载的 Promise 缓存 */
  private loadingPromises = new Map<string, Promise<Component>>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): RendererRegistry {
    if (!RendererRegistry.instance) {
      RendererRegistry.instance = new RendererRegistry();
    }
    return RendererRegistry.instance;
  }

  /**
   * 注册渲染器
   */
  register<T = unknown>(definition: RendererDefinition<T>): void {
    const { name, type } = definition;

    // 保存渲染器定义
    this.renderers.set(name, definition as RendererDefinition);

    // 更新类型映射
    const types = Array.isArray(type) ? type : [type];
    types.forEach((t) => {
      const names = this.typeMap.get(t) || [];
      if (!names.includes(name)) {
        names.push(name);
      }
      // 按优先级排序（高优先级在前）
      names.sort((a, b) => {
        const pa = this.renderers.get(a)?.priority ?? 0;
        const pb = this.renderers.get(b)?.priority ?? 0;
        return pb - pa;
      });
      this.typeMap.set(t, names);
    });
  }

  /**
   * 批量注册渲染器
   */
  registerAll(definitions: RendererDefinition[]): void {
    definitions.forEach((def) => this.register(def));
  }

  /**
   * 根据名称获取渲染器定义
   */
  get(name: string): RendererDefinition | undefined {
    return this.renderers.get(name);
  }

  /**
   * 根据类型获取最高优先级的渲染器定义
   */
  getByType(type: ContentType): RendererDefinition | undefined {
    const names = this.typeMap.get(type);
    const firstName = names?.[0];
    if (!firstName) return undefined;
    return this.renderers.get(firstName);
  }

  /**
   * 根据类型获取所有渲染器定义
   */
  getAllByType(type: ContentType): RendererDefinition[] {
    const names = this.typeMap.get(type) || [];
    return names
      .map((name) => this.renderers.get(name))
      .filter((def): def is RendererDefinition => def !== undefined);
  }

  /**
   * 根据内容自动检测渲染器
   * 按优先级遍历所有渲染器，找到第一个匹配的
   */
  detect(raw: string): RendererDefinition | undefined {
    // 获取所有渲染器并按优先级排序
    const allRenderers = Array.from(this.renderers.values()).sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    for (const renderer of allRenderers) {
      if (renderer.detector?.(raw)) {
        return renderer;
      }
    }

    // 尝试返回 text 渲染器作为 fallback
    const textRenderer = this.renderers.get('text');
    if (textRenderer) {
      return textRenderer;
    }

    // 如果 text 渲染器也未注册，尝试返回优先级最低的渲染器
    const lowestPriorityRenderer = allRenderers[allRenderers.length - 1];
    if (lowestPriorityRenderer) {
      console.warn(
        '[RendererRegistry] text 渲染器未注册，使用 fallback 渲染器:',
        lowestPriorityRenderer.name,
      );
      return lowestPriorityRenderer;
    }

    // 没有任何渲染器可用
    console.error('[RendererRegistry] 没有可用的渲染器，请先安装插件');
    return undefined;
  }

  /**
   * 异步加载渲染器组件
   */
  async loadComponent(name: string): Promise<Component | undefined> {
    const def = this.renderers.get(name);
    if (!def) return undefined;

    // 已有同步组件，直接返回
    if (def.component) {
      return def.component;
    }

    // 没有加载器，返回 undefined
    if (!def.loader) {
      return undefined;
    }

    // 检查是否正在加载
    const existingPromise = this.loadingPromises.get(name);
    if (existingPromise) {
      return existingPromise;
    }

    // 开始加载
    const promise = def
      .loader()
      .then((module) => {
        // 处理 ES Module 默认导出
        const component = 'default' in module ? module.default : module;
        // 缓存组件
        def.component = component;
        // 清理加载 Promise
        this.loadingPromises.delete(name);
        return component;
      })
      .catch((error) => {
        console.error(`[RendererRegistry] 加载渲染器 "${name}" 失败:`, error);
        this.loadingPromises.delete(name);
        throw error;
      });

    this.loadingPromises.set(name, promise);
    return promise;
  }

  /**
   * 检查渲染器是否已注册
   */
  has(name: string): boolean {
    return this.renderers.has(name);
  }

  /**
   * 检查类型是否有对应渲染器
   */
  hasType(type: ContentType): boolean {
    return this.typeMap.has(type) && (this.typeMap.get(type)?.length ?? 0) > 0;
  }

  /**
   * 检查渲染器组件是否已加载
   */
  isLoaded(name: string): boolean {
    const def = this.renderers.get(name);
    return def?.component !== undefined;
  }

  /**
   * 注销渲染器
   */
  unregister(name: string): void {
    const def = this.renderers.get(name);
    if (!def) return;

    // 删除渲染器定义
    this.renderers.delete(name);

    // 清理类型映射
    const types = Array.isArray(def.type) ? def.type : [def.type];
    types.forEach((t) => {
      const names = this.typeMap.get(t);
      if (names) {
        const idx = names.indexOf(name);
        if (idx > -1) {
          names.splice(idx, 1);
        }
        if (names.length === 0) {
          this.typeMap.delete(t);
        }
      }
    });

    // 清理加载 Promise
    this.loadingPromises.delete(name);
  }

  /**
   * 获取所有已注册的渲染器名称
   */
  getNames(): string[] {
    return Array.from(this.renderers.keys());
  }

  /**
   * 获取所有已注册的内容类型
   */
  getTypes(): ContentType[] {
    return Array.from(this.typeMap.keys());
  }

  /**
   * 获取所有已加载的渲染器名称
   */
  getLoadedNames(): string[] {
    return Array.from(this.renderers.entries())
      .filter(([, def]) => def.component !== undefined)
      .map(([name]) => name);
  }

  /**
   * 清空所有渲染器（主要用于测试）
   */
  clear(): void {
    this.renderers.clear();
    this.typeMap.clear();
    this.loadingPromises.clear();
  }
}

/**
 * 导出单例实例
 */
export const rendererRegistry = RendererRegistry.getInstance();

// =============================================================================
// 便捷函数
// =============================================================================

/**
 * 注册渲染器
 */
export function registerRenderer<T = unknown>(
  definition: RendererDefinition<T>,
): void {
  rendererRegistry.register(definition);
}

/**
 * 批量注册渲染器
 */
export function registerRenderers(definitions: RendererDefinition[]): void {
  rendererRegistry.registerAll(definitions);
}

/**
 * 注销渲染器
 */
export function unregisterRenderer(name: string): void {
  rendererRegistry.unregister(name);
}

/**
 * 获取渲染器
 */
export function getRenderer(name: string): RendererDefinition | undefined {
  return rendererRegistry.get(name);
}

/**
 * 根据类型获取渲染器
 */
export function getRendererByType(
  type: ContentType,
): RendererDefinition | undefined {
  return rendererRegistry.getByType(type);
}

/**
 * 检测内容类型对应的渲染器
 */
export function detectRenderer(
  content: string,
): RendererDefinition | undefined {
  return rendererRegistry.detect(content);
}
