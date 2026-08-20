import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, nextTick, ref, type ComponentPublicInstance } from 'vue';
import {
  createLocale,
  useLocale,
  useCommonLocale,
  formatMessage,
  type ComponentLocale,
} from '../src/index';

// 通过模块增强注册测试切片：既让 createLocale({ messages }) 获得类型校验，
// 也回归验证「接口直接声明在包根入口、增强可以合并」这一设计前提
declare module '../src/index' {
  interface AixLocaleMessagesMap {
    'test-pkg': { greeting: string; farewell: string };
  }
}

// 辅助类型：测试中 app.mount() 返回的 VM 实例类型
type TestVM<T = Record<string, any>> = ComponentPublicInstance & T;

const testLocale: ComponentLocale<{ greeting: string; farewell: string }> = {
  'zh-CN': { greeting: '你好', farewell: '再见' },
  'en-US': { greeting: 'Hello', farewell: 'Bye' },
};

/** 挂载一个消费 useLocale 的组件，返回 vm */
function mountWithLocale(
  install: (app: ReturnType<typeof createApp>) => void,
  options: Parameters<typeof useLocale<{ greeting: string; farewell: string }>>[0],
) {
  const TestComponent = defineComponent({
    setup() {
      const { t, locale } = useLocale(options);
      return { t, locale };
    },
    template: '<div></div>',
  });
  const app = createApp(TestComponent);
  app.use({ install });
  return app.mount(document.createElement('div')) as TestVM;
}

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

    it('should setLocale correctly when method is destructured', () => {
      const { localeContext } = createLocale('zh-CN');
      // 解构调用：setLocale 脱离 localeContext 上下文，验证不依赖 this 也能正常更新
      const { setLocale } = localeContext;
      setLocale('en-US');
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

    it('should support override locale', () => {
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

  describe('useLocale with component locale', () => {
    it('should return component locale texts', () => {
      const { install } = createLocale('zh-CN');
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });
      expect(vm.t.greeting).toBe('你好');
    });

    it('should switch component locale correctly', async () => {
      const { localeContext, install } = createLocale('zh-CN');
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });

      expect(vm.t.greeting).toBe('你好');

      localeContext.setLocale('en-US');
      await nextTick();

      expect(vm.t.greeting).toBe('Hello');
    });

    it('should fallback to zh-CN when no provider', () => {
      const TestComponent = defineComponent({
        setup() {
          const { t, locale } = useLocale({ name: 'test-pkg', messages: testLocale });
          return { t, locale };
        },
        template: '<div></div>',
      });
      const app = createApp(TestComponent);
      const vm = app.mount(document.createElement('div')) as TestVM;

      expect(vm.locale).toBe('zh-CN');
      expect(vm.t.greeting).toBe('你好');
    });
  });

  describe('locale override', () => {
    it('should use override locale instead of global locale', () => {
      const { install } = createLocale('zh-CN');
      // 全局是中文，但组件覆盖为英文
      const vm = mountWithLocale(install, {
        name: 'test-pkg',
        messages: testLocale,
        overrideLocale: 'en-US',
      });
      expect(vm.t.greeting).toBe('Hello');
    });

    it('should prioritize override locale over global locale change', async () => {
      const { localeContext, install } = createLocale('zh-CN');
      const vm = mountWithLocale(install, {
        name: 'test-pkg',
        messages: testLocale,
        overrideLocale: 'en-US',
      });

      expect(vm.t.greeting).toBe('Hello');

      localeContext.setLocale('zh-CN');
      await nextTick();

      // 组件应该仍然显示英文（因为有 override）
      expect(vm.t.greeting).toBe('Hello');
    });

    it('should track override when passed as a reactive Ref', async () => {
      const { install } = createLocale('zh-CN');

      const overrideRef = ref<'zh-CN' | 'en-US'>('en-US');
      const vm = mountWithLocale(install, {
        name: 'test-pkg',
        messages: testLocale,
        overrideLocale: overrideRef,
      });

      expect(vm.t.greeting).toBe('Hello');

      // 动态修改 override Ref，组件文案应跟随切换
      overrideRef.value = 'zh-CN';
      await nextTick();

      expect(vm.t.greeting).toBe('你好');
    });
  });

  describe('messages override（应用级 + 实例级）', () => {
    it('should apply app-level messages from createLocale', () => {
      const { install } = createLocale('zh-CN', {
        messages: { 'test-pkg': { 'zh-CN': { greeting: '您好' } } },
      });
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });

      // 覆盖的 key 生效，未覆盖的 key 回退内置
      expect(vm.t.greeting).toBe('您好');
      expect(vm.t.farewell).toBe('再见');
    });

    it('should only apply app-level messages of matching locale', async () => {
      const { localeContext, install } = createLocale('zh-CN', {
        messages: { 'test-pkg': { 'zh-CN': { greeting: '您好' } } },
      });
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });

      expect(vm.t.greeting).toBe('您好');

      // 切到英文：zh-CN 的覆盖不应泄漏
      localeContext.setLocale('en-US');
      await nextTick();
      expect(vm.t.greeting).toBe('Hello');
    });

    it('should not leak messages across package names', () => {
      const { install } = createLocale('zh-CN', {
        // 增强类型只注册了 test-pkg，这里模拟另一个包的切片（宽松断言绕过类型）
        messages: { 'other-pkg': { 'zh-CN': { greeting: '别的包' } } } as never,
      });
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });
      expect(vm.t.greeting).toBe('你好');
    });

    it('should apply instance-level overrideMessages with highest priority', () => {
      const { install } = createLocale('zh-CN', {
        messages: { 'test-pkg': { 'zh-CN': { greeting: '您好', farewell: '告辞' } } },
      });
      const vm = mountWithLocale(install, {
        name: 'test-pkg',
        messages: testLocale,
        overrideMessages: { greeting: '嗨' },
      });

      // 实例级 > 应用级 > 内置
      expect(vm.t.greeting).toBe('嗨');
      expect(vm.t.farewell).toBe('告辞');
    });

    it('should track reactive overrideMessages', async () => {
      const { install } = createLocale('zh-CN');
      const override = ref<{ greeting?: string } | undefined>(undefined);
      const vm = mountWithLocale(install, {
        name: 'test-pkg',
        messages: testLocale,
        overrideMessages: override,
      });

      expect(vm.t.greeting).toBe('你好');

      override.value = { greeting: '嗨' };
      await nextTick();
      expect(vm.t.greeting).toBe('嗨');
    });

    it('createLocale 不持有调用方 messages 对象引用：mergeMessages 不污染入参', () => {
      const shared = { 'test-pkg': { 'zh-CN': { greeting: '您好' } } };
      const { localeContext } = createLocale('zh-CN', { messages: shared });
      localeContext.mergeMessages({ 'test-pkg': { 'en-US': { greeting: 'Hi' } } });
      // 上下文里合并生效，但调用方的对象保持原样（可安全复用于第二个实例）
      expect(localeContext.messages['test-pkg']?.['en-US']).toEqual({ greeting: 'Hi' });
      expect(shared).toEqual({ 'test-pkg': { 'zh-CN': { greeting: '您好' } } });
    });

    it('should merge messages incrementally via mergeMessages', async () => {
      const { localeContext, install } = createLocale('zh-CN', {
        messages: { 'test-pkg': { 'zh-CN': { greeting: '您好' } } },
      });
      const vm = mountWithLocale(install, { name: 'test-pkg', messages: testLocale });

      expect(vm.t.greeting).toBe('您好');

      // 模拟异步拉取文案后合入：同包同语言按 key 浅合并，不整体替换
      localeContext.mergeMessages({ 'test-pkg': { 'zh-CN': { farewell: '告辞' } } });
      await nextTick();
      expect(vm.t.greeting).toBe('您好');
      expect(vm.t.farewell).toBe('告辞');

      // 后写的同 key 覆盖先写的
      localeContext.mergeMessages({ 'test-pkg': { 'zh-CN': { greeting: '幸会' } } });
      await nextTick();
      expect(vm.t.greeting).toBe('幸会');
    });
  });

  describe('formatMessage', () => {
    it('should replace single placeholder', () => {
      expect(formatMessage('共 {total} 条', { total: 100 })).toBe('共 100 条');
    });

    it('should replace multiple placeholders', () => {
      expect(formatMessage('{count} of {total} items', { count: 1, total: 10 })).toBe(
        '1 of 10 items',
      );
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
      expect(formatMessage('No placeholders here', {})).toBe('No placeholders here');
    });
  });
});
