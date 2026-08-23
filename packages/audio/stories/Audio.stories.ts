import type { Meta, StoryObj } from '@storybook/vue3';
import { ref, onUnmounted } from 'vue';
import AudioPlayer from '../src/components/AudioPlayer/index.vue';
import WaveformCanvas from '../src/components/WaveformCanvas/index.vue';

// ── 测试音频 ──────────────────────────────────────────────────────────────────

const TEST_AUDIO = 'https://www.w3schools.com/html/horse.mp3';

// ── 工具：生成示例波形数据 ─────────────────────────────────────────────────────

function generateWaveform(length = 80, type: 'sine' | 'random' | 'speech' = 'sine'): number[] {
  return Array.from({ length }, (_, i) => {
    switch (type) {
      case 'sine':
        return Math.abs(Math.sin(i * 0.18)) * 0.85 + 0.05;
      case 'random':
        return Math.random() * 0.9 + 0.05;
      case 'speech':
        // 模拟语音波形（中间高两端低）
        return (
          Math.abs(Math.sin(i * 0.25)) *
            Math.exp(-Math.pow((i - length / 2) / (length / 4), 2)) *
            0.9 +
          0.05
        );
      default:
        return 0.5;
    }
  });
}

// ============================================================================
// WaveformCanvas Stories
// ============================================================================

const waveformMeta: Meta<typeof WaveformCanvas> = {
  title: 'Media/WaveformCanvas',
  component: WaveformCanvas,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
Canvas 波形可视化组件，接收归一化数据点（0-1）绘制条形波形。

## 特性
- **高 DPR 渲染**：自动适配视网膜屏，不模糊
- **自适应宽度**：\`width=0\` 时监听父容器 ResizeObserver 自动铺满
- **进度指示**：\`progress\` 控制已播放/未播放颜色分界
- **CSS Variables**：颜色通过 \`--aix-waveform-inactive\` / \`--aix-waveform-active\` 覆盖
- **空态占位**：无数据时渲染静态占位波形，避免白屏

## 颜色覆盖示例
\`\`\`scss
.my-player {
  --aix-waveform-inactive: #e2e8f0;
  --aix-waveform-active:   #6366f1;
}
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    progress: {
      control: { type: 'range', min: 0, max: 1, step: 0.01 },
      description: '播放进度（0-1），控制激活颜色分界',
    },
    height: {
      control: { type: 'range', min: 16, max: 120, step: 4 },
      description: '画布高度（px）',
    },
    barWidth: {
      control: { type: 'range', min: 1, max: 8, step: 1 },
      description: '柱宽（px）',
    },
    barGap: {
      control: { type: 'range', min: 1, max: 8, step: 1 },
      description: '柱间间距（px）',
    },
    inactiveColor: { control: 'color', description: '未激活颜色' },
    activeColor: { control: 'color', description: '激活颜色' },
  },
};

export default waveformMeta;

type WaveformStory = StoryObj<typeof waveformMeta>;

/** 基础用法：传入波形数据即可 */
export const WaveformDefault: WaveformStory = {
  name: 'WaveformCanvas / 基础',
  args: {
    data: generateWaveform(80, 'sine'),
    progress: 0,
    height: 32,
    barWidth: 2,
    barGap: 4,
  },
  render: (args) => ({
    components: { WaveformCanvas },
    setup: () => ({ args }),
    template: `<div style="width: 400px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
      <WaveformCanvas v-bind="args" :width="368" />
    </div>`,
  }),
};

/** 播放进度动画演示 */
export const WaveformProgress: WaveformStory = {
  name: 'WaveformCanvas / 播放进度',
  render: () => ({
    components: { WaveformCanvas },
    setup() {
      const progress = ref(0);
      const data = generateWaveform(80, 'speech');
      let raf = 0;

      const animate = () => {
        progress.value = (progress.value + 0.003) % 1;
        raf = requestAnimationFrame(animate);
      };
      animate();

      // story 切走后必须停掉动画，否则 rAF 循环会一直跑下去
      onUnmounted(() => cancelAnimationFrame(raf));

      return { progress, data };
    },
    template: `
      <div style="width: 400px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div style="margin-bottom: 8px; font-size: 12px; color: #86909c;">
          进度：{{ (progress * 100).toFixed(1) }}%
        </div>
        <WaveformCanvas :data="data" :progress="progress" :width="368" :height="32" />
      </div>
    `,
  }),
};

/** 自适应宽度：width=0 时跟随父容器 */
export const WaveformAutoWidth: WaveformStory = {
  name: 'WaveformCanvas / 自适应宽度',
  render: () => ({
    components: { WaveformCanvas },
    setup: () => ({ data: generateWaveform(80, 'random') }),
    template: `
      <div style="padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <p style="font-size: 12px; color: #86909c; margin: 0 0 8px;">
          width=0，自动铺满父容器（拖拽浏览器窗口宽度可见效果）
        </p>
        <WaveformCanvas :data="data" :width="0" :height="32" />
      </div>
    `,
  }),
};

/** 空态占位 */
export const WaveformEmpty: WaveformStory = {
  args: {
    progress: 0.57,
    height: 80,
    activeColor: '#c92b2b',
  },

  name: 'WaveformCanvas / 空态占位',

  render: () => ({
    components: { WaveformCanvas },
    template: `
      <div style="width: 400px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <p style="font-size: 12px; color: #86909c; margin: 0 0 8px;">data=[]，显示静态占位波形</p>
        <WaveformCanvas :data="[]" :width="368" :height="32" />
      </div>
    `,
  }),
};

/** 自定义颜色 */
export const WaveformColors: WaveformStory = {
  name: 'WaveformCanvas / 自定义颜色',
  render: () => ({
    components: { WaveformCanvas },
    setup() {
      const data = generateWaveform(80, 'sine');
      const themes = [
        { label: '默认蓝', inactive: '#c9cdd4', active: '#1677ff' },
        { label: '绿色', inactive: '#d1fae5', active: '#10b981' },
        { label: '紫色', inactive: '#ede9fe', active: '#8b5cf6' },
        { label: '橙色', inactive: '#fef3c7', active: '#f59e0b' },
      ];
      return { data, themes };
    },
    template: `
      <div style="display: flex; flex-direction: column; gap: 16px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <div v-for="t in themes" :key="t.label" style="display: flex; align-items: center; gap: 12px;">
          <span style="width: 48px; font-size: 12px; color: #4e5969;">{{ t.label }}</span>
          <WaveformCanvas :data="data" :progress="0.4" :width="300" :height="28"
            :inactive-color="t.inactive" :active-color="t.active" />
        </div>
      </div>
    `,
  }),
};

// ============================================================================
// AudioPlayer Stories（单独 meta）
// ============================================================================

export const audioPlayerMeta: Meta<typeof AudioPlayer> = {
  title: 'Media/AudioPlayer',
  component: AudioPlayer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
轻量音频播放器，支持波形可视化与进度拖拽。无外部图标依赖，图标由纯 CSS 绘制。

## 特性
- 支持 \`string\` URL 和 \`Blob\` 两种音频源
- 内嵌 WaveformCanvas 波形可视化（可关闭）
- 进度条点击跳转
- 自动播放支持
- Blob URL 在组件卸载时自动撤销

## CSS Variables
\`\`\`scss
.my-player {
  --aix-audio-player-btn-bg:      #1677ff;
  --aix-audio-player-track-bg:    #f0f0f0;
  --aix-audio-player-progress-bg: #1677ff;
  --aix-audio-player-time-color:  #86909c;
  --aix-waveform-inactive:        #e2e8f0;
  --aix-waveform-active:          #1677ff;
}
\`\`\`
      `,
      },
    },
  },
  argTypes: {
    src: { control: 'text', description: '音频地址（URL 或 Blob）' },
    showWaveform: { control: 'boolean', description: '是否显示波形' },
    autoplay: { control: 'boolean', description: '是否自动播放' },
  },
};

type AudioPlayerStory = StoryObj<typeof audioPlayerMeta>;

/** 基础播放器（无波形） */
export const AudioPlayerBasic: AudioPlayerStory = {
  name: 'AudioPlayer / 基础',
  args: { src: TEST_AUDIO, showWaveform: false },
  render: (args) => ({
    components: { AudioPlayer },
    setup: () => ({ args }),
    template: `
      <div style="width: 360px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <AudioPlayer v-bind="args" />
      </div>
    `,
  }),
};

/** 带波形的播放器 */
export const AudioPlayerWithWaveform: AudioPlayerStory = {
  name: 'AudioPlayer / 带波形',
  args: {
    src: TEST_AUDIO,
    showWaveform: true,
    waveform: generateWaveform(80, 'speech'),
  },
  render: (args) => ({
    components: { AudioPlayer },
    setup: () => ({ args }),
    template: `
      <div style="width: 360px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
        <p style="font-size: 12px; color: #86909c; margin: 0 0 8px;">带预设波形数据</p>
        <AudioPlayer v-bind="args" />
      </div>
    `,
  }),
};

/** 自定义主题色 */
export const AudioPlayerThemed: AudioPlayerStory = {
  name: 'AudioPlayer / 自定义主题',
  args: {
    src: TEST_AUDIO,
    showWaveform: true,
    waveform: generateWaveform(80, 'sine'),
  },
  render: (args) => ({
    components: { AudioPlayer },
    setup: () => ({ args }),
    template: `
      <div style="
        width: 360px; padding: 16px;
        background: #0f0f1a;
        border-radius: 12px;
        --aix-audio-player-btn-bg: #8b5cf6;
        --aix-audio-player-track-bg: #2d2d3a;
        --aix-audio-player-progress-bg: #8b5cf6;
        --aix-audio-player-time-color: #a78bfa;
        --aix-waveform-inactive: #3d3d4e;
        --aix-waveform-active: #8b5cf6;
      ">
        <AudioPlayer v-bind="args" />
      </div>
    `,
  }),
};

/** 事件监听 */
export const AudioPlayerEvents: AudioPlayerStory = {
  name: 'AudioPlayer / 事件监听',
  args: { src: TEST_AUDIO, showWaveform: true, waveform: generateWaveform(80, 'speech') },
  render: (args) => ({
    components: { AudioPlayer },
    setup() {
      const log = ref<string[]>([]);
      const addLog = (msg: string) => {
        log.value.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
        if (log.value.length > 8) log.value.pop();
      };
      return {
        args,
        log,
        onPlay: () => addLog('▶ play'),
        onPause: () => addLog('⏸ pause'),
        onEnded: () => addLog('⏹ ended'),
        onTimeupdate: (t: number) => {
          if (Math.floor(t) % 3 === 0 && t > 0) addLog(`⏱ timeupdate: ${t.toFixed(1)}s`);
        },
      };
    },
    template: `
      <div style="display: flex; gap: 16px; align-items: flex-start;">
        <div style="width: 300px; padding: 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px;">
          <AudioPlayer v-bind="args"
            @play="onPlay" @pause="onPause" @ended="onEnded" @timeupdate="onTimeupdate" />
        </div>
        <div style="width: 240px; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb;
                    border-radius: 8px; font-family: monospace; font-size: 12px; color: #374151; min-height: 120px;">
          <div v-for="(e, i) in log" :key="i" style="padding: 2px 0; border-bottom: 1px solid #e5e7eb;">{{ e }}</div>
          <div v-if="!log.length" style="color: #9ca3af;">播放音频查看事件…</div>
        </div>
      </div>
    `,
  }),
};
