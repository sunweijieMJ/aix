/**
 * AudioPlayer 时长解析测试（回归 #5）
 * Chrome 对 MediaRecorder 产出的 webm 会把 duration 报成 Infinity，
 * 而 useSpeech 的录音结果正好走这条链路
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import AudioPlayer from '../src/components/AudioPlayer/index.vue';

/** 可手动驱动的 Audio 桩 */
class FakeAudio {
  static instances: FakeAudio[] = [];

  duration = NaN;
  currentTime = 0;
  paused = true;
  onloadedmetadata: (() => void) | null = null;
  onended: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  /** 组件销毁音频时会摘掉 src 断开缓冲，桩需与 HTMLMediaElement 一致 */
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });

  constructor(public src: string) {
    FakeAudio.instances.push(this);
  }

  /** 模拟元数据加载完成 */
  loadMetadata(duration: number) {
    this.duration = duration;
    this.onloadedmetadata?.();
  }
}

beforeEach(() => {
  FakeAudio.instances = [];
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mountPlayer(props: Record<string, unknown> = {}) {
  return mount(AudioPlayer, {
    props: { src: 'https://cdn/a.webm', showWaveform: false, ...props },
  });
}

describe('AudioPlayer 时长显示', () => {
  it('元数据未加载时显示 00:00，不出现 NaN', () => {
    const wrapper = mountPlayer();
    // totalDuration 初值为 0，此时 00:00 是合理占位；NaN 绝不该出现
    expect(wrapper.text()).toContain('00:00');
    expect(wrapper.text()).not.toContain('NaN');
  });

  it('formatTime 对非有限值返回 --:--', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;

    // 无法 seek 的来源（如跨域流），时长保持不可用
    Object.defineProperty(audio, 'currentTime', {
      set() {
        throw new Error('seek not allowed');
      },
      get() {
        return 0;
      },
      configurable: true,
    });
    audio.loadMetadata(Infinity);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('Infinity');
    expect(wrapper.text()).not.toContain('NaN');
  });

  it('duration 为 Infinity 时不应渲染 Infinity:NaN（回归 #5）', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;

    audio.loadMetadata(Infinity);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('Infinity');
    expect(wrapper.text()).not.toContain('NaN');
  });

  it('duration 为 Infinity 时应 seek 触发浏览器回填真实时长', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;

    audio.loadMetadata(Infinity);

    // 组件 seek 到极大时间点强制浏览器扫描到流末尾
    expect(audio.currentTime).toBeGreaterThan(1e100);

    // 浏览器回填真实时长后派发 timeupdate
    audio.duration = 75;
    audio.ontimeupdate?.();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('01:15');
    expect(audio.currentTime).toBe(0); // 播放头已复位
  });

  it('正常音频应直接使用 duration，不做 seek', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;

    audio.loadMetadata(90);
    await wrapper.vm.$nextTick();

    expect(audio.currentTime).toBe(0);
    expect(wrapper.text()).toContain('01:30');
  });

  it('播放失败应复位状态并派发 error 事件（回归 N6）', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(60);
    audio.play = vi.fn(() => Promise.reject(new Error('autoplay blocked')));

    await wrapper.find('.aix-audio-player__btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 修复前：unhandled rejection，且 isPlaying 错误地停在 true
    expect(wrapper.emitted('error')).toBeTruthy();
    expect(wrapper.find('.aix-audio-player__play-icon--pause').exists()).toBe(false);
  });

  it('挂载时不应凭空派发 pause 事件', () => {
    const wrapper = mountPlayer();
    expect(wrapper.emitted('pause')).toBeFalsy();
  });

  it('播放中暂停才派发 pause', async () => {
    const wrapper = mountPlayer();
    FakeAudio.instances[0]!.loadMetadata(60);

    const btn = wrapper.find('.aix-audio-player__btn');
    await btn.trigger('click'); // play
    await btn.trigger('click'); // pause

    expect(wrapper.emitted('pause')).toHaveLength(1);
  });

  it('音频加载失败应派发 error 事件', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;

    audio.onerror?.();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('error')).toBeTruthy();
  });

  it('切换 src 应撤销旧的 Blob URL', async () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:one');

    const wrapper = mount(AudioPlayer, {
      props: { src: new Blob(['a']), showWaveform: false },
    });
    await wrapper.setProps({ src: new Blob(['b']) });

    expect(revoke).toHaveBeenCalledWith('blob:one');
    revoke.mockRestore();
  });

  it('切换 src 应复位时长，不沿用上一条音频的时间', async () => {
    const wrapper = mountPlayer();
    FakeAudio.instances[0]!.loadMetadata(120);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('02:00');

    await wrapper.setProps({ src: 'https://cdn/b.webm' });

    // 修复前 totalDuration 不复位：新音频元数据到达前显示旧时长，还能按旧时长 seek
    expect(wrapper.text()).toContain('00:00');
    expect(wrapper.text()).not.toContain('02:00');
  });

  it('销毁音频时应摘掉回调并断开 src，避免旧实例继续缓冲', async () => {
    const wrapper = mountPlayer();
    const first = FakeAudio.instances[0]!;

    await wrapper.setProps({ src: 'https://cdn/b.webm' });

    expect(first.removeAttribute).toHaveBeenCalledWith('src');
    expect(first.onended).toBeNull();
    expect(first.onerror).toBeNull();
  });

  it('时长未知时点击进度条不应把 currentTime 写成 Infinity/NaN', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(Infinity);
    audio.currentTime = 0; // 复位 seek 探测的影响

    await wrapper.find('.aix-audio-player__progress').trigger('click');

    expect(Number.isFinite(audio.currentTime)).toBe(true);
  });
});

describe('AudioPlayer 无障碍（回归 #24）', () => {
  it('播放按钮应有随状态变化的 aria-label', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(60);

    const btn = wrapper.find('.aix-audio-player__btn');
    expect(btn.attributes('aria-label')).toBe('播放');

    await btn.trigger('click');
    expect(btn.attributes('aria-label')).toBe('暂停');
    expect(btn.attributes('aria-pressed')).toBe('true');
  });

  it('进度条应是可聚焦的 slider 并暴露当前值', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(120);
    await wrapper.vm.$nextTick();

    const progress = wrapper.find('.aix-audio-player__progress');
    expect(progress.attributes('role')).toBe('slider');
    expect(progress.attributes('tabindex')).toBe('0');
    expect(progress.attributes('aria-valuemax')).toBe('120');
    expect(progress.attributes('aria-valuenow')).toBe('0');
  });

  it('方向键应可调节播放进度', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(100);
    await wrapper.vm.$nextTick();

    const progress = wrapper.find('.aix-audio-player__progress');
    await progress.trigger('keydown', { key: 'ArrowRight' });
    expect(audio.currentTime).toBe(5);

    await progress.trigger('keydown', { key: 'ArrowLeft' });
    expect(audio.currentTime).toBe(0);

    await progress.trigger('keydown', { key: 'End' });
    expect(audio.currentTime).toBe(100);

    await progress.trigger('keydown', { key: 'Home' });
    expect(audio.currentTime).toBe(0);
  });

  it('进度调节应被限制在 [0, duration] 内', async () => {
    const wrapper = mountPlayer();
    const audio = FakeAudio.instances[0]!;
    audio.loadMetadata(3); // 比步进还短
    await wrapper.vm.$nextTick();

    const progress = wrapper.find('.aix-audio-player__progress');
    await progress.trigger('keydown', { key: 'ArrowRight' });
    expect(audio.currentTime).toBe(3);

    await progress.trigger('keydown', { key: 'ArrowLeft' });
    expect(audio.currentTime).toBe(0);
  });

  it('空格键应切换播放状态', async () => {
    const wrapper = mountPlayer();
    FakeAudio.instances[0]!.loadMetadata(60);

    await wrapper.find('.aix-audio-player__progress').trigger('keydown', { key: ' ' });

    expect(wrapper.emitted('play')).toBeTruthy();
  });
});
