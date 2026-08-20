/**
 * @aix/audio 包导出 smoke test
 * 验证主要模块可以正确导入，不测试浏览器 API 行为
 */
import { describe, expect, it } from 'vitest';
import {
  Recorder,
  Resampler,
  VAD,
  BrowserASR,
  BrowserTTS,
  ProxyASR,
  ProxyTTS,
  ProviderManager,
  useASR,
  useTTS,
  useWaveform,
  useSpeech,
  WaveformCanvas,
  AudioPlayer,
} from '../src';

describe('@aix/audio 导出', () => {
  describe('核心类', () => {
    it('Recorder 可以实例化', () => {
      const r = new Recorder();
      expect(r).toBeDefined();
      expect(typeof r.init).toBe('function');
      expect(typeof r.start).toBe('function');
      expect(typeof r.stop).toBe('function');
      expect(typeof r.destroy).toBe('function');
    });

    it('Resampler 可以实例化并重采样', () => {
      const r = new Resampler({ sourceSampleRate: 44100, targetSampleRate: 16000 });
      const input = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5]);
      const output = r.resample(input);
      expect(output).toBeInstanceOf(Float32Array);
      expect(output.length).toBeGreaterThan(0);
    });

    it('Resampler.resample 采样率相同时直接返回原数组', () => {
      const r = new Resampler({ sourceSampleRate: 16000, targetSampleRate: 16000 });
      const input = new Float32Array([0.1, 0.5, 0.9]);
      expect(r.resample(input)).toBe(input);
    });

    it('VAD 可以实例化并返回状态', () => {
      const vad = new VAD({ threshold: 10, silenceDuration: 1000 });
      const state = vad.getState();
      expect(state).toHaveProperty('isSilent');
      expect(state).toHaveProperty('silenceDuration');
    });

    it('ProviderManager 可以实例化', () => {
      const m = new ProviderManager();
      expect(typeof m.createASR).toBe('function');
      expect(typeof m.createTTS).toBe('function');
      expect(typeof m.destroy).toBe('function');
    });
  });

  describe('Composables 可以导入', () => {
    it('useASR 是函数', () => expect(typeof useASR).toBe('function'));
    it('useTTS 是函数', () => expect(typeof useTTS).toBe('function'));
    it('useWaveform 是函数', () => expect(typeof useWaveform).toBe('function'));
    it('useSpeech 是函数', () => expect(typeof useSpeech).toBe('function'));
  });

  describe('适配器构造函数', () => {
    it('BrowserASR 继承自 BaseASRAdapter', () => {
      const asr = new BrowserASR({ provider: 'browser' });
      expect(asr.state).toBe('idle');
      expect(typeof asr.connect).toBe('function');
    });

    it('ProxyASR 缺少 auth 时应抛出', () => {
      expect(() => new ProxyASR({ provider: 'proxy' })).toThrow('ProxyASR 需要 auth 配置');
    });

    it('BrowserTTS 可以实例化', () => {
      const tts = new BrowserTTS();
      expect(tts.state).toBe('idle');
    });

    it('ProxyTTS 缺少 endpoint 时应抛出', () => {
      expect(() => new ProxyTTS({ provider: 'proxy' })).toThrow('ProxyTTS 需要 endpoint 配置');
    });
  });

  describe('UI 组件', () => {
    it('WaveformCanvas 是 Vue 组件（有 __name）', () => {
      expect(WaveformCanvas).toBeDefined();
    });

    it('AudioPlayer 是 Vue 组件', () => {
      expect(AudioPlayer).toBeDefined();
    });
  });
});
