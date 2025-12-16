/**
 * @fileoverview 插件循环依赖测试
 * 测试插件系统的循环依赖检测功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rendererRegistry } from '../src/core/RendererRegistry';
import {
  createPlugin,
  installPlugin,
  uninstallPlugin,
  resetPlugins,
  getPluginDependencyTree,
  detectCircularDependency,
  CircularDependencyError,
  isPluginInstalled,
} from '../src/plugins/createPlugin';

describe('插件循环依赖检测', () => {
  beforeEach(() => {
    rendererRegistry.clear();
    resetPlugins();
  });

  afterEach(() => {
    rendererRegistry.clear();
    resetPlugins();
  });

  describe('detectCircularDependency', () => {
    it('should return null when no circular dependency', () => {
      // A -> B -> C (线性依赖)
      const pluginC = createPlugin('c', {
        name: 'c-renderer',
        type: 'text',
        priority: 0,
      });

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['c'] },
      );

      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      installPlugin(pluginC);
      installPlugin(pluginB);
      installPlugin(pluginA);

      const cycle = detectCircularDependency('a');
      expect(cycle).toBeNull();
    });

    it('should detect direct circular dependency (A -> B -> A)', () => {
      // 先安装没有依赖的插件
      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['a'] },
      );

      // 安装时会有警告但不会阻止
      installPlugin(pluginA);
      installPlugin(pluginB);

      const cycle = detectCircularDependency('a');
      expect(cycle).not.toBeNull();
      expect(cycle).toContain('a');
      expect(cycle).toContain('b');
    });

    it('should detect indirect circular dependency (A -> B -> C -> A)', () => {
      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['c'] },
      );

      const pluginC = createPlugin(
        'c',
        { name: 'c-renderer', type: 'text', priority: 0 },
        { dependencies: ['a'] },
      );

      installPlugin(pluginA);
      installPlugin(pluginB);
      installPlugin(pluginC);

      const cycle = detectCircularDependency('a');
      expect(cycle).not.toBeNull();
      expect(cycle?.length).toBe(4); // a -> b -> c -> a
    });

    it('should return null for non-existent plugin', () => {
      const cycle = detectCircularDependency('non-existent');
      expect(cycle).toBeNull();
    });

    it('should return null for plugin without dependencies', () => {
      const plugin = createPlugin('standalone', {
        name: 'standalone-renderer',
        type: 'text',
        priority: 0,
      });

      installPlugin(plugin);

      const cycle = detectCircularDependency('standalone');
      expect(cycle).toBeNull();
    });
  });

  describe('getPluginDependencyTree', () => {
    it('should return empty array for non-existent plugin', () => {
      const deps = getPluginDependencyTree('non-existent');
      expect(deps).toEqual([]);
    });

    it('should return dependencies in correct order', () => {
      const pluginC = createPlugin('c', {
        name: 'c-renderer',
        type: 'text',
        priority: 0,
      });

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['c'] },
      );

      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      installPlugin(pluginC);
      installPlugin(pluginB);
      installPlugin(pluginA);

      const deps = getPluginDependencyTree('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
    });

    it('should warn on circular dependency', () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['a'] },
      );

      installPlugin(pluginA);
      installPlugin(pluginB);

      getPluginDependencyTree('a');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('循环依赖'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should throw on circular dependency when throwOnCircular is true', () => {
      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b'] },
      );

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['a'] },
      );

      // 静默安装警告
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      installPlugin(pluginA);
      installPlugin(pluginB);

      expect(() => {
        getPluginDependencyTree('a', { throwOnCircular: true });
      }).toThrow(CircularDependencyError);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('CircularDependencyError', () => {
    it('should contain cycle information', () => {
      const cycle = ['a', 'b', 'c', 'a'];
      const error = new CircularDependencyError('Test error', cycle);

      expect(error.name).toBe('CircularDependencyError');
      expect(error.cycle).toEqual(cycle);
      expect(error.message).toBe('Test error');
    });
  });

  describe('复杂依赖场景', () => {
    it('should handle diamond dependency (A -> B, A -> C, B -> D, C -> D)', () => {
      const pluginD = createPlugin('d', {
        name: 'd-renderer',
        type: 'text',
        priority: 0,
      });

      const pluginB = createPlugin(
        'b',
        { name: 'b-renderer', type: 'text', priority: 0 },
        { dependencies: ['d'] },
      );

      const pluginC = createPlugin(
        'c',
        { name: 'c-renderer', type: 'text', priority: 0 },
        { dependencies: ['d'] },
      );

      const pluginA = createPlugin(
        'a',
        { name: 'a-renderer', type: 'text', priority: 0 },
        { dependencies: ['b', 'c'] },
      );

      installPlugin(pluginD);
      installPlugin(pluginB);
      installPlugin(pluginC);
      installPlugin(pluginA);

      // 菱形依赖不是循环依赖
      const cycle = detectCircularDependency('a');
      expect(cycle).toBeNull();

      const deps = getPluginDependencyTree('a');
      expect(deps).toContain('b');
      expect(deps).toContain('c');
      expect(deps).toContain('d');
    });

    it('should handle self dependency (A -> A)', () => {
      const pluginA = createPlugin(
        'self-dep',
        { name: 'self-renderer', type: 'text', priority: 0 },
        { dependencies: ['self-dep'] },
      );

      installPlugin(pluginA);

      const cycle = detectCircularDependency('self-dep');
      expect(cycle).not.toBeNull();
      expect(cycle).toContain('self-dep');
    });
  });
});

describe('插件卸载依赖检查', () => {
  beforeEach(() => {
    rendererRegistry.clear();
    resetPlugins();
  });

  afterEach(() => {
    rendererRegistry.clear();
    resetPlugins();
  });

  it('should warn when uninstalling plugin with dependents', () => {
    const consoleWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => {});

    const pluginB = createPlugin('base', {
      name: 'base-renderer',
      type: 'text',
      priority: 0,
    });

    const pluginA = createPlugin(
      'dependent',
      { name: 'dep-renderer', type: 'text', priority: 0 },
      { dependencies: ['base'] },
    );

    installPlugin(pluginB);
    installPlugin(pluginA);

    // 尝试卸载被依赖的插件
    const result = uninstallPlugin('base');

    expect(result).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('被以下插件依赖'),
    );

    consoleWarnSpy.mockRestore();
  });

  it('should force uninstall plugin with dependents', () => {
    const pluginB = createPlugin('base', {
      name: 'base-renderer',
      type: 'text',
      priority: 0,
    });

    const pluginA = createPlugin(
      'dependent',
      { name: 'dep-renderer', type: 'text', priority: 0 },
      { dependencies: ['base'] },
    );

    installPlugin(pluginB);
    installPlugin(pluginA);

    // 强制卸载
    const result = uninstallPlugin('base', { force: true });

    expect(result).toBe(true);
    expect(isPluginInstalled('base')).toBe(false);
  });
});
