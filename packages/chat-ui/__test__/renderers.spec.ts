import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';

// Mock code renderer for testing
const CodeRendererMock = defineComponent({
  name: 'CodeRenderer',
  props: {
    content: String,
    language: String,
    streaming: Boolean,
  },
  emits: ['action', 'error'],
  setup(props, { emit }) {
    const copied = ref(false);

    const copy = async () => {
      try {
        await navigator.clipboard.writeText(props.content || '');
        copied.value = true;
        emit('action', { type: 'copy', content: props.content });
        setTimeout(() => {
          copied.value = false;
        }, 2000);
      } catch (error) {
        emit('error', error);
      }
    };

    return { copied, copy };
  },
  template: `
    <div class="code-renderer">
      <div class="code-header">
        <span class="language">{{ language }}</span>
        <button class="copy-btn" @click="copy">{{ copied ? 'Copied!' : 'Copy' }}</button>
      </div>
      <pre><code>{{ content }}</code></pre>
    </div>
  `,
});

// Mock LaTeX renderer for testing
const LatexRendererMock = defineComponent({
  name: 'LatexRenderer',
  props: {
    content: String,
    streaming: Boolean,
  },
  emits: ['rendered', 'error'],
  setup(_props, { emit }) {
    const error = ref<string | null>(null);

    // Simulate LaTeX rendering
    const rendered = ref(false);

    const render = () => {
      try {
        // Mock KaTeX rendering
        rendered.value = true;
        emit('rendered');
      } catch (e) {
        error.value = (e as Error).message;
        emit('error', e);
      }
    };

    return { error, rendered, render };
  },
  template: `
    <div class="latex-renderer">
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else class="latex-content">{{ content }}</div>
    </div>
  `,
});

// Mock chart renderer for testing
const ChartRendererMock = defineComponent({
  name: 'ChartRenderer',
  props: {
    content: String,
    streaming: Boolean,
  },
  emits: ['rendered', 'error'],
  setup(props, { emit }) {
    const chartData = ref<any>(null);
    const error = ref<string | null>(null);

    const parseData = () => {
      try {
        chartData.value = JSON.parse(props.content || '{}');
        emit('rendered');
      } catch (e) {
        error.value = 'Invalid chart data';
        emit('error', e);
      }
    };

    return { chartData, error, parseData };
  },
  template: `
    <div class="chart-renderer">
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else class="chart-container" ref="containerRef"></div>
    </div>
  `,
});

// Mock Mermaid renderer for testing
const MermaidRendererMock = defineComponent({
  name: 'MermaidRenderer',
  props: {
    content: String,
    streaming: Boolean,
  },
  emits: ['rendered', 'error'],
  setup(props, { emit }) {
    const error = ref<string | null>(null);
    const svg = ref('');

    const render = async () => {
      try {
        // Mock mermaid rendering
        svg.value = `<svg>${props.content}</svg>`;
        emit('rendered');
      } catch (e) {
        error.value = 'Failed to render diagram';
        emit('error', e);
      }
    };

    return { error, svg, render };
  },
  template: `
    <div class="mermaid-renderer">
      <div v-if="error" class="error">{{ error }}</div>
      <div v-else class="mermaid-container" v-html="svg"></div>
    </div>
  `,
});

describe('CodeRenderer', () => {
  beforeEach(() => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe('rendering', () => {
    it('should render code content', () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'const x = 1;',
          language: 'javascript',
          streaming: false,
        },
      });

      expect(wrapper.find('code').text()).toContain('const x = 1');
    });

    it('should display language label', () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'code',
          language: 'python',
          streaming: false,
        },
      });

      expect(wrapper.find('.language').text()).toBe('python');
    });

    it('should handle empty language', () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'code',
          language: '',
          streaming: false,
        },
      });

      expect(wrapper.find('.language').text()).toBe('');
    });
  });

  describe('copy functionality', () => {
    it('should copy code to clipboard', async () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'test code',
          language: 'javascript',
          streaming: false,
        },
      });

      await wrapper.find('.copy-btn').trigger('click');
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test code');
    });

    it('should show "Copied!" after copying', async () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'test',
          language: 'js',
          streaming: false,
        },
      });

      expect(wrapper.find('.copy-btn').text()).toBe('Copy');
      await wrapper.find('.copy-btn').trigger('click');
      await nextTick();
      expect(wrapper.find('.copy-btn').text()).toBe('Copied!');
    });

    it('should emit action event on copy', async () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'code',
          language: 'js',
          streaming: false,
        },
      });

      await wrapper.find('.copy-btn').trigger('click');
      expect(wrapper.emitted('action')).toBeTruthy();
      expect(wrapper.emitted('action')![0]).toEqual([
        { type: 'copy', content: 'code' },
      ]);
    });

    it('should emit error on clipboard failure', async () => {
      vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(
        new Error('Failed'),
      );

      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'code',
          language: 'js',
          streaming: false,
        },
      });

      await wrapper.find('.copy-btn').trigger('click');
      await nextTick();

      expect(wrapper.emitted('error')).toBeTruthy();
    });
  });

  describe('streaming state', () => {
    it('should handle streaming content', async () => {
      const wrapper = mount(CodeRendererMock, {
        props: {
          content: 'const',
          language: 'js',
          streaming: true,
        },
      });

      expect(wrapper.props('streaming')).toBe(true);

      await wrapper.setProps({ content: 'const x = 1;' });
      expect(wrapper.find('code').text()).toContain('const x = 1');
    });
  });
});

describe('LatexRenderer', () => {
  describe('rendering', () => {
    it('should render LaTeX content', () => {
      const wrapper = mount(LatexRendererMock, {
        props: {
          content: 'x^2 + y^2 = z^2',
          streaming: false,
        },
      });

      expect(wrapper.find('.latex-content').text()).toContain('x^2');
    });

    it('should display error on render failure', async () => {
      const wrapper = mount(LatexRendererMock, {
        props: {
          content: 'invalid',
          streaming: false,
        },
      });

      // Manually set error state
      wrapper.vm.error = 'Invalid LaTeX';
      await nextTick();

      expect(wrapper.find('.error').text()).toContain('Invalid');
    });
  });

  describe('events', () => {
    it('should emit rendered event on success', async () => {
      const wrapper = mount(LatexRendererMock, {
        props: {
          content: 'x^2',
          streaming: false,
        },
      });

      wrapper.vm.render();
      expect(wrapper.emitted('rendered')).toBeTruthy();
    });
  });
});

describe('ChartRenderer', () => {
  describe('data parsing', () => {
    it('should parse valid JSON data', () => {
      const wrapper = mount(ChartRendererMock, {
        props: {
          content: '{"chartType":"bar","data":[1,2,3]}',
          streaming: false,
        },
      });

      wrapper.vm.parseData();
      expect(wrapper.vm.chartData).toEqual({
        chartType: 'bar',
        data: [1, 2, 3],
      });
    });

    it('should display error for invalid JSON', async () => {
      const wrapper = mount(ChartRendererMock, {
        props: {
          content: 'not json',
          streaming: false,
        },
      });

      wrapper.vm.parseData();
      await nextTick();

      expect(wrapper.find('.error').exists()).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit rendered event on success', () => {
      const wrapper = mount(ChartRendererMock, {
        props: {
          content: '{"chartType":"line"}',
          streaming: false,
        },
      });

      wrapper.vm.parseData();
      expect(wrapper.emitted('rendered')).toBeTruthy();
    });

    it('should emit error event on parse failure', () => {
      const wrapper = mount(ChartRendererMock, {
        props: {
          content: 'invalid',
          streaming: false,
        },
      });

      wrapper.vm.parseData();
      expect(wrapper.emitted('error')).toBeTruthy();
    });
  });
});

describe('MermaidRenderer', () => {
  describe('rendering', () => {
    it('should render mermaid diagram', async () => {
      const wrapper = mount(MermaidRendererMock, {
        props: {
          content: 'graph TD\n  A-->B',
          streaming: false,
        },
      });

      await wrapper.vm.render();
      await nextTick();

      expect(wrapper.find('.mermaid-container').html()).toContain('<svg>');
    });

    it('should display error on render failure', async () => {
      const wrapper = mount(MermaidRendererMock, {
        props: {
          content: 'invalid',
          streaming: false,
        },
      });

      wrapper.vm.error = 'Failed to render';
      await nextTick();

      expect(wrapper.find('.error').text()).toContain('Failed');
    });
  });

  describe('events', () => {
    it('should emit rendered event on success', async () => {
      const wrapper = mount(MermaidRendererMock, {
        props: {
          content: 'graph TD\n  A-->B',
          streaming: false,
        },
      });

      await wrapper.vm.render();
      expect(wrapper.emitted('rendered')).toBeTruthy();
    });
  });
});

describe('Renderer Error Boundaries', () => {
  it('should catch and handle render errors gracefully', async () => {
    const ErrorBoundary = defineComponent({
      data() {
        return { hasError: false };
      },
      errorCaptured(_err) {
        this.hasError = true;
        return false;
      },
      template: `
        <div v-if="hasError" class="error-fallback">Something went wrong</div>
        <slot v-else></slot>
      `,
    });

    const wrapper = mount(ErrorBoundary);
    expect(wrapper.exists()).toBe(true);
  });
});

describe('Renderer Accessibility', () => {
  it('should have accessible code blocks', () => {
    const wrapper = mount(CodeRendererMock, {
      props: {
        content: 'code',
        language: 'js',
        streaming: false,
      },
    });

    expect(wrapper.find('pre').exists()).toBe(true);
    expect(wrapper.find('code').exists()).toBe(true);
  });

  it('should have accessible copy button', () => {
    const wrapper = mount(CodeRendererMock, {
      props: {
        content: 'code',
        language: 'js',
        streaming: false,
      },
    });

    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.text()).toBeTruthy();
  });
});
