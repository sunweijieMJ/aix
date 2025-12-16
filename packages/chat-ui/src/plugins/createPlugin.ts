/**
 * @fileoverview 插件系统
 * 提供插件创建、安装、卸载等功能
 */

import { rendererRegistry } from '../core/RendererRegistry';
import type { RendererDefinition } from '../core/types';

/**
 * 插件定义
 */
export interface ChatUIPlugin {
  /** 插件名称（唯一标识） */
  name: string;
  /** 插件版本 */
  version?: string;
  /** 插件描述 */
  description?: string;
  /** 提供的渲染器 */
  renderers?: RendererDefinition[];
  /** 安装钩子 */
  install?: (registry: typeof rendererRegistry) => void;
  /** 卸载钩子 */
  uninstall?: (registry: typeof rendererRegistry) => void;
  /** 依赖的其他插件 */
  dependencies?: string[];
}

/**
 * 插件安装选项
 */
export interface PluginInstallOptions {
  /** 覆盖已存在的同名渲染器 */
  override?: boolean;
  /** 严格模式：依赖缺失时抛出错误而非警告 */
  strict?: boolean;
}

/**
 * 插件安装错误
 */
export class PluginInstallError extends Error {
  constructor(
    message: string,
    public readonly pluginName: string,
    public readonly missingDependencies: string[],
  ) {
    super(message);
    this.name = 'PluginInstallError';
  }
}

/** 已安装的插件 */
const installedPlugins = new Map<string, ChatUIPlugin>();

/**
 * 创建插件
 */
export function createPlugin(
  name: string,
  renderers: RendererDefinition | RendererDefinition[],
  options?: Partial<Omit<ChatUIPlugin, 'name' | 'renderers'>>,
): ChatUIPlugin {
  const rendererList = Array.isArray(renderers) ? renderers : [renderers];

  return {
    name,
    renderers: rendererList,
    install: (registry) => {
      rendererList.forEach((r) => registry.register(r));
    },
    uninstall: (registry) => {
      rendererList.forEach((r) => registry.unregister(r.name));
    },
    ...options,
  };
}

/**
 * 安装插件
 */
export function installPlugin(
  plugin: ChatUIPlugin,
  options?: PluginInstallOptions,
): void {
  const { override = false, strict = false } = options || {};

  // 检查是否已安装
  if (installedPlugins.has(plugin.name)) {
    if (!override) {
      console.warn(`[ChatUI] 插件 "${plugin.name}" 已安装，跳过`);
      return;
    }
    // 先卸载旧版本
    uninstallPlugin(plugin.name);
  }

  // 检查依赖
  if (plugin.dependencies?.length) {
    const missingDeps: string[] = [];
    for (const dep of plugin.dependencies) {
      if (!installedPlugins.has(dep)) {
        missingDeps.push(dep);
      }
    }

    if (missingDeps.length > 0) {
      const message = `[ChatUI] 插件 "${plugin.name}" 缺少依赖: ${missingDeps.join(', ')}`;
      if (strict) {
        throw new PluginInstallError(message, plugin.name, missingDeps);
      } else {
        console.warn(message);
      }
    }
  }

  // 执行安装
  try {
    if (plugin.install) {
      plugin.install(rendererRegistry);
    } else if (plugin.renderers) {
      plugin.renderers.forEach((r) => rendererRegistry.register(r));
    }

    // 记录已安装
    installedPlugins.set(plugin.name, plugin);
  } catch (err) {
    console.error(`[ChatUI] 插件 "${plugin.name}" 安装失败:`, err);
    throw err;
  }
}

/**
 * 批量安装插件
 */
export function installPlugins(
  plugins: ChatUIPlugin[],
  options?: PluginInstallOptions,
): void {
  plugins.forEach((p) => installPlugin(p, options));
}

/**
 * 卸载插件
 * @param name 插件名称
 * @param options 卸载选项
 */
export function uninstallPlugin(
  name: string,
  options?: { force?: boolean },
): boolean {
  const plugin = installedPlugins.get(name);
  if (!plugin) {
    return false;
  }

  // 检查是否有其他插件依赖此插件
  if (!options?.force) {
    const dependents: string[] = [];
    for (const [pluginName, p] of installedPlugins) {
      if (p.dependencies?.includes(name)) {
        dependents.push(pluginName);
      }
    }

    if (dependents.length > 0) {
      console.warn(
        `[ChatUI] 插件 "${name}" 被以下插件依赖: ${dependents.join(', ')}，使用 force: true 强制卸载`,
      );
      return false;
    }
  }

  // 执行卸载
  try {
    if (plugin.uninstall) {
      plugin.uninstall(rendererRegistry);
    } else if (plugin.renderers) {
      plugin.renderers.forEach((r) => rendererRegistry.unregister(r.name));
    }
  } catch (err) {
    console.error(`[ChatUI] 插件 "${name}" 卸载失败:`, err);
  }

  // 移除记录
  installedPlugins.delete(name);
  return true;
}

/**
 * 检查插件是否已安装
 */
export function isPluginInstalled(name: string): boolean {
  return installedPlugins.has(name);
}

/**
 * 获取已安装的插件列表
 */
export function getInstalledPlugins(): ChatUIPlugin[] {
  return Array.from(installedPlugins.values());
}

/**
 * 获取已安装的插件名称列表
 */
export function getInstalledPluginNames(): string[] {
  return Array.from(installedPlugins.keys());
}

/**
 * 重置所有插件（用于测试）
 */
export function resetPlugins(): void {
  // 卸载所有插件（按依赖顺序反向卸载）
  const plugins = Array.from(installedPlugins.values());

  // 简单处理：强制卸载所有
  for (const plugin of plugins) {
    uninstallPlugin(plugin.name, { force: true });
  }

  installedPlugins.clear();
}

/**
 * 循环依赖错误
 */
export class CircularDependencyError extends Error {
  constructor(
    message: string,
    public readonly cycle: string[],
  ) {
    super(message);
    this.name = 'CircularDependencyError';
  }
}

/**
 * 检测插件是否存在循环依赖
 * @param name 插件名称
 * @returns 如果有循环依赖，返回循环路径；否则返回 null
 */
export function detectCircularDependency(name: string): string[] | null {
  const plugin = installedPlugins.get(name);
  if (!plugin) return null;

  const path: string[] = [];
  const visiting = new Set<string>();

  function dfs(pluginName: string): string[] | null {
    if (visiting.has(pluginName)) {
      // 找到循环，构建循环路径
      const cycleStart = path.indexOf(pluginName);
      return [...path.slice(cycleStart), pluginName];
    }

    const p = installedPlugins.get(pluginName);
    if (!p?.dependencies?.length) return null;

    visiting.add(pluginName);
    path.push(pluginName);

    for (const dep of p.dependencies) {
      const cycle = dfs(dep);
      if (cycle) return cycle;
    }

    path.pop();
    visiting.delete(pluginName);
    return null;
  }

  return dfs(name);
}

/**
 * 获取插件的依赖树
 * @param name 插件名称
 * @param options 选项
 * @returns 依赖列表
 * @throws {CircularDependencyError} 如果检测到循环依赖且 throwOnCircular 为 true
 */
export function getPluginDependencyTree(
  name: string,
  options?: { throwOnCircular?: boolean },
): string[] {
  const plugin = installedPlugins.get(name);
  if (!plugin) return [];

  // 检测循环依赖
  const cycle = detectCircularDependency(name);
  if (cycle) {
    const cycleStr = cycle.join(' -> ');
    const message = `[ChatUI] 检测到插件循环依赖: ${cycleStr}`;
    console.warn(message);

    if (options?.throwOnCircular) {
      throw new CircularDependencyError(message, cycle);
    }
  }

  const deps: string[] = [];
  const visited = new Set<string>();

  function collectDeps(pluginName: string) {
    if (visited.has(pluginName)) return;
    visited.add(pluginName);

    const p = installedPlugins.get(pluginName);
    if (p?.dependencies) {
      for (const dep of p.dependencies) {
        if (!visited.has(dep)) {
          deps.push(dep);
          collectDeps(dep);
        }
      }
    }
  }

  collectDeps(name);
  return deps;
}
