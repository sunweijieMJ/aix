/**
 * @fileoverview Plugin System Stories
 * 展示插件系统的使用方法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, computed, defineComponent, h } from 'vue';
import {
  setup,
  resetSetup,
  getInstalledPluginNames,
  ContentRenderer,
} from '../src';

// 重置并初始化
resetSetup();
setup({ preset: 'standard' });

const meta: Meta = {
  title: 'ChatUI/PluginSystem',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
插件系统允许你扩展 chat-ui 的渲染能力。

## 预设插件集

- **basic**: text + markdown（轻量）
- **standard**: basic + code + latex（推荐）
- **full**: standard + chart + mermaid（完整）

## 自定义插件

你可以创建自定义插件来支持新的内容类型。
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 预设插件集说明
 */
export const PluginPresets: Story = {
  render: () => ({
    setup() {
      const presets = [
        {
          name: 'basic',
          plugins: ['text', 'markdown'],
          description: '基础预设，适合简单文本渲染',
        },
        {
          name: 'standard',
          plugins: ['text', 'markdown', 'code', 'latex'],
          description: '标准预设，适合大多数 AI 对话场景',
        },
        {
          name: 'full',
          plugins: ['text', 'markdown', 'code', 'latex', 'chart'],
          description: '完整预设，包含所有内置渲染器',
        },
      ];

      return { presets };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="margin: 0;">插件预设</h3>
        <div
          v-for="preset in presets"
          :key="preset.name"
          style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px;"
        >
          <h4 style="margin: 0 0 8px 0;">
            {{ preset.name }}
            <span style="font-weight: normal; color: #666; font-size: 14px;">
              - {{ preset.description }}
            </span>
          </h4>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <span
              v-for="plugin in preset.plugins"
              :key="plugin"
              style="
                padding: 4px 8px;
                background: #f0f9ff;
                color: #0369a1;
                border-radius: 4px;
                font-size: 12px;
              "
            >
              {{ plugin }}
            </span>
          </div>
        </div>

        <div style="padding: 12px; background: #fffbeb; border-radius: 8px; font-size: 14px;">
          <strong>使用方法：</strong>
          <pre style="margin: 8px 0 0 0; padding: 8px; background: #fef3c7; border-radius: 4px; font-size: 12px;">
import { setup } from '@aix/chat-ui';

// 选择预设
setup({ preset: 'standard' });
          </pre>
        </div>
      </div>
    `,
  }),
};

/**
 * 已安装插件
 */
export const InstalledPlugins: Story = {
  render: () => ({
    setup() {
      const installedPlugins = ref(getInstalledPluginNames());

      return { installedPlugins };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="margin: 0;">当前已安装的插件</h3>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <span
            v-for="name in installedPlugins"
            :key="name"
            style="
              padding: 8px 12px;
              background: #ecfdf5;
              color: #059669;
              border-radius: 4px;
              font-size: 14px;
              display: flex;
              align-items: center;
              gap: 4px;
            "
          >
            <span style="font-size: 12px;">✓</span>
            {{ name }}
          </span>
        </div>
        <p style="margin: 0; color: #666; font-size: 14px;">
          共 {{ installedPlugins.length }} 个插件已安装
        </p>
      </div>
    `,
  }),
};

/**
 * 自定义插件示例
 */
export const CustomPluginDemo: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const content = ref('');
      const customType = ref('');

      // 创建一个自定义的 "提示" 渲染器（仅用于展示代码示例）
      // @ts-expect-error 仅用于展示代码示例，变量故意未使用
      const _TipRenderer = defineComponent({
        props: ['block', 'data'],
        setup(props) {
          const tipType = computed(() => {
            const raw = props.block?.raw || '';
            if (raw.includes('warning')) return 'warning';
            if (raw.includes('error')) return 'error';
            if (raw.includes('success')) return 'success';
            return 'info';
          });

          const colors = {
            info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af' },
            warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
            error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
            success: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
          };

          const icons = {
            info: 'info',
            warning: '!',
            error: 'X',
            success: '!',
          };

          return () =>
            h(
              'div',
              {
                style: {
                  padding: '12px 16px',
                  background: colors[tipType.value].bg,
                  borderLeft: `4px solid ${colors[tipType.value].border}`,
                  borderRadius: '0 4px 4px 0',
                  color: colors[tipType.value].text,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                },
              },
              [
                h(
                  'span',
                  {
                    style: {
                      fontWeight: 'bold',
                      fontSize: '14px',
                    },
                  },
                  icons[tipType.value],
                ),
                h('span', props.data?.message || props.block?.raw || ''),
              ],
            );
        },
      });

      // 自定义插件代码示例
      const pluginCode = `// 创建自定义插件
const tipPlugin = createPlugin('tip', {
  name: 'tip',
  type: 'custom:tip',
  priority: 50,
  streaming: false,
  description: '提示信息渲染器',

  // 内容检测函数
  detector: (raw) => raw.startsWith('[TIP]'),

  // 内容解析函数
  parser: (raw) => {
    const match = raw.match(/\\[TIP:(\\w+)\\]\\s*(.+)/);
    return {
      type: match?.[1] || 'info',
      message: match?.[2] || raw,
    };
  },

  // 渲染组件
  component: TipRenderer,
});

// 安装插件
installPlugin(tipPlugin);`;

      return {
        content,
        customType,
        pluginCode,
      };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <div>
          <h3 style="margin: 0 0 12px 0;">创建自定义插件</h3>
          <p style="color: #666; font-size: 14px; margin: 0 0 16px 0;">
            以下示例展示如何创建一个自定义的 "提示信息" 渲染器插件：
          </p>
        </div>

        <div style="background: #1e1e1e; border-radius: 8px; overflow: hidden;">
          <div style="padding: 8px 12px; background: #2d2d2d; color: #9ca3af; font-size: 12px;">
            plugin.ts
          </div>
          <pre style="margin: 0; padding: 16px; color: #d4d4d4; font-size: 13px; overflow-x: auto;"><code>{{ pluginCode }}</code></pre>
        </div>

        <div>
          <h4 style="margin: 0 0 12px 0;">插件结构说明</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="background: #f5f5f5;">
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">属性</th>
                <th style="padding: 8px; text-align: left; border: 1px solid #e5e7eb;">说明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>name</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">插件唯一标识</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>type</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">处理的内容类型</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>detector</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">检测内容是否匹配此渲染器</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>parser</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">解析原始内容为数据对象</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>component</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">渲染组件</td>
              </tr>
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb;"><code>priority</code></td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">优先级，数值越大越先匹配</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `,
  }),
};

/**
 * 自定义预设
 */
export const CustomPreset: Story = {
  render: () => ({
    setup() {
      const presetCode = `// 基于标准预设，排除 latex，添加自定义插件
const myPreset = createPluginPreset('standard', {
  exclude: ['latex'],
  extra: [myCustomPlugin],
});

// 使用自定义预设
installPlugins(myPreset);`;

      return { presetCode };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="margin: 0;">创建自定义预设</h3>
        <p style="color: #666; font-size: 14px; margin: 0;">
          你可以基于内置预设创建自定义预设，添加或排除特定插件：
        </p>

        <div style="background: #1e1e1e; border-radius: 8px; padding: 16px;">
          <pre style="margin: 0; color: #d4d4d4; font-size: 13px;"><code>{{ presetCode }}</code></pre>
        </div>

        <div style="padding: 12px; background: #f0f9ff; border-radius: 8px;">
          <strong style="color: #0369a1;">API 说明</strong>
          <pre style="margin: 8px 0 0 0; font-size: 12px; color: #0369a1;">
createPluginPreset(
  base: 'basic' | 'standard' | 'full',
  options?: {
    exclude?: string[],  // 要排除的插件名称
    extra?: Plugin[],    // 要添加的额外插件
  }
): Plugin[]
          </pre>
        </div>
      </div>
    `,
  }),
};

/**
 * 插件生命周期
 */
export const PluginLifecycle: Story = {
  render: () => ({
    setup() {
      const lifecycleCode = `const myPlugin = {
  name: 'my-plugin',
  renderers: [...],

  // 安装时调用
  install: (registry) => {
    console.log('Plugin installing...');
    // 可以在这里进行额外的初始化
    registry.register(myRenderer);
  },

  // 卸载时调用
  uninstall: (registry) => {
    console.log('Plugin uninstalling...');
    // 清理资源
    registry.unregister('my-renderer');
  },

  // 依赖的其他插件
  dependencies: ['text', 'markdown'],
};`;

      return { lifecycleCode };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <h3 style="margin: 0;">插件生命周期</h3>

        <div style="background: #1e1e1e; border-radius: 8px; padding: 16px;">
          <pre style="margin: 0; color: #d4d4d4; font-size: 13px;"><code>{{ lifecycleCode }}</code></pre>
        </div>

        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
          <div style="padding: 12px; background: #ecfdf5; border-radius: 8px;">
            <strong style="color: #059669;">install</strong>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #059669;">
              插件安装时执行，用于注册渲染器和初始化
            </p>
          </div>
          <div style="padding: 12px; background: #fef2f2; border-radius: 8px;">
            <strong style="color: #dc2626;">uninstall</strong>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #dc2626;">
              插件卸载时执行，用于清理资源
            </p>
          </div>
          <div style="padding: 12px; background: #eff6ff; border-radius: 8px;">
            <strong style="color: #2563eb;">dependencies</strong>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #2563eb;">
              声明依赖的其他插件
            </p>
          </div>
        </div>
      </div>
    `,
  }),
};
