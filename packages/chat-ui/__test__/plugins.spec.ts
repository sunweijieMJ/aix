import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createPlugin,
  installPlugin,
  uninstallPlugin,
  isPluginInstalled,
  getInstalledPlugins,
  resetPlugins,
  PluginInstallError,
  getPluginDependencyTree,
} from '../src/plugins/createPlugin';

describe('Plugin System', () => {
  beforeEach(() => {
    resetPlugins();
  });

  describe('createPlugin', () => {
    it('should create a plugin with required properties', () => {
      const plugin = createPlugin('test-plugin', [
        { name: 'test', type: 'text', component: {}, priority: 10 },
      ]);

      expect(plugin.name).toBe('test-plugin');
      expect(plugin.renderers).toHaveLength(1);
    });

    it('should create plugin with optional properties', () => {
      const plugin = createPlugin('test-plugin', [], {
        version: '1.0.0',
        dependencies: ['other-plugin'],
      });

      expect(plugin.version).toBe('1.0.0');
      expect(plugin.dependencies).toContain('other-plugin');
    });

    it('should create plugin with empty renderers array', () => {
      const plugin = createPlugin('empty-plugin', []);

      expect(plugin.renderers).toEqual([]);
    });
  });

  describe('installPlugin', () => {
    it('should install a plugin', () => {
      const plugin = createPlugin('test-plugin', []);

      installPlugin(plugin);
      expect(isPluginInstalled('test-plugin')).toBe(true);
    });

    it('should not install duplicate plugins', () => {
      const plugin = createPlugin('test-plugin', []);

      installPlugin(plugin);
      installPlugin(plugin);

      expect(getInstalledPlugins()).toHaveLength(1);
    });

    it('should call setup function on install', () => {
      const setup = vi.fn();
      const plugin = createPlugin('test-plugin', [], { install: setup });

      installPlugin(plugin);
      expect(setup).toHaveBeenCalled();
    });

    it('should warn about missing dependencies', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const plugin = createPlugin('dependent-plugin', [], {
        dependencies: ['missing-plugin'],
      });

      installPlugin(plugin);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing-plugin'),
      );

      consoleSpy.mockRestore();
    });

    it('should throw error in strict mode for missing dependencies', () => {
      const plugin = createPlugin('dependent-plugin', [], {
        dependencies: ['missing-plugin'],
      });

      expect(() => installPlugin(plugin, { strict: true })).toThrow(
        PluginInstallError,
      );
    });

    it('should install plugin when dependencies are satisfied', () => {
      const basePlugin = createPlugin('base-plugin', []);
      const dependentPlugin = createPlugin('dependent-plugin', [], {
        dependencies: ['base-plugin'],
      });

      installPlugin(basePlugin);
      installPlugin(dependentPlugin);

      expect(isPluginInstalled('dependent-plugin')).toBe(true);
    });

    it('should install multiple plugins', () => {
      const plugins = [
        createPlugin('plugin-1', []),
        createPlugin('plugin-2', []),
        createPlugin('plugin-3', []),
      ];

      plugins.forEach((p) => installPlugin(p));
      expect(getInstalledPlugins()).toHaveLength(3);
    });
  });

  describe('uninstallPlugin', () => {
    it('should uninstall a plugin', () => {
      const plugin = createPlugin('test-plugin', []);

      installPlugin(plugin);
      expect(isPluginInstalled('test-plugin')).toBe(true);

      uninstallPlugin('test-plugin');
      expect(isPluginInstalled('test-plugin')).toBe(false);
    });

    it('should not throw when uninstalling non-existent plugin', () => {
      expect(() => uninstallPlugin('non-existent')).not.toThrow();
    });

    it('should allow reinstalling after uninstall', () => {
      const plugin = createPlugin('test-plugin', []);

      installPlugin(plugin);
      uninstallPlugin('test-plugin');
      installPlugin(plugin);

      expect(isPluginInstalled('test-plugin')).toBe(true);
    });

    it('should warn when uninstalling plugin with dependents', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const basePlugin = createPlugin('base-plugin', []);
      const dependentPlugin = createPlugin('dependent-plugin', [], {
        dependencies: ['base-plugin'],
      });

      installPlugin(basePlugin);
      installPlugin(dependentPlugin);

      const result = uninstallPlugin('base-plugin');
      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should force uninstall with force option', () => {
      const basePlugin = createPlugin('base-plugin', []);
      const dependentPlugin = createPlugin('dependent-plugin', [], {
        dependencies: ['base-plugin'],
      });

      installPlugin(basePlugin);
      installPlugin(dependentPlugin);

      const result = uninstallPlugin('base-plugin', { force: true });
      expect(result).toBe(true);
      expect(isPluginInstalled('base-plugin')).toBe(false);
    });
  });

  describe('isPluginInstalled', () => {
    it('should return false for uninstalled plugin', () => {
      expect(isPluginInstalled('test')).toBe(false);
    });

    it('should return true for installed plugin', () => {
      const plugin = createPlugin('test-plugin', []);

      installPlugin(plugin);
      expect(isPluginInstalled('test-plugin')).toBe(true);
    });
  });

  describe('getInstalledPlugins', () => {
    it('should return empty array when no plugins installed', () => {
      expect(getInstalledPlugins()).toEqual([]);
    });

    it('should return all installed plugins', () => {
      const plugins = [
        createPlugin('plugin-1', []),
        createPlugin('plugin-2', []),
      ];

      plugins.forEach((p) => installPlugin(p));

      const installed = getInstalledPlugins();
      expect(installed).toHaveLength(2);
      expect(installed.map((p) => p.name)).toContain('plugin-1');
      expect(installed.map((p) => p.name)).toContain('plugin-2');
    });
  });

  describe('resetPlugins', () => {
    it('should remove all plugins', () => {
      const plugins = [
        createPlugin('plugin-1', []),
        createPlugin('plugin-2', []),
      ];

      plugins.forEach((p) => installPlugin(p));
      expect(getInstalledPlugins()).toHaveLength(2);

      resetPlugins();
      expect(getInstalledPlugins()).toHaveLength(0);
    });
  });

  describe('getPluginDependencyTree', () => {
    it('should return empty array for non-existent plugin', () => {
      expect(getPluginDependencyTree('non-existent')).toEqual([]);
    });

    it('should return dependencies for plugin', () => {
      const basePlugin = createPlugin('base-plugin', []);
      const dependentPlugin = createPlugin('dependent-plugin', [], {
        dependencies: ['base-plugin'],
      });

      installPlugin(basePlugin);
      installPlugin(dependentPlugin);

      const deps = getPluginDependencyTree('dependent-plugin');
      expect(deps).toContain('base-plugin');
    });
  });

  describe('plugin lifecycle', () => {
    it('should execute setup in correct order', () => {
      const order: string[] = [];

      const plugin1 = createPlugin('plugin-1', [], {
        install: () => order.push('plugin-1'),
      });

      const plugin2 = createPlugin('plugin-2', [], {
        install: () => order.push('plugin-2'),
      });

      installPlugin(plugin1);
      installPlugin(plugin2);

      expect(order).toEqual(['plugin-1', 'plugin-2']);
    });

    it('should handle setup errors gracefully', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const plugin = createPlugin('error-plugin', [], {
        install: () => {
          throw new Error('Setup failed');
        },
      });

      // Should throw
      expect(() => installPlugin(plugin)).toThrow();

      consoleSpy.mockRestore();
    });
  });
});
