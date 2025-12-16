/**
 * @fileoverview Text 渲染器 Stories
 * 展示纯文本渲染的各种用法
 */

import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, onMounted, onUnmounted } from 'vue';
import { ContentRenderer, setup } from '../src';

// 确保初始化
setup({ preset: 'basic' });

const meta: Meta<typeof ContentRenderer> = {
  title: 'ChatUI/Renderers/Text',
  component: ContentRenderer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Text 渲染器是最基础的渲染器，用于显示纯文本内容。它会保留换行和空白字符，同时对特殊字符进行转义以防止 XSS 攻击。',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础文本
 */
export const BasicText: Story = {
  args: {
    content: '这是一段普通的纯文本内容，没有任何格式化。',
    type: 'text',
    theme: 'light',
  },
};

/**
 * 多行文本
 */
export const MultilineText: Story = {
  args: {
    content: `这是第一行文本
这是第二行文本
这是第三行文本

这里有一个空行在上面

    这行有缩进`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * 长文本
 */
export const LongText: Story = {
  args: {
    content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo. Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores eos qui ratione voluptatem sequi nesciunt.`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * 特殊字符转义
 */
export const SpecialCharacters: Story = {
  args: {
    content: `特殊字符测试:
< 小于号
> 大于号
& 和号
" 双引号
' 单引号

HTML 标签测试 (应该显示为文本):
<script>alert('XSS')</script>
<div onclick="alert('click')">点击</div>
<img src="x" onerror="alert('error')">`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * 中文文本
 */
export const ChineseText: Story = {
  args: {
    content: `人工智能（Artificial Intelligence，简称 AI）是计算机科学的一个分支，它企图了解智能的实质，并生产出一种新的能以人类智能相似的方式做出反应的智能机器。

人工智能的研究包括：
- 机器人学
- 自然语言处理
- 计算机视觉
- 专家系统
- 机器学习

这些领域的发展正在深刻改变我们的生活方式。`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * Unicode 和 Emoji
 */
export const UnicodeAndEmoji: Story = {
  args: {
    content: `Emoji 测试: 😀 🎉 🚀 ❤️ 👍 🌍 🎨 🔥

特殊 Unicode 字符:
数学符号: ∑ ∏ √ ∞ ∈ ∉ ⊂ ⊃
箭头: → ← ↑ ↓ ↔ ⇒ ⇐
希腊字母: α β γ δ ε ζ η θ
日文: こんにちは
韩文: 안녕하세요
阿拉伯文: مرحبا`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * 空白字符保留
 */
export const WhitespacePreservation: Story = {
  args: {
    content: `保留空白字符测试:

单词之间    有多个空格

制表符分隔:	第一列	第二列	第三列

    四个空格缩进
        八个空格缩进
            十二个空格缩进`,
    type: 'text',
    theme: 'light',
  },
};

/**
 * 流式文本演示
 */
export const StreamingText: Story = {
  render: () => ({
    components: { ContentRenderer },
    setup() {
      const content = ref('');
      const streaming = ref(true);
      let intervalId: ReturnType<typeof setInterval>;

      const fullContent = `正在处理您的请求...

分析数据中...
- 读取输入参数
- 验证数据格式
- 执行计算逻辑

计算完成！

结果: 42

这是一个纯文本流式输出的演示，展示了文本是如何逐字符显示的。`;

      let charIndex = 0;

      onMounted(() => {
        intervalId = setInterval(() => {
          if (charIndex < fullContent.length) {
            content.value = fullContent.slice(0, charIndex + 1);
            charIndex++;
          } else {
            streaming.value = false;
            clearInterval(intervalId);
          }
        }, 50);
      });

      onUnmounted(() => {
        if (intervalId) clearInterval(intervalId);
      });

      return { content, streaming };
    },
    template: `
      <div style="padding: 16px; background: #f5f5f5; border-radius: 8px;">
        <div style="margin-bottom: 8px; font-size: 12px; color: #666;">
          {{ streaming ? '⏳ 正在输出...' : '✅ 输出完成' }}
        </div>
        <ContentRenderer
          :content="content"
          type="text"
          :streaming="{ hasNextChunk: streaming }"
          theme="light"
        />
      </div>
    `,
  }),
};

/**
 * 暗色主题
 */
export const DarkTheme: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="padding: 24px; background: #1a1a1a; border-radius: 8px; color: #e5e7eb;" data-theme="dark">
        <ContentRenderer
          content="这是暗色主题下的纯文本显示效果。\n\n支持多行文本和换行。"
          type="text"
          theme="dark"
        />
      </div>
    `,
  }),
};

/**
 * 自动类型检测对比
 */
export const AutoDetectionComparison: Story = {
  render: () => ({
    components: { ContentRenderer },
    template: `
      <div style="display: flex; flex-direction: column; gap: 24px;">
        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #333;">
            强制 Text 类型 (不解析 Markdown)
          </h3>
          <div style="border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px;">
            <ContentRenderer
              content="# 这是标题\n**粗体** 和 *斜体*\n- 列表项"
              type="text"
            />
          </div>
        </section>

        <section>
          <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #333;">
            自动检测 (解析为 Markdown)
          </h3>
          <div style="border: 1px solid #e5e7eb; padding: 16px; border-radius: 8px;">
            <ContentRenderer
              content="# 这是标题\n**粗体** 和 *斜体*\n- 列表项"
            />
          </div>
        </section>
      </div>
    `,
  }),
};

/**
 * 代码片段展示（作为纯文本）
 */
export const CodeAsText: Story = {
  args: {
    content: `function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// 计算前10个斐波那契数
for (let i = 0; i < 10; i++) {
  console.log(fibonacci(i));
}`,
    type: 'text',
    theme: 'light',
  },
};
