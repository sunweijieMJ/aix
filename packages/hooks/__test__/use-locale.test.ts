import { describe, it, expect, beforeEach } from 'vitest';
import {
  createApp,
  defineComponent,
  nextTick,
  type ComponentPublicInstance,
} from 'vue';
import {
  createLocale,
  useLocale,
  useCommonLocale,
  formatMessage,
  type ComponentLocale,
} from '../src/use-locale';

// 辅助类型：测试中 app.mount() 返回的 VM 实例类型
type TestVM<T = Record<string, any>> = ComponentPublicInstance & T;

describe('useLocale', () => {
  // 在所有测试前清理 localStorage，避免测试之间相互影响
  beforeEach(() => {
    localStorage.clear();
  });

  describe('createLocale', () => {
    it('should create locale with default zh-CN', () => {
      const { localeContext } = createLocale();
      expect(localeContext.locale).toBe('zh-CN');
    });

    it('should create locale with custom default', () => {
      const { localeContext } = createLocale('en-US');
      expect(localeContext.locale).toBe('en-US');
    });

    it('should provide install function', () => {
      const { install } = createLocale();
      expect(typeof install).toBe('function');
    });

    it('should setLocale correctly', () => {
      const { localeContext } = createLocale('zh-CN');
      expect(localeContext.locale).toBe('zh-CN');

      localeContext.setLocale('en-US');
      expect(localeContext.locale).toBe('en-US');
    });

    it('should save locale to localStorage when persist is true', () => {
      const { localeContext } = createLocale('zh-CN', { persist: true });
      localeContext.setLocale('en-US');
      expect(localStorage.getItem('aix-locale')).toBe('en-US');
    });

    it('should not save locale to localStorage by default', () => {
      const { localeContext } = createLocale();
      localeContext.setLocale('en-US');
      expect(localStorage.getItem('aix-locale')).toBeNull();
    });

    it('should load locale from localStorage on install', () => {
      localStorage.setItem('aix-locale', 'en-US');

      const { localeContext, install } = createLocale('zh-CN', {
        persist: true,
      });

      // install 时触发 loadFromStorage
      const app = createApp({ template: '<div></div>' });
      app.use({ install });
      app.mount(document.createElement('div'));

      expect(localeContext.locale).toBe('en-US');
    });

    it('should ignore invalid locale in localStorage', () => {
      localStorage.setItem('aix-locale', 'invalid-locale');

      const { localeContext, install } = createLocale('zh-CN', {
        persist: true,
      });

      const app = createApp({ template: '<div></div>' });
      app.use({ install });
      app.mount(document.createElement('div'));

      expect(localeContext.locale).toBe('zh-CN');
    });
  });

  describe('useCommonLocale', () => {
    it('should return current locale and empty t', () => {
      const app = createApp({
        setup() {
          const { t, locale } = useCommonLocale();
          return { t, locale };
        },
        template: '<div></div>',
      });

      const { install } = createLocale('zh-CN');
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.locale).toBe('zh-CN');
      expect(vm.t).toEqual({});
    });

    it('should track locale switch', async () => {
      const { localeContext, install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { t, locale } = useCommonLocale();
          return { t, locale };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.locale).toBe('zh-CN');

      localeContext.setLocale('en-US');
      await nextTick();

      expect(vm.locale).toBe('en-US');
    });
  });

  describe('useLocale with component locale', () => {
    const testLocale: ComponentLocale<{ greeting: string }> = {
      'zh-CN': { greeting: '你好' },
      'en-US': { greeting: 'Hello' },
    };

    it('should return component locale texts', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { t } = useLocale(testLocale);
          return { t };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.greeting).toBe('你好');
    });

    it('should switch component locale correctly', async () => {
      const { localeContext, install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { t } = useLocale(testLocale);
          return { t };
        },
        template: '<div>{{ t.greeting }}</div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.greeting).toBe('你好');

      localeContext.setLocale('en-US');
      await nextTick();

      expect(vm.t.greeting).toBe('Hello');
    });
  });

  describe('locale fallback', () => {
    it('should fallback to zh-CN when no provider', () => {
      const partialLocale: ComponentLocale<{ test: string }> = {
        'zh-CN': { test: '测试' },
        'en-US': { test: 'Test' },
      };

      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { t } = useLocale(partialLocale);
          return { t };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.test).toBe('测试');
    });
  });

  describe('locale override', () => {
    const testLocale: ComponentLocale<{ greeting: string }> = {
      'zh-CN': { greeting: '你好' },
      'en-US': { greeting: 'Hello' },
    };

    it('should use override locale instead of global locale', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          // 全局是中文，但组件覆盖为英文
          const { t } = useLocale(testLocale, 'en-US');
          return { t };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.greeting).toBe('Hello');
    });

    it('should prioritize override locale over global locale change', async () => {
      const { localeContext, install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          // 强制使用英文
          const { t } = useLocale(testLocale, 'en-US');
          return { t };
        },
        template: '<div>{{ t.greeting }}</div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.greeting).toBe('Hello');

      // 切换全局语言到中文
      localeContext.setLocale('zh-CN');
      await nextTick();

      // 组件应该仍然显示英文（因为有 override）
      expect(vm.t.greeting).toBe('Hello');
    });

    it('should support override in useCommonLocale', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          // 全局是中文，但覆盖为英文
          const { locale } = useCommonLocale('en-US');
          return { locale };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.locale).toBe('en-US');
    });
  });

  describe('formatMessage', () => {
    it('should replace single placeholder', () => {
      expect(formatMessage('共 {total} 条', { total: 100 })).toBe('共 100 条');
    });

    it('should replace multiple placeholders', () => {
      expect(
        formatMessage('{count} of {total} items', { count: 1, total: 10 }),
      ).toBe('1 of 10 items');
    });

    it('should keep unmatched placeholders as-is', () => {
      expect(formatMessage('{name} has {count} items', { name: 'Alice' })).toBe(
        'Alice has {count} items',
      );
    });

    it('should handle number values', () => {
      expect(formatMessage('Page {page}', { page: 3 })).toBe('Page 3');
    });

    it('should handle zero value', () => {
      expect(formatMessage('{count} items', { count: 0 })).toBe('0 items');
    });

    it('should return template as-is when no placeholders', () => {
      expect(formatMessage('No placeholders here', {})).toBe(
        'No placeholders here',
      );
    });
  });
});
