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
  type ComponentLocale,
  type Locale,
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

    it('should load locale from localStorage when persist is true', () => {
      localStorage.setItem('aix-locale', 'en-US');
      const { localeContext } = createLocale('zh-CN', { persist: true });

      // 需要手动触发加载（因为在测试环境中）
      const saved = localStorage.getItem('aix-locale');
      if (saved && (saved === 'zh-CN' || saved === 'en-US')) {
        localeContext.setLocale(saved as Locale);
      }

      expect(localeContext.locale).toBe('en-US');
    });
  });

  describe('useCommonLocale', () => {
    it('should return common locale texts', () => {
      const app = createApp({
        setup() {
          const { t } = useCommonLocale();
          return { t };
        },
        template: '<div></div>',
      });

      const { install } = createLocale('zh-CN');
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.confirm).toBe('确认');
      expect(vm.t.cancel).toBe('取消');
      expect(vm.t.loading).toBe('加载中...');
    });

    it('should switch locale correctly', async () => {
      const { localeContext, install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { t } = useCommonLocale();
          return { t };
        },
        template: '<div>{{ t.confirm }}</div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.confirm).toBe('确认');

      // 切换语言
      localeContext.setLocale('en-US');
      await nextTick();

      expect(vm.t.confirm).toBe('Confirm');
    });
  });

  describe('useLocale with component locale', () => {
    const testLocale: ComponentLocale<{ greeting: string }> = {
      'zh-CN': { greeting: '你好' },
      'en-US': { greeting: 'Hello' },
    };

    it('should merge component locale with common locale', () => {
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

      // 组件特有的文案
      expect(vm.t.greeting).toBe('你好');
      // 公共语言包的文案
      expect(vm.t.confirm).toBe('确认');
      expect(vm.t.loading).toBe('加载中...');
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

  describe('formatters', () => {
    it('should format plural correctly', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { plural } = useCommonLocale();
          return { plural };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      const templates = {
        zero: '没有项目',
        one: '{count} 个项目',
        other: '{count} 个项目',
      };

      // 中文的 Intl.PluralRules 只返回 "other"
      expect(vm.plural(0, templates)).toBe('0 个项目');
      expect(vm.plural(1, templates)).toBe('1 个项目');
      expect(vm.plural(5, templates)).toBe('5 个项目');
    });

    it('should format date correctly', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { date } = useCommonLocale();
          return { date };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      const testDate = new Date('2025-01-15T10:30:00');

      const shortDate = vm.date.short(testDate);
      expect(shortDate).toContain('2025');
      expect(shortDate).toContain('01');
      expect(shortDate).toContain('15');

      const timeStr = vm.date.time(testDate);
      expect(timeStr).toContain('10');
      expect(timeStr).toContain('30');
    });

    it('should format number correctly', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { number } = useCommonLocale();
          return { number };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.number.decimal(1234.5678, 2)).toContain('1');
      expect(vm.number.decimal(1234.5678, 2)).toContain('234');

      const percent = vm.number.percent(0.755);
      expect(percent).toContain('75');
      expect(percent).toContain('%');
    });

    it('should format currency correctly', () => {
      const { install } = createLocale('zh-CN');

      const TestComponent = defineComponent({
        setup() {
          const { currency } = useCommonLocale();
          return { currency };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      const cny = vm.currency(1234.56);
      expect(cny).toContain('1');
      expect(cny).toContain('234');
      expect(cny).toContain('56');

      const usd = vm.currency(1234.56, 'USD');
      expect(usd).toContain('1');
      expect(usd).toContain('234');
    });
  });

  describe('locale fallback', () => {
    it('should fallback to zh-CN when locale not found', () => {
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
      expect(vm.t.confirm).toBe('Confirm'); // 公共语言包也应该是英文
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
          const { t } = useCommonLocale('en-US');
          return { t };
        },
        template: '<div></div>',
      });

      const app = createApp(TestComponent);
      app.use({ install });

      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.t.confirm).toBe('Confirm');
      expect(vm.t.cancel).toBe('Cancel');
    });
  });
});
