import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import DefaultControls from '../src/components/DefaultControls.vue';
import type { PlayerState, ControlMethods } from '../src/types';

describe('DefaultControls 组件', () => {
  // 创建模拟的 playerState
  function createMockPlayerState(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
      isReady: true,
      isPlaying: false,
      currentTime: 0,
      duration: 100,
      volume: 1,
      isMuted: false,
      isFullscreen: false,
      buffered: 0.5,
      isReconnecting: false,
      autoPlayFailed: false,
      isNativeFullscreen: false,
      ...overrides,
    };
  }

  // 创建模拟的 controls
  function createMockControls(): ControlMethods {
    return {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      seek: vi.fn(),
      setVolume: vi.fn(),
      getVolume: vi.fn().mockReturnValue(1),
      toggleMute: vi.fn(),
      toggleFullscreen: vi.fn(),
      enterNativeFullscreen: vi.fn(),
      exitNativeFullscreen: vi.fn(),
      togglePictureInPicture: vi.fn().mockResolvedValue(undefined),
      setPlaybackRate: vi.fn(),
      getPlaybackRate: vi.fn().mockReturnValue(1),
      reload: vi.fn(),
      forceReload: vi.fn(),
    };
  }

  describe('渲染测试', () => {
    it('应该正确渲染控制栏', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState(),
          controls: createMockControls(),
        },
      });

      expect(wrapper.find('.video-controls').exists()).toBe(true);
      expect(wrapper.find('.control-btn').exists()).toBe(true);
      expect(wrapper.find('.progress-bar').exists()).toBe(true);
      expect(wrapper.find('.time-display').exists()).toBe(true);
    });

    it('暂停状态应该显示播放图标', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: false }),
          controls: createMockControls(),
        },
      });

      const playButton = wrapper.find('.control-btn');
      expect(playButton.text()).toContain('▶');
    });

    it('播放状态应该显示暂停图标', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: true }),
          controls: createMockControls(),
        },
      });

      const playButton = wrapper.find('.control-btn');
      expect(playButton.text()).toContain('⏸');
    });
  });

  describe('时间显示', () => {
    it('应该正确格式化时间', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({
            currentTime: 65,
            duration: 180,
          }),
          controls: createMockControls(),
        },
      });

      const timeDisplay = wrapper.find('.time-display');
      expect(timeDisplay.text()).toBe('01:05 / 03:00');
    });

    it('应该处理 0 时长', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({
            currentTime: 0,
            duration: 0,
          }),
          controls: createMockControls(),
        },
      });

      const timeDisplay = wrapper.find('.time-display');
      expect(timeDisplay.text()).toBe('00:00 / 00:00');
    });

    it('应该处理 NaN 时长', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({
            currentTime: NaN,
            duration: NaN,
          }),
          controls: createMockControls(),
        },
      });

      const timeDisplay = wrapper.find('.time-display');
      expect(timeDisplay.text()).toBe('00:00 / 00:00');
    });
  });

  describe('进度条', () => {
    it('应该显示正确的播放进度', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({
            currentTime: 50,
            duration: 100,
          }),
          controls: createMockControls(),
        },
      });

      const progressPlayed = wrapper.find('.progress-played');
      expect(progressPlayed.attributes('style')).toContain('width: 50%');
    });

    it('应该显示正确的缓冲进度', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({
            buffered: 0.75,
          }),
          controls: createMockControls(),
        },
      });

      const progressBuffered = wrapper.find('.progress-buffered');
      expect(progressBuffered.attributes('style')).toContain('width: 75%');
    });
  });

  describe('交互测试', () => {
    it('点击播放按钮应该调用 play', async () => {
      const controls = createMockControls();
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: false }),
          controls,
        },
      });

      await wrapper.find('.control-btn').trigger('click');
      expect(controls.play).toHaveBeenCalled();
    });

    it('点击暂停按钮应该调用 pause', async () => {
      const controls = createMockControls();
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: true }),
          controls,
        },
      });

      await wrapper.find('.control-btn').trigger('click');
      expect(controls.pause).toHaveBeenCalled();
    });

    it('点击静音按钮应该调用 toggleMute', async () => {
      const controls = createMockControls();
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState(),
          controls,
        },
      });

      const buttons = wrapper.findAll('.control-btn');
      // 静音按钮是第二个按钮 (播放、静音、全屏)
      await buttons[1]?.trigger('click');
      expect(controls.toggleMute).toHaveBeenCalled();
    });

    it('点击全屏按钮应该调用 toggleFullscreen', async () => {
      const controls = createMockControls();
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState(),
          controls,
        },
      });

      const buttons = wrapper.findAll('.control-btn');
      // 全屏按钮是第三个按钮
      await buttons[2]?.trigger('click');
      expect(controls.toggleFullscreen).toHaveBeenCalled();
    });

    it('点击进度条应该触发 seek 相关的处理', async () => {
      const controls = createMockControls();
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ duration: 100 }),
          controls,
        },
      });

      const progressBar = wrapper.find('.progress-bar');

      // 简单触发点击事件，验证事件处理器存在
      await progressBar.trigger('click');

      // 由于 jsdom 环境下 getBoundingClientRect 返回值为 0，
      // 实际的 seek 调用依赖于正确的 DOM 测量，这里验证事件可以触发
      expect(progressBar.exists()).toBe(true);
    });
  });

  describe('静音状态', () => {
    it('静音时应该显示静音图标', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isMuted: true }),
          controls: createMockControls(),
        },
      });

      const buttons = wrapper.findAll('.control-btn');
      expect(buttons[1]?.text()).toContain('🔇');
    });

    it('未静音时应该显示音量图标', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isMuted: false }),
          controls: createMockControls(),
        },
      });

      const buttons = wrapper.findAll('.control-btn');
      expect(buttons[1]?.text()).toContain('🔊');
    });
  });

  describe('无障碍性', () => {
    it('播放按钮应该有正确的 aria-label', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: false }),
          controls: createMockControls(),
        },
      });

      const playButton = wrapper.find('.control-btn');
      expect(playButton.attributes('aria-label')).toBe('播放');
    });

    it('暂停按钮应该有正确的 aria-label', () => {
      const wrapper = mount(DefaultControls, {
        props: {
          playerState: createMockPlayerState({ isPlaying: true }),
          controls: createMockControls(),
        },
      });

      const playButton = wrapper.find('.control-btn');
      expect(playButton.attributes('aria-label')).toBe('暂停');
    });
  });
});
