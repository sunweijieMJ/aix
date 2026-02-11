import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import { Subtitle } from '../src/index';
import type { SubtitleCue, SubtitleSource } from '../src/types';

// 测试字幕数据
const SAMPLE_CUES: SubtitleCue[] = [
  { id: '1', startTime: 0, endTime: 3, text: '欢迎使用 AIX Subtitle 字幕组件' },
  {
    id: '2',
    startTime: 3,
    endTime: 6,
    text: '支持 VTT、SRT、JSON、SBV、ASS 五种格式',
  },
  { id: '3', startTime: 6, endTime: 9, text: '可自定义样式、位置和背景效果' },
  { id: '4', startTime: 9, endTime: 12, text: '支持长文本自动分段轮播显示' },
  { id: '5', startTime: 12, endTime: 15, text: '完美配合视频播放器使用' },
];

// 长文本测试数据
const LONG_TEXT_CUES: SubtitleCue[] = [
  {
    id: '1',
    startTime: 0,
    endTime: 10,
    text: '这是一段非常长的字幕文本，用于测试自动分段功能。当字幕内容超出显示区域时，组件会自动将文本分成多个段落，并按照设定的时间间隔轮播显示。这样可以确保用户能够完整阅读所有内容，同时不会遮挡太多视频画面。',
  },
  {
    id: '2',
    startTime: 10,
    endTime: 20,
    text: '分段功能会智能识别句子边界，尽量不在句子中间截断。支持中文标点符号识别，如句号、问号、感叹号等。如果单个句子过长，也会按字符宽度强制截断，确保显示效果。',
  },
];

// VTT 格式示例
const VTT_CONTENT = `WEBVTT

00:00:00.000 --> 00:00:03.000
欢迎使用 AIX Subtitle 字幕组件

00:00:03.000 --> 00:00:06.000
这是 VTT 格式的字幕示例

00:00:06.000 --> 00:00:09.000
VTT 是 Web 标准的字幕格式
`;

// SRT 格式示例
const SRT_CONTENT = `1
00:00:00,000 --> 00:00:03,000
欢迎使用 AIX Subtitle 字幕组件

2
00:00:03,000 --> 00:00:06,000
这是 SRT 格式的字幕示例

3
00:00:06,000 --> 00:00:09,000
SRT 是最常见的字幕格式
`;

// ASS 格式示例
const ASS_CONTENT = `[Script Info]
Title: AIX Subtitle Demo
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, Bold, Italic
Style: Default,Arial,20,&H00FFFFFF,0,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:03.00,Default,,0,0,0,,欢迎使用 AIX Subtitle 字幕组件
Dialogue: 0,0:00:03.00,0:00:06.00,Default,,0,0,0,,这是 ASS 格式的字幕示例
Dialogue: 0,0:00:06.00,0:00:09.00,Default,,0,0,0,,ASS 支持丰富的样式标签
`;

const meta: Meta<typeof Subtitle> = {
  title: 'Media/Subtitle',
  component: Subtitle,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
AIX Subtitle 是一个功能强大的 Vue 3 字幕显示组件，支持多种字幕格式和丰富的自定义选项。

## 特性
- **多格式支持**: VTT, SRT, JSON, SBV, ASS/SSA
- **多数据源**: URL 加载、文本解析、直接传入 cues
- **时间同步**: 响应式 currentTime 驱动，与视频播放器完美配合
- **样式定制**: 位置、背景、字号、颜色等全面可定制
- **自动分段**: 长文本自动分段轮播显示
- **CSS 变量**: 支持通过 CSS 变量深度定制样式

## 安装依赖
\`\`\`bash
pnpm add @aix/subtitle
\`\`\`

## 基本使用
\`\`\`vue
<template>
  <Subtitle
    :source="{ type: 'cues', cues: subtitleCues }"
    :current-time="currentTime"
  />
</template>
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    source: {
      description: '字幕来源，支持 URL、文本内容或直接传入 cues',
      table: {
        type: { summary: 'SubtitleSource' },
      },
    },
    currentTime: {
      control: { type: 'range', min: 0, max: 15, step: 0.1 },
      description: '当前播放时间（秒）',
      table: {
        type: { summary: 'number' },
      },
    },
    visible: {
      control: 'boolean',
      description: '是否显示字幕',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    position: {
      control: 'select',
      options: ['top', 'center', 'bottom'],
      description: '字幕位置',
      table: {
        type: { summary: "'top' | 'center' | 'bottom'" },
        defaultValue: { summary: "'bottom'" },
      },
    },
    fontSize: {
      control: { type: 'range', min: 12, max: 40, step: 2 },
      description: '字体大小（px）',
      table: {
        type: { summary: 'number | string' },
        defaultValue: { summary: '20' },
      },
    },
    background: {
      control: 'select',
      options: ['blur', 'solid', 'none'],
      description: '背景样式',
      table: {
        type: { summary: "'blur' | 'solid' | 'none'" },
        defaultValue: { summary: "'blur'" },
      },
    },
    maxWidth: {
      control: 'text',
      description: '最大宽度',
      table: {
        type: { summary: 'number | string' },
        defaultValue: { summary: "'1200px'" },
      },
    },
    singleLine: {
      control: 'boolean',
      description: '是否单行显示（需配合 fixedHeight）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    fixedHeight: {
      control: { type: 'range', min: 30, max: 200, step: 10 },
      description: '固定高度（px），用于计算分段',
      table: {
        type: { summary: 'number' },
      },
    },
    autoSegment: {
      control: 'boolean',
      description: '是否自动分段（长文本轮播）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    segmentDuration: {
      control: { type: 'range', min: 1000, max: 10000, step: 500 },
      description: '每段显示时长（毫秒）',
      table: {
        type: { summary: 'number' },
        defaultValue: { summary: '3000' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法
 * 最简单的字幕显示，通过 cues 直接传入字幕数据
 */
export const Default: Story = {
  args: {
    currentTime: 1,
  },
  render: (args) => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };
      return { args, source };
    },
    template: `
      <div style="
        position: relative;
        width: 100%;
        max-width: 800px;
        height: 300px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border-radius: 8px;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        padding-bottom: 24px;
      ">
        <Subtitle v-bind="args" :source="source" />
      </div>
    `,
  }),
};

/**
 * 时间同步
 * 拖动滑块模拟视频播放，观察字幕变化
 */
export const TimeSync: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const currentTime = ref(0);
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };

      // 模拟播放
      const isPlaying = ref(false);
      let timer: ReturnType<typeof setInterval> | null = null;

      const togglePlay = () => {
        if (isPlaying.value) {
          if (timer) clearInterval(timer);
          isPlaying.value = false;
        } else {
          isPlaying.value = true;
          timer = setInterval(() => {
            currentTime.value += 0.1;
            if (currentTime.value >= 15) {
              currentTime.value = 0;
            }
          }, 100);
        }
      };

      const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
      };

      return { currentTime, source, isPlaying, togglePlay, formatTime };
    },
    template: `
      <div style="max-width: 800px;">
        <div style="
          position: relative;
          width: 100%;
          height: 300px;
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          border-radius: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 24px;
          margin-bottom: 16px;
        ">
          <Subtitle :source="source" :current-time="currentTime" />
        </div>

        <div style="
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: var(--aix-colorBgContainer);
          border: 1px solid var(--aix-colorBorder);
          border-radius: 8px;
        ">
          <button
            @click="togglePlay"
            style="
              padding: 8px 16px;
              background: var(--aix-colorPrimary);
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              min-width: 80px;
            "
          >
            {{ isPlaying ? '暂停' : '播放' }}
          </button>

          <input
            type="range"
            v-model.number="currentTime"
            min="0"
            max="15"
            step="0.1"
            style="flex: 1;"
          />

          <span style="
            min-width: 60px;
            text-align: right;
            font-family: monospace;
            color: var(--aix-colorText);
          ">
            {{ formatTime(currentTime) }}
          </span>
        </div>
      </div>
    `,
  }),
};

/**
 * 不同位置
 * 字幕可以显示在顶部、中间或底部
 */
export const Positions: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = {
        type: 'cues',
        cues: [{ id: '1', startTime: 0, endTime: 100, text: '字幕位置示例' }],
      };
      const positions = ['top', 'center', 'bottom'] as const;
      return { source, positions };
    },
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <div v-for="pos in positions" :key="pos">
          <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary); text-align: center;">
            {{ pos }}
          </p>
          <div style="
            position: relative;
            height: 200px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            padding: 16px;
          ">
            <Subtitle :source="source" :current-time="0" :position="pos" />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 背景样式
 * 支持毛玻璃、渐变和透明三种背景
 */
export const BackgroundStyles: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = {
        type: 'cues',
        cues: [
          { id: '1', startTime: 0, endTime: 100, text: '不同背景样式效果' },
        ],
      };
      const backgrounds = [
        { type: 'blur', label: '毛玻璃 (blur)' },
        { type: 'solid', label: '渐变 (solid)' },
        { type: 'none', label: '透明 (none)' },
      ] as const;
      return { source, backgrounds };
    },
    template: `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
        <div v-for="bg in backgrounds" :key="bg.type">
          <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary); text-align: center;">
            {{ bg.label }}
          </p>
          <div style="
            position: relative;
            height: 200px;
            background: url('https://picsum.photos/400/200?random=' + bg.type) center/cover;
            border-radius: 8px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 16px;
          ">
            <Subtitle :source="source" :current-time="0" :background="bg.type" />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 字体大小
 * 支持不同的字体大小设置
 */
export const FontSizes: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = {
        type: 'cues',
        cues: [{ id: '1', startTime: 0, endTime: 100, text: '字体大小示例' }],
      };
      const sizes = [14, 20, 28, 36];
      return { source, sizes };
    },
    template: `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
        <div v-for="size in sizes" :key="size">
          <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary); text-align: center;">
            {{ size }}px
          </p>
          <div style="
            position: relative;
            height: 150px;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
            border-radius: 8px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 16px;
          ">
            <Subtitle :source="source" :current-time="0" :font-size="size" />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * VTT 格式解析
 * 解析 WebVTT 格式的字幕文本
 */
export const VTTFormat: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const currentTime = ref(1);
      const source: SubtitleSource = {
        type: 'text',
        content: VTT_CONTENT,
        format: 'vtt',
      };
      return { currentTime, source, VTT_CONTENT };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">VTT 格式解析</h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              VTT 源文件
            </p>
            <pre style="
              margin: 0;
              padding: 16px;
              background: var(--aix-colorBgContainer);
              border: 1px solid var(--aix-colorBorder);
              border-radius: 8px;
              font-size: 12px;
              overflow-x: auto;
              color: var(--aix-colorText);
              white-space: pre-wrap;
            ">{{ VTT_CONTENT }}</pre>
          </div>

          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              渲染效果
            </p>
            <div style="
              position: relative;
              height: 200px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              border-radius: 8px;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              padding-bottom: 16px;
            ">
              <Subtitle :source="source" :current-time="currentTime" />
            </div>
            <input
              type="range"
              v-model.number="currentTime"
              min="0"
              max="9"
              step="0.1"
              style="width: 100%; margin-top: 12px;"
            />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * SRT 格式解析
 * 解析 SRT 格式的字幕文本
 */
export const SRTFormat: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const currentTime = ref(1);
      const source: SubtitleSource = {
        type: 'text',
        content: SRT_CONTENT,
        format: 'srt',
      };
      return { currentTime, source, SRT_CONTENT };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">SRT 格式解析</h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              SRT 源文件
            </p>
            <pre style="
              margin: 0;
              padding: 16px;
              background: var(--aix-colorBgContainer);
              border: 1px solid var(--aix-colorBorder);
              border-radius: 8px;
              font-size: 12px;
              overflow-x: auto;
              color: var(--aix-colorText);
              white-space: pre-wrap;
            ">{{ SRT_CONTENT }}</pre>
          </div>

          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              渲染效果
            </p>
            <div style="
              position: relative;
              height: 200px;
              background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
              border-radius: 8px;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              padding-bottom: 16px;
            ">
              <Subtitle :source="source" :current-time="currentTime" />
            </div>
            <input
              type="range"
              v-model.number="currentTime"
              min="0"
              max="9"
              step="0.1"
              style="width: 100%; margin-top: 12px;"
            />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * ASS 格式解析
 * 解析 ASS/SSA 格式的字幕文本（高级样式）
 */
export const ASSFormat: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const currentTime = ref(1);
      const source: SubtitleSource = {
        type: 'text',
        content: ASS_CONTENT,
        format: 'ass',
      };
      return { currentTime, source, ASS_CONTENT };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">ASS 格式解析</h3>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              ASS 源文件
            </p>
            <pre style="
              margin: 0;
              padding: 16px;
              background: var(--aix-colorBgContainer);
              border: 1px solid var(--aix-colorBorder);
              border-radius: 8px;
              font-size: 11px;
              overflow-x: auto;
              color: var(--aix-colorText);
              white-space: pre-wrap;
              max-height: 300px;
            ">{{ ASS_CONTENT }}</pre>
          </div>

          <div>
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              渲染效果
            </p>
            <div style="
              position: relative;
              height: 200px;
              background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
              border-radius: 8px;
              display: flex;
              align-items: flex-end;
              justify-content: center;
              padding-bottom: 16px;
            ">
              <Subtitle :source="source" :current-time="currentTime" />
            </div>
            <input
              type="range"
              v-model.number="currentTime"
              min="0"
              max="9"
              step="0.1"
              style="width: 100%; margin-top: 12px;"
            />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 自动分段
 * 长文本自动分段轮播显示
 */
export const AutoSegment: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = { type: 'cues', cues: LONG_TEXT_CUES };
      const currentTime = ref(5);
      return { source, currentTime };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">自动分段轮播</h3>
        <p style="margin: 0 0 16px; font-size: 14px; color: var(--aix-colorTextSecondary);">
          当字幕文本过长时，启用 autoSegment 可以自动分段，按时间轮播显示
        </p>

        <div style="
          position: relative;
          width: 100%;
          height: 300px;
          background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          border-radius: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 24px;
        ">
          <Subtitle
            :source="source"
            :current-time="currentTime"
            :auto-segment="true"
            :fixed-height="80"
            :segment-duration="2500"
            :max-width="600"
          />
        </div>

        <div style="
          margin-top: 16px;
          padding: 16px;
          background: var(--aix-colorPrimaryBg);
          border: 1px solid var(--aix-colorPrimaryBorder);
          border-radius: 8px;
        ">
          <h4 style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorText);">配置说明：</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: var(--aix-colorTextSecondary); line-height: 1.8;">
            <li><code>autoSegment: true</code> - 启用自动分段</li>
            <li><code>fixedHeight: 80</code> - 固定显示区域高度为 80px</li>
            <li><code>segmentDuration: 2500</code> - 每段显示 2.5 秒</li>
            <li><code>maxWidth: 600</code> - 最大宽度 600px</li>
          </ul>
        </div>
      </div>
    `,
  }),
};

/**
 * 单行模式
 * 固定高度，单行显示字幕
 */
export const SingleLine: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = {
        type: 'cues',
        cues: [
          {
            id: '1',
            startTime: 0,
            endTime: 5,
            text: '这是一段较长的字幕文本，用于测试单行模式下的显示效果，会被截断显示',
          },
          { id: '2', startTime: 5, endTime: 10, text: '短字幕' },
        ],
      };
      const currentTime = ref(2);
      return { source, currentTime };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">单行模式</h3>

        <div style="
          position: relative;
          width: 100%;
          height: 200px;
          background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);
          border-radius: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 24px;
        ">
          <Subtitle
            :source="source"
            :current-time="currentTime"
            :single-line="true"
            :fixed-height="40"
          />
        </div>

        <input
          type="range"
          v-model.number="currentTime"
          min="0"
          max="10"
          step="0.1"
          style="width: 100%; margin-top: 12px;"
        />
      </div>
    `,
  }),
};

/**
 * 事件监听
 * 监听字幕加载和变化事件
 */
export const EventListeners: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };
      const currentTime = ref(0);
      const events = ref<string[]>([]);

      const addEvent = (name: string, data?: any) => {
        const timestamp = new Date().toLocaleTimeString();
        const dataStr = data ? `: ${JSON.stringify(data)}` : '';
        events.value.unshift(`[${timestamp}] ${name}${dataStr}`);
        if (events.value.length > 8) {
          events.value.pop();
        }
      };

      const onLoaded = (cues: SubtitleCue[]) => {
        addEvent('loaded', { count: cues.length });
      };

      const onChange = (cue: SubtitleCue | null, index: number) => {
        addEvent('change', {
          index,
          text: cue?.text?.substring(0, 20) + '...',
        });
      };

      const onError = (error: Error) => {
        addEvent('error', { message: error.message });
      };

      return { source, currentTime, events, onLoaded, onChange, onError };
    },
    template: `
      <div style="display: flex; gap: 24px; max-width: 1000px;">
        <div style="flex: 1;">
          <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">字幕播放器</h3>

          <div style="
            position: relative;
            height: 250px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            display: flex;
            align-items: flex-end;
            justify-content: center;
            padding-bottom: 24px;
          ">
            <Subtitle
              :source="source"
              :current-time="currentTime"
              @loaded="onLoaded"
              @change="onChange"
              @error="onError"
            />
          </div>

          <input
            type="range"
            v-model.number="currentTime"
            min="0"
            max="15"
            step="0.1"
            style="width: 100%; margin-top: 12px;"
          />
        </div>

        <div style="width: 300px;">
          <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">事件日志</h3>
          <div style="
            padding: 12px;
            background: var(--aix-colorBgContainer);
            border: 1px solid var(--aix-colorBorder);
            border-radius: 8px;
            max-height: 300px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
          ">
            <div
              v-for="(event, index) in events"
              :key="index"
              style="padding: 4px 0; border-bottom: 1px solid var(--aix-colorBorderSecondary); color: var(--aix-colorText);"
            >
              {{ event }}
            </div>
            <div v-if="events.length === 0" style="color: var(--aix-colorTextSecondary);">
              拖动进度条查看事件...
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 自定义插槽
 * 使用默认插槽自定义字幕渲染
 */
export const CustomSlot: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };
      const currentTime = ref(1);
      return { source, currentTime };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">自定义渲染插槽</h3>
        <p style="margin: 0 0 16px; font-size: 14px; color: var(--aix-colorTextSecondary);">
          使用默认插槽可以完全自定义字幕的渲染方式
        </p>

        <div style="
          position: relative;
          width: 100%;
          height: 300px;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          border-radius: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 24px;
        ">
          <Subtitle :source="source" :current-time="currentTime" background="none">
            <template #default="{ text, currentSegment, totalSegments }">
              <div style="
                padding: 12px 24px;
                background: linear-gradient(90deg, #f093fb 0%, #f5576c 100%);
                border-radius: 20px;
                box-shadow: 0 4px 15px rgba(240, 147, 251, 0.4);
              ">
                <span style="
                  color: white;
                  font-size: 18px;
                  font-weight: 500;
                  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
                ">
                  {{ text }}
                </span>
                <span v-if="totalSegments > 1" style="
                  margin-left: 12px;
                  padding: 2px 8px;
                  background: rgba(255,255,255,0.3);
                  border-radius: 10px;
                  font-size: 12px;
                  color: white;
                ">
                  {{ currentSegment }}/{{ totalSegments }}
                </span>
              </div>
            </template>
          </Subtitle>
        </div>

        <input
          type="range"
          v-model.number="currentTime"
          min="0"
          max="15"
          step="0.1"
          style="width: 100%; margin-top: 12px;"
        />
      </div>
    `,
  }),
};

/**
 * CSS 变量定制
 * 通过 CSS 变量自定义字幕样式
 */
export const CSSVariables: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = {
        type: 'cues',
        cues: [
          { id: '1', startTime: 0, endTime: 100, text: '自定义样式的字幕' },
        ],
      };

      const customStyles = [
        {
          name: '金色高亮',
          style: {
            '--subtitle-text-color': '#ffd700',
            '--subtitle-text-shadow': '0 0 10px rgba(255, 215, 0, 0.8)',
            '--subtitle-bg-blur': 'rgba(0, 0, 0, 0.6)',
          },
        },
        {
          name: '霓虹效果',
          style: {
            '--subtitle-text-color': '#00ffff',
            '--subtitle-text-shadow':
              '0 0 5px #00ffff, 0 0 10px #00ffff, 0 0 20px #00ffff',
            '--subtitle-bg-blur': 'rgba(0, 0, 0, 0.8)',
          },
        },
        {
          name: '柔和粉色',
          style: {
            '--subtitle-text-color': '#ffb6c1',
            '--subtitle-bg-blur': 'rgba(255, 182, 193, 0.2)',
            '--subtitle-border-color': 'rgba(255, 182, 193, 0.5)',
          },
        },
      ];

      return { source, customStyles };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">CSS 变量定制</h3>
        <p style="margin: 0 0 16px; font-size: 14px; color: var(--aix-colorTextSecondary);">
          通过 CSS 变量可以深度定制字幕样式
        </p>

        <div style="display: grid; gap: 16px;">
          <div v-for="item in customStyles" :key="item.name">
            <p style="margin: 0 0 8px; font-size: 14px; color: var(--aix-colorTextSecondary);">
              {{ item.name }}
            </p>
            <div style="
              position: relative;
              height: 120px;
              background: #1a1a2e;
              border-radius: 8px;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <Subtitle :source="source" :current-time="0" :style="item.style" />
            </div>
          </div>
        </div>

        <div style="
          margin-top: 16px;
          padding: 16px;
          background: var(--aix-colorBgContainer);
          border: 1px solid var(--aix-colorBorder);
          border-radius: 8px;
        ">
          <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--aix-colorText);">可用 CSS 变量：</h4>
          <pre style="
            margin: 0;
            padding: 12px;
            background: var(--aix-colorFillTertiary, #f5f5f5);
            border-radius: 4px;
            font-size: 12px;
            overflow-x: auto;
            color: var(--aix-colorText);
          ">--subtitle-padding
--subtitle-border-radius
--subtitle-text-color
--subtitle-text-shadow
--subtitle-line-height
--subtitle-bg-blur
--subtitle-bg-solid
--subtitle-border-color
--subtitle-blur-amount
--subtitle-transition</pre>
        </div>
      </div>
    `,
  }),
};

/**
 * 隐藏/显示
 * 控制字幕的显示和隐藏
 */
export const Visibility: Story = {
  render: () => ({
    components: { Subtitle },
    setup() {
      const visible = ref(true);
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };
      return { visible, source };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">显示/隐藏控制</h3>

        <button
          @click="visible = !visible"
          style="
            margin-bottom: 16px;
            padding: 8px 16px;
            background: var(--aix-colorPrimary);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          "
        >
          {{ visible ? '隐藏字幕' : '显示字幕' }}
        </button>

        <div style="
          position: relative;
          width: 100%;
          height: 300px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          padding-bottom: 24px;
        ">
          <Subtitle :source="source" :current-time="1" :visible="visible" />
        </div>
      </div>
    `,
  }),
};

/**
 * 格式支持说明
 * 展示支持的所有字幕格式
 */
export const FormatSupport: Story = {
  render: () => ({
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">支持的字幕格式</h3>
        <div style="display: grid; gap: 16px;">
          <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--aix-colorText);">WebVTT (.vtt)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
              Web 标准字幕格式，支持样式和定位。广泛用于 HTML5 视频。
            </p>
          </div>

          <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--aix-colorText);">SubRip (.srt)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
              最常见的字幕格式，简单易用。支持时间戳和多行文本。
            </p>
          </div>

          <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--aix-colorText);">JSON</h4>
            <p style="margin: 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
              自定义 JSON 格式，支持扩展数据字段，方便程序化生成。
            </p>
          </div>

          <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--aix-colorText);">YouTube Subtitles (.sbv)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
              YouTube 使用的字幕格式，简化的时间戳格式。
            </p>
          </div>

          <div style="padding: 16px; background: var(--aix-colorBgContainer); border: 1px solid var(--aix-colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--aix-colorText);">Advanced SubStation Alpha (.ass/.ssa)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--aix-colorTextSecondary);">
              高级字幕格式，支持丰富的样式、特效和定位。常用于动漫字幕。
            </p>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 交互式 Playground
 * 在 Controls 面板中调整参数查看效果
 */
export const Playground: Story = {
  args: {
    currentTime: 1,
    visible: true,
    position: 'bottom',
    fontSize: 20,
    background: 'blur',
    maxWidth: '800px',
    singleLine: false,
    autoSegment: false,
    segmentDuration: 3000,
  },
  render: (args) => ({
    components: { Subtitle },
    setup() {
      const source: SubtitleSource = { type: 'cues', cues: SAMPLE_CUES };
      return { args, source };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin: 0 0 16px; color: var(--aix-colorText);">交互式 Playground</h3>
        <p style="margin: 0 0 16px; font-size: 14px; color: var(--aix-colorTextSecondary);">
          在右侧 Controls 面板中调整参数，实时查看效果
        </p>

        <div style="
          position: relative;
          width: 100%;
          height: 300px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          padding: 16px;
        ">
          <Subtitle v-bind="args" :source="source" />
        </div>
      </div>
    `,
  }),
};
