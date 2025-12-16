import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  rendererRegistry,
  registerRenderer,
  unregisterRenderer,
  getRenderer,
  getRendererByType,
  detectRenderer,
} from '../src/core/RendererRegistry';
import type { RendererDefinition } from '../src/core/types';

describe('RendererRegistry', () => {
  beforeEach(() => {
    rendererRegistry.clear();
  });

  describe('register', () => {
    it('should register a renderer', () => {
      const renderer: RendererDefinition = {
        name: 'test-renderer',
        type: 'text',
        component: { template: '<div>Test</div>' },
        priority: 10,
      };

      registerRenderer(renderer);
      expect(getRenderer('test-renderer')).toEqual(renderer);
    });

    it('should override existing renderer with same name', () => {
      const renderer1: RendererDefinition = {
        name: 'test',
        type: 'text',
        component: { template: '<div>1</div>' },
        priority: 10,
      };
      const renderer2: RendererDefinition = {
        name: 'test',
        type: 'text',
        component: { template: '<div>2</div>' },
        priority: 20,
      };

      registerRenderer(renderer1);
      registerRenderer(renderer2);
      expect(getRenderer('test')?.priority).toBe(20);
    });

    it('should register multiple renderers', () => {
      const renderers: RendererDefinition[] = [
        { name: 'a', type: 'text', component: {}, priority: 1 },
        { name: 'b', type: 'markdown', component: {}, priority: 2 },
        { name: 'c', type: 'code', component: {}, priority: 3 },
      ];

      renderers.forEach((r) => registerRenderer(r));
      expect(rendererRegistry.getNames()).toHaveLength(3);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent renderer', () => {
      expect(getRenderer('non-existent')).toBeUndefined();
    });

    it('should get renderer by name', () => {
      const renderer: RendererDefinition = {
        name: 'markdown',
        type: 'markdown',
        component: {},
        priority: 10,
      };

      registerRenderer(renderer);
      expect(getRenderer('markdown')).toEqual(renderer);
    });
  });

  describe('getByType', () => {
    it('should get renderer by type', () => {
      registerRenderer({
        name: 'md1',
        type: 'markdown',
        component: {},
        priority: 10,
      });
      registerRenderer({
        name: 'md2',
        type: 'markdown',
        component: {},
        priority: 20,
      });
      registerRenderer({
        name: 'code',
        type: 'code',
        component: {},
        priority: 10,
      });

      // Should return highest priority
      const renderer = getRendererByType('markdown');
      expect(renderer?.name).toBe('md2');
    });

    it('should return undefined for non-existent type', () => {
      expect(getRendererByType('latex')).toBeUndefined();
    });

    it('should return highest priority renderer', () => {
      registerRenderer({
        name: 'low',
        type: 'text',
        component: {},
        priority: 10,
      });
      registerRenderer({
        name: 'high',
        type: 'text',
        component: {},
        priority: 100,
      });
      registerRenderer({
        name: 'mid',
        type: 'text',
        component: {},
        priority: 50,
      });

      const renderer = getRendererByType('text');
      expect(renderer?.name).toBe('high');
    });
  });

  describe('detect', () => {
    it('should detect content type using detector function', () => {
      registerRenderer({
        name: 'latex',
        type: 'latex',
        component: {},
        priority: 10,
        detector: (content: string) =>
          /^\s*\$\$[\s\S]+\$\$\s*$/.test(content.trim()),
      });

      const result = detectRenderer('$$x^2$$');
      expect(result?.name).toBe('latex');
    });

    it('should return text renderer if no detector matches', () => {
      registerRenderer({
        name: 'text',
        type: 'text',
        component: {},
        priority: 0,
      });
      registerRenderer({
        name: 'latex',
        type: 'latex',
        component: {},
        priority: 10,
        detector: (content: string) =>
          /^\s*\$\$[\s\S]+\$\$\s*$/.test(content.trim()),
      });

      const result = detectRenderer('plain text');
      expect(result?.name).toBe('text');
    });

    it('should prefer higher priority detector', () => {
      registerRenderer({
        name: 'low',
        type: 'text',
        component: {},
        priority: 10,
        detector: () => true,
      });
      registerRenderer({
        name: 'high',
        type: 'text',
        component: {},
        priority: 100,
        detector: () => true,
      });

      const result = detectRenderer('any content');
      expect(result?.name).toBe('high');
    });
  });

  describe('unregister', () => {
    it('should unregister a renderer', () => {
      registerRenderer({
        name: 'test',
        type: 'text',
        component: {},
        priority: 10,
      });
      unregisterRenderer('test');
      expect(getRenderer('test')).toBeUndefined();
    });

    it('should not throw when unregistering non-existent renderer', () => {
      expect(() => unregisterRenderer('non-existent')).not.toThrow();
    });
  });

  describe('loadComponent', () => {
    it('should load async component', async () => {
      const mockComponent = { template: '<div>Loaded</div>' };
      const loader = vi.fn().mockResolvedValue({ default: mockComponent });

      registerRenderer({
        name: 'async',
        type: 'text',
        loader,
        priority: 10,
      });

      const component = await rendererRegistry.loadComponent('async');
      expect(component).toEqual(mockComponent);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should cache loaded component', async () => {
      const mockComponent = { template: '<div>Loaded</div>' };
      const loader = vi.fn().mockResolvedValue({ default: mockComponent });

      registerRenderer({
        name: 'async',
        type: 'text',
        loader,
        priority: 10,
      });

      await rendererRegistry.loadComponent('async');
      await rendererRegistry.loadComponent('async');
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('should return static component if no loader', async () => {
      const component = { template: '<div>Static</div>' };
      registerRenderer({
        name: 'static',
        type: 'text',
        component,
        priority: 10,
      });

      const result = await rendererRegistry.loadComponent('static');
      expect(result).toEqual(component);
    });

    it('should return undefined for non-existent renderer', async () => {
      const result = await rendererRegistry.loadComponent('non-existent');
      expect(result).toBeUndefined();
    });

    it('should handle loader error', async () => {
      const loader = vi.fn().mockRejectedValue(new Error('Load failed'));

      registerRenderer({
        name: 'error',
        type: 'text',
        loader,
        priority: 10,
      });

      await expect(rendererRegistry.loadComponent('error')).rejects.toThrow(
        'Load failed',
      );
    });

    it('should handle loader returning non-ES-module format', async () => {
      const component = { template: '<div>Direct</div>' };
      const loader = vi.fn().mockResolvedValue(component);

      registerRenderer({
        name: 'direct',
        type: 'text',
        loader,
        priority: 10,
      });

      const result = await rendererRegistry.loadComponent('direct');
      expect(result).toBeDefined();
    });
  });

  describe('getNames', () => {
    it('should return all registered renderer names', () => {
      registerRenderer({ name: 'a', type: 'text', component: {}, priority: 1 });
      registerRenderer({
        name: 'b',
        type: 'markdown',
        component: {},
        priority: 2,
      });

      const names = rendererRegistry.getNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('a');
      expect(names).toContain('b');
    });

    it('should return empty array when no renderers registered', () => {
      expect(rendererRegistry.getNames()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all renderers', () => {
      registerRenderer({ name: 'a', type: 'text', component: {}, priority: 1 });
      registerRenderer({
        name: 'b',
        type: 'markdown',
        component: {},
        priority: 2,
      });

      rendererRegistry.clear();
      expect(rendererRegistry.getNames()).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true if renderer exists', () => {
      registerRenderer({
        name: 'test',
        type: 'text',
        component: {},
        priority: 1,
      });
      expect(rendererRegistry.has('test')).toBe(true);
    });

    it('should return false if renderer does not exist', () => {
      expect(rendererRegistry.has('non-existent')).toBe(false);
    });
  });

  describe('hasType', () => {
    it('should return true if type has renderers', () => {
      registerRenderer({
        name: 'test',
        type: 'markdown',
        component: {},
        priority: 1,
      });
      expect(rendererRegistry.hasType('markdown')).toBe(true);
    });

    it('should return false if type has no renderers', () => {
      expect(rendererRegistry.hasType('latex')).toBe(false);
    });
  });
});
