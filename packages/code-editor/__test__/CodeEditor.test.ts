import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { CodeEditor } from '../src';

describe('CodeEditor 组件', () => {
  describe('渲染测试', () => {
    it('应该正确渲染根元素', () => {
      const wrapper = mount(CodeEditor);
      expect(wrapper.classes()).toContain('aix-code-editor');
    });

    it('应该包含编辑器挂载容器', () => {
      const wrapper = mount(CodeEditor);
      expect(wrapper.find('.aix-code-editor__content').exists()).toBe(true);
    });
  });

  describe('Props 测试', () => {
    it('disabled 时应添加禁用 class', () => {
      const wrapper = mount(CodeEditor, {
        props: { disabled: true },
      });
      expect(wrapper.classes()).toContain('aix-code-editor--disabled');
    });

    it('readonly 时应添加只读 class', () => {
      const wrapper = mount(CodeEditor, {
        props: { readonly: true },
      });
      expect(wrapper.classes()).toContain('aix-code-editor--readonly');
    });

    it('默认应有 100px 最小高度', () => {
      const wrapper = mount(CodeEditor);
      expect(wrapper.attributes('style')).toContain('min-height: 100px');
    });

    it('应正确应用 height 样式', () => {
      const wrapper = mount(CodeEditor, {
        props: { height: '400px' },
      });
      expect(wrapper.attributes('style')).toContain('height: 400px');
    });

    it('设置 height 时应忽略 minHeight 和 maxHeight', () => {
      const wrapper = mount(CodeEditor, {
        props: { height: '400px', minHeight: '200px', maxHeight: '600px' },
      });
      const style = wrapper.attributes('style') ?? '';
      expect(style).toContain('height: 400px');
      expect(style).not.toContain('min-height');
      expect(style).not.toContain('max-height');
    });

    it('应正确应用 maxHeight 样式', () => {
      const wrapper = mount(CodeEditor, {
        props: { maxHeight: '600px' },
      });
      expect(wrapper.attributes('style')).toContain('max-height: 600px');
    });
  });

  describe('Expose 测试', () => {
    it('应暴露完整的编程式 API', () => {
      const wrapper = mount(CodeEditor);
      const vm = wrapper.vm as unknown as Record<string, unknown>;

      // 状态
      expect(vm.editorView).toBeDefined();
      expect(vm.isFocused).toBeDefined();

      // 方法
      const methods = [
        'getValue',
        'setValue',
        'focus',
        'blur',
        'getSelection',
        'replaceSelection',
        'insert',
        'undo',
        'redo',
        'getLineCount',
        'getCursorPosition',
      ];
      for (const method of methods) {
        expect(typeof vm[method]).toBe('function');
      }
    });

    it('编辑器初始化前 API 应安全返回默认值', () => {
      const wrapper = mount(CodeEditor);
      const vm = wrapper.vm as unknown as Record<string, (...args: unknown[]) => unknown>;

      // 编辑器异步初始化，同步调用应安全返回默认值
      expect(vm.getValue!()).toBe('');
      expect(vm.getLineCount!()).toBe(0);
      expect(vm.getCursorPosition!()).toEqual({ line: 0, col: 0 });
      expect(vm.getSelection!()).toBe('');
    });
  });

  describe('快照测试', () => {
    it('默认状态快照', () => {
      const wrapper = mount(CodeEditor);
      expect(wrapper.html()).toMatchSnapshot();
    });
  });
});
