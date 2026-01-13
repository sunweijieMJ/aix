import type { Meta, StoryObj } from '@storybook/vue3';
import { ref } from 'vue';
import DefaultControls from '../src/components/DefaultControls.vue';
import VideoPlayer from '../src/index.vue';

// 测试视频源
const TEST_VIDEOS = {
  // 公共测试视频
  mp4: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  mp4Short: 'https://www.w3schools.com/html/mov_bbb.mp4',
  webm: 'https://www.w3schools.com/html/mov_bbb.webm',
  // HLS 测试流
  hlsLive: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  hlsBipBop:
    'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_4x3/bipbop_4x3_variant.m3u8',
  // DASH 测试流
  dash: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
};

const meta: Meta<typeof VideoPlayer> = {
  title: 'Media/VideoPlayer',
  component: VideoPlayer,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: `
AIX VideoPlayer 是一个功能强大的 Vue 3 视频播放器组件，支持多种流媒体协议。

## 特性
- **多格式支持**: MP4, WebM, OGG, MOV 原生格式
- **流媒体协议**: HLS, FLV, DASH, RTSP, WebRTC
- **自动协议检测**: 根据 URL 自动选择合适的播放器
- **移动端优化**: 触摸手势、屏幕方向监听、自动播放策略
- **自定义控制栏**: 支持完全自定义的控制栏插槽
- **网络状态监听**: 检测网络变化并自动恢复播放

## 安装依赖
\`\`\`bash
pnpm add @aix/video
\`\`\`

## 基本使用
\`\`\`vue
<template>
  <VideoPlayer src="https://example.com/video.mp4" />
</template>
\`\`\`
        `,
      },
    },
  },
  argTypes: {
    src: {
      control: 'text',
      description: '视频源地址',
      table: {
        type: { summary: 'string' },
      },
    },
    poster: {
      control: 'text',
      description: '封面图片 URL',
      table: {
        type: { summary: 'string' },
      },
    },
    autoplay: {
      control: 'boolean',
      description: '是否自动播放（移动端会自动静音）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    loop: {
      control: 'boolean',
      description: '是否循环播放',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    muted: {
      control: 'boolean',
      description: '是否静音',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    controls: {
      control: 'boolean',
      description: '是否显示控制栏',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    width: {
      control: 'text',
      description: '播放器宽度',
      table: {
        type: { summary: 'number | string' },
      },
    },
    height: {
      control: 'text',
      description: '播放器高度',
      table: {
        type: { summary: 'number | string' },
      },
    },
    aspectRatio: {
      control: 'select',
      options: ['16:9', '4:3', '1:1', '21:9'],
      description: '宽高比',
      table: {
        type: { summary: 'string' },
      },
    },
    preload: {
      control: 'select',
      options: ['auto', 'metadata', 'none'],
      description: '预加载策略',
      table: {
        type: { summary: "'auto' | 'metadata' | 'none'" },
        defaultValue: { summary: "'auto'" },
      },
    },
    customControls: {
      control: 'boolean',
      description: '是否使用自定义控制栏',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
    enableTouchEvents: {
      control: 'boolean',
      description: '是否启用触摸事件（移动端）',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'true' },
      },
    },
    autoFullscreenOnLandscape: {
      control: 'boolean',
      description: '横屏时是否自动全屏',
      table: {
        type: { summary: 'boolean' },
        defaultValue: { summary: 'false' },
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 基础用法
 * 最简单的视频播放器，只需要提供 src 即可
 */
export const Default: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * MP4 视频播放
 * 支持标准 MP4 格式视频
 */
export const MP4Video: Story = {
  args: {
    src: TEST_VIDEOS.mp4,
    poster:
      'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">Big Buck Bunny (MP4)</h3>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * HLS 流媒体播放
 * 支持 .m3u8 格式的 HLS 流，自动加载 hls.js
 */
export const HLSStream: Story = {
  args: {
    src: TEST_VIDEOS.hlsBipBop,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">HLS 流媒体 (.m3u8)</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          自动检测 .m3u8 格式并使用 hls.js 播放
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * DASH 流媒体播放
 * 支持 .mpd 格式的 DASH 流，自动加载 dashjs
 */
export const DASHStream: Story = {
  args: {
    src: TEST_VIDEOS.dash,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">DASH 流媒体 (.mpd)</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          自动检测 .mpd 格式并使用 dashjs 播放
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 自动播放（静音）
 * 由于浏览器策略限制，自动播放需要静音
 */
export const Autoplay: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    autoplay: true,
    muted: true,
    loop: true,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">自动播放 + 循环</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          浏览器要求自动播放必须静音，组件会自动处理移动端策略
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 不同宽高比
 * 支持多种宽高比配置
 */
export const AspectRatios: Story = {
  render: () => ({
    components: { VideoPlayer },
    setup() {
      const ratios = ['16:9', '4:3', '1:1', '21:9'];
      return { ratios, src: TEST_VIDEOS.mp4Short };
    },
    template: `
      <div>
        <h3 style="margin-bottom: 16px; color: var(--colorText);">不同宽高比</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">
          <div v-for="ratio in ratios" :key="ratio">
            <p style="margin-bottom: 8px; font-size: 14px; color: var(--colorTextSecondary);">
              {{ ratio }}
            </p>
            <VideoPlayer :src="src" :aspect-ratio="ratio" style="max-width: 400px;" />
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 自定义尺寸
 * 可以指定固定的宽度和高度
 */
export const CustomSize: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    width: 400,
    height: 300,
    fluid: false,
    responsive: false,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div>
        <h3 style="margin-bottom: 16px; color: var(--colorText);">固定尺寸 (400x300)</h3>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 隐藏控制栏
 * 适用于背景视频等场景
 */
export const NoControls: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    controls: false,
    autoplay: true,
    muted: true,
    loop: true,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">无控制栏（背景视频）</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          适用于网站背景、装饰性视频等场景
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 自定义控制栏
 * 使用插槽完全自定义控制栏 UI
 */
export const CustomControls: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    customControls: true,
  },
  render: (args) => ({
    components: { VideoPlayer, DefaultControls },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">自定义控制栏</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          使用 customControls 插槽可以完全自定义控制栏
        </p>
        <VideoPlayer v-bind="args">
          <template #controls="{ playerState, controls }">
            <DefaultControls :player-state="playerState" :controls="controls" />
          </template>
        </VideoPlayer>
      </div>
    `,
  }),
};

/**
 * 事件监听
 * 监听播放器的各种事件
 */
export const EventListeners: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const events = ref<string[]>([]);
      const maxEvents = 10;

      const addEvent = (name: string, data?: any) => {
        const timestamp = new Date().toLocaleTimeString();
        const dataStr = data !== undefined ? `: ${JSON.stringify(data)}` : '';
        events.value.unshift(`[${timestamp}] ${name}${dataStr}`);
        if (events.value.length > maxEvents) {
          events.value.pop();
        }
      };

      return {
        args,
        events,
        onReady: () => addEvent('ready'),
        onPlay: () => addEvent('play'),
        onPause: () => addEvent('pause'),
        onEnded: () => addEvent('ended'),
        onTimeupdate: (currentTime: number, duration: number) => {
          // 每 5 秒记录一次，避免日志过多
          if (Math.floor(currentTime) % 5 === 0) {
            addEvent('timeupdate', {
              currentTime: currentTime.toFixed(1),
              duration: duration.toFixed(1),
            });
          }
        },
        onVolumechange: (volume: number, muted: boolean) =>
          addEvent('volumechange', { volume, muted }),
        onFullscreenchange: (isFullscreen: boolean) =>
          addEvent('fullscreenchange', { isFullscreen }),
        onError: (error: Error) => addEvent('error', error.message),
      };
    },
    template: `
      <div style="display: flex; gap: 24px; max-width: 1200px;">
        <div style="flex: 1;">
          <h3 style="margin-bottom: 16px; color: var(--colorText);">视频播放器</h3>
          <VideoPlayer
            v-bind="args"
            @ready="onReady"
            @play="onPlay"
            @pause="onPause"
            @ended="onEnded"
            @timeupdate="onTimeupdate"
            @volumechange="onVolumechange"
            @fullscreenchange="onFullscreenchange"
            @error="onError"
          />
        </div>
        <div style="width: 300px;">
          <h3 style="margin-bottom: 16px; color: var(--colorText);">事件日志</h3>
          <div style="
            padding: 12px;
            background: var(--colorBgContainer);
            border: 1px solid var(--colorBorder);
            border-radius: 8px;
            max-height: 400px;
            overflow-y: auto;
            font-family: monospace;
            font-size: 12px;
          ">
            <div v-for="(event, index) in events" :key="index" style="
              padding: 4px 0;
              border-bottom: 1px solid var(--colorBorderSecondary);
              color: var(--colorText);
            ">
              {{ event }}
            </div>
            <div v-if="events.length === 0" style="color: var(--colorTextSecondary);">
              播放视频查看事件...
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 外部控制
 * 通过 ref 调用播放器方法
 */
export const ExternalControl: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null);

      const play = () => playerRef.value?.play();
      const pause = () => playerRef.value?.pause();
      const seek = (time: number) => playerRef.value?.seek(time);
      const toggleMute = () => playerRef.value?.toggleMute();
      const toggleFullscreen = () => playerRef.value?.toggleFullscreen();

      return {
        args,
        playerRef,
        play,
        pause,
        seek,
        toggleMute,
        toggleFullscreen,
      };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">外部控制</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          通过 ref 获取播放器实例，调用内置方法
        </p>

        <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
          <button
            @click="play"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            播放
          </button>
          <button
            @click="pause"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            暂停
          </button>
          <button
            @click="seek(0)"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            回到开头
          </button>
          <button
            @click="seek(5)"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            跳转到 5 秒
          </button>
          <button
            @click="toggleMute"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            切换静音
          </button>
          <button
            @click="toggleFullscreen"
            style="padding: 8px 16px; background: var(--colorPrimary); color: white; border: none; border-radius: 4px; cursor: pointer;"
          >
            切换全屏
          </button>
        </div>

        <VideoPlayer ref="playerRef" v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 移动端触摸手势
 * 支持单击播放/暂停、双击全屏、滑动快进/快退
 */
export const TouchGestures: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    enableTouchEvents: true,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">触摸手势（移动端）</h3>
        <div style="
          padding: 16px;
          margin-bottom: 16px;
          background: var(--colorPrimaryBg);
          border: 1px solid var(--colorPrimaryBorder);
          border-radius: 8px;
        ">
          <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--colorText);">支持的手势：</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: var(--colorTextSecondary); line-height: 1.8;">
            <li><strong>单击</strong> - 播放/暂停</li>
            <li><strong>双击</strong> - 进入/退出全屏</li>
            <li><strong>左滑</strong> - 快退 10 秒</li>
            <li><strong>右滑</strong> - 快进 10 秒</li>
          </ul>
        </div>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 横屏自动全屏
 * 移动端横屏时自动进入全屏模式
 */
export const AutoFullscreenOnLandscape: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    autoFullscreenOnLandscape: true,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">横屏自动全屏</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          在移动设备上旋转到横屏时，视频会自动进入全屏模式
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 透明背景
 * 适用于需要透明背景的场景
 */
export const TransparentBackground: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
    transparent: true,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">透明背景</h3>
        <div style="
          padding: 24px;
          background: linear-gradient(45deg, #f0f0f0 25%, transparent 25%),
                      linear-gradient(-45deg, #f0f0f0 25%, transparent 25%),
                      linear-gradient(45deg, transparent 75%, #f0f0f0 75%),
                      linear-gradient(-45deg, transparent 75%, #f0f0f0 75%);
          background-size: 20px 20px;
          background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
        ">
          <VideoPlayer v-bind="args" />
        </div>
      </div>
    `,
  }),
};

/**
 * 主题切换
 * 支持亮色/暗色主题
 */
export const ThemeDemo: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <div style="
          padding: 16px;
          background: var(--colorBgContainer);
          border: 1px solid var(--colorBorder);
          border-radius: 8px;
        ">
          <h3 style="margin: 0 0 16px; font-size: 16px; color: var(--colorText);">
            主题切换演示
          </h3>
          <p style="margin: 0 0 16px; font-size: 14px; color: var(--colorTextSecondary);">
            点击右上角工具栏的主题按钮（太阳/月亮图标），切换亮色/暗色主题查看效果
          </p>
          <VideoPlayer v-bind="args" />
        </div>
      </div>
    `,
  }),
};

/**
 * 流协议说明
 * 展示支持的所有流媒体协议
 */
export const ProtocolSupport: Story = {
  render: () => ({
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">支持的流媒体协议</h3>
        <div style="display: grid; gap: 16px;">
          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">原生格式</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              MP4, WebM, OGG, MOV - 浏览器原生支持，无需额外 SDK
            </p>
          </div>

          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">HLS (.m3u8)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              使用 hls.js 实现，支持自适应码率、低延迟模式、错误重试
            </p>
          </div>

          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">FLV</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              使用 flv.js 实现，支持直播追帧、首帧检测、解码监控
            </p>
          </div>

          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">DASH (.mpd)</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              使用 dashjs 实现，支持自适应码率、低延迟模式
            </p>
          </div>

          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">RTSP</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              需要服务端转换：支持 WebSocket 代理、HLS 转换、WebRTC 网关三种模式
            </p>
          </div>

          <div style="padding: 16px; background: var(--colorBgContainer); border: 1px solid var(--colorBorder); border-radius: 8px;">
            <h4 style="margin: 0 0 8px; color: var(--colorText);">WebRTC</h4>
            <p style="margin: 0; font-size: 14px; color: var(--colorTextSecondary);">
              支持信令服务器模式，实现 P2P 视频流接收
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
    src: TEST_VIDEOS.mp4Short,
    autoplay: false,
    loop: false,
    muted: false,
    controls: true,
    aspectRatio: '16:9',
    preload: 'auto',
    enableTouchEvents: true,
    autoFullscreenOnLandscape: false,
    transparent: false,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">交互式 Playground</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          在右侧 Controls 面板中调整参数，实时查看效果
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 错误处理
 * 展示视频加载失败时的处理
 */
export const ErrorHandling: Story = {
  args: {
    src: 'https://example.com/non-existent-video.mp4',
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const errorMessage = ref<string>('');
      const hasError = ref(false);

      const handleError = (error: Error) => {
        hasError.value = true;
        errorMessage.value = error.message;
      };

      return { args, errorMessage, hasError, handleError };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">错误处理</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          演示视频加载失败时的错误处理
        </p>

        <div
          v-if="hasError"
          style="
            padding: 16px;
            margin-bottom: 16px;
            background: var(--colorErrorBg, #fff2f0);
            border: 1px solid var(--colorErrorBorder, #ffccc7);
            border-radius: 8px;
            color: var(--colorError, #ff4d4f);
          "
        >
          <strong>错误：</strong> {{ errorMessage }}
        </div>

        <VideoPlayer v-bind="args" @error="handleError" />
      </div>
    `,
  }),
};

/**
 * 网络状态监听
 * 监听网络连接状态变化
 */
export const NetworkStatusDemo: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const networkStatus = ref('在线');
      const networkEvents = ref<string[]>([]);

      const addNetworkEvent = (event: string) => {
        const timestamp = new Date().toLocaleTimeString();
        networkEvents.value.unshift(`[${timestamp}] ${event}`);
        if (networkEvents.value.length > 5) {
          networkEvents.value.pop();
        }
      };

      const handleNetworkOnline = () => {
        networkStatus.value = '在线';
        addNetworkEvent('网络已恢复');
      };

      const handleNetworkOffline = () => {
        networkStatus.value = '离线';
        addNetworkEvent('网络已断开');
      };

      const handleNetworkSlow = (status: any) => {
        networkStatus.value = `慢速 (${status.effectiveType})`;
        addNetworkEvent(`检测到慢速网络: ${status.effectiveType}`);
      };

      const handleNetworkChange = (status: any) => {
        addNetworkEvent(`网络状态变化: ${status.effectiveType || 'unknown'}`);
      };

      return {
        args,
        networkStatus,
        networkEvents,
        handleNetworkOnline,
        handleNetworkOffline,
        handleNetworkSlow,
        handleNetworkChange,
      };
    },
    template: `
      <div style="display: flex; gap: 24px; max-width: 1200px;">
        <div style="flex: 1;">
          <h3 style="margin-bottom: 16px; color: var(--colorText);">网络状态监听</h3>
          <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
            监听网络连接状态，断网时暂停、恢复时自动重连
          </p>
          <VideoPlayer
            v-bind="args"
            @network-online="handleNetworkOnline"
            @network-offline="handleNetworkOffline"
            @network-slow="handleNetworkSlow"
            @network-change="handleNetworkChange"
          />
        </div>
        <div style="width: 280px;">
          <h3 style="margin-bottom: 16px; color: var(--colorText);">网络状态</h3>
          <div style="
            padding: 12px;
            margin-bottom: 16px;
            background: var(--colorBgContainer);
            border: 1px solid var(--colorBorder);
            border-radius: 8px;
          ">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span
                :style="{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: networkStatus === '在线' ? '#52c41a' : networkStatus === '离线' ? '#ff4d4f' : '#faad14'
                }"
              />
              <span style="color: var(--colorText);">{{ networkStatus }}</span>
            </div>
          </div>

          <h4 style="margin-bottom: 12px; font-size: 14px; color: var(--colorText);">事件日志</h4>
          <div style="
            padding: 12px;
            background: var(--colorBgContainer);
            border: 1px solid var(--colorBorder);
            border-radius: 8px;
            font-family: monospace;
            font-size: 12px;
            max-height: 200px;
            overflow-y: auto;
          ">
            <div
              v-for="(event, index) in networkEvents"
              :key="index"
              style="padding: 4px 0; border-bottom: 1px solid var(--colorBorderSecondary); color: var(--colorText);"
            >
              {{ event }}
            </div>
            <div v-if="networkEvents.length === 0" style="color: var(--colorTextSecondary);">
              等待网络事件...
            </div>
          </div>
        </div>
      </div>
    `,
  }),
};

/**
 * 画中画模式
 * 支持画中画 (Picture-in-Picture) 功能
 */
export const PictureInPicture: Story = {
  args: {
    src: TEST_VIDEOS.mp4Short,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const playerRef = ref<InstanceType<typeof VideoPlayer> | null>(null);
      const isPipSupported = ref(false);
      const isPipActive = ref(false);

      const checkPipSupport = () => {
        isPipSupported.value =
          'pictureInPictureEnabled' in document &&
          (document as any).pictureInPictureEnabled;
      };

      const togglePip = async () => {
        try {
          await playerRef.value?.togglePictureInPicture();
          isPipActive.value = !!document.pictureInPictureElement;
        } catch (error) {
          console.error('画中画切换失败:', error);
        }
      };

      // 检查画中画支持
      checkPipSupport();

      return { args, playerRef, isPipSupported, isPipActive, togglePip };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">画中画模式</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          支持画中画功能，视频可以悬浮在其他窗口上方播放
        </p>

        <div style="margin-bottom: 16px;">
          <button
            @click="togglePip"
            :disabled="!isPipSupported"
            :style="{
              padding: '8px 16px',
              background: isPipSupported ? 'var(--colorPrimary)' : '#d9d9d9',
              color: isPipSupported ? 'white' : '#999',
              border: 'none',
              borderRadius: '4px',
              cursor: isPipSupported ? 'pointer' : 'not-allowed',
            }"
          >
            {{ isPipActive ? '退出画中画' : '进入画中画' }}
          </button>
          <span v-if="!isPipSupported" style="margin-left: 12px; font-size: 12px; color: var(--colorTextSecondary);">
            您的浏览器不支持画中画功能
          </span>
        </div>

        <VideoPlayer ref="playerRef" v-bind="args" />
      </div>
    `,
  }),
};

/**
 * 高级流配置
 * 展示 streamOptions 的使用
 */
export const AdvancedStreamOptions: Story = {
  args: {
    src: TEST_VIDEOS.hlsBipBop,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      const streamOptions = {
        hlsOptions: {
          lowLatencyMode: true,
          hlsConfig: {
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
          },
        },
      };

      return { args, streamOptions };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">高级流配置</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          通过 streamOptions 属性配置流媒体的高级选项
        </p>

        <div style="
          padding: 16px;
          margin-bottom: 16px;
          background: var(--colorBgContainer);
          border: 1px solid var(--colorBorder);
          border-radius: 8px;
        ">
          <h4 style="margin: 0 0 12px; font-size: 14px; color: var(--colorText);">当前配置：</h4>
          <pre style="
            margin: 0;
            padding: 12px;
            background: var(--colorFillTertiary, #f5f5f5);
            border-radius: 4px;
            font-size: 12px;
            overflow-x: auto;
            color: var(--colorText);
          ">{{ JSON.stringify(streamOptions, null, 2) }}</pre>
        </div>

        <VideoPlayer v-bind="args" :stream-options="streamOptions" />
      </div>
    `,
  }),
};

/**
 * WebM 视频格式
 * 支持 WebM 格式视频播放
 */
export const WebMVideo: Story = {
  args: {
    src: TEST_VIDEOS.webm,
  },
  render: (args) => ({
    components: { VideoPlayer },
    setup() {
      return { args };
    },
    template: `
      <div style="max-width: 800px;">
        <h3 style="margin-bottom: 16px; color: var(--colorText);">WebM 视频格式</h3>
        <p style="margin-bottom: 12px; font-size: 14px; color: var(--colorTextSecondary);">
          支持 WebM 开放视频格式，无需额外播放器
        </p>
        <VideoPlayer v-bind="args" />
      </div>
    `,
  }),
};
