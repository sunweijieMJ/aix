/**
 * useASR 单元测试
 * mock ProviderManager，聚焦于 Composable 自身逻辑
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineComponent } from 'vue';
import { useASR } from '../src/composables/useASR';
import type { ASRResult, ASRState } from '../src/types';

// ── Mock ProviderManager ─────────────────────────────────────────────────────

const mockAdapter = {
  state: 'idle' as ASRState,
  connect: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  stop: vi.fn(),
  destroy: vi.fn(),
  onResult: vi.fn(),
  onError: vi.fn(),
  onStateChange: vi.fn(),
};

vi.mock('../src/core/manager', () => ({
  ProviderManager: vi.fn(function MockProviderManager(this: object) {
    Object.assign(this, {
      getASR: vi.fn().mockReturnValue(mockAdapter),
      switchASR: vi.fn().mockReturnValue(mockAdapter),
      destroy: vi.fn(),
    });
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // 重置回调存储
  mockAdapter.onResult.mockImplementation(vi.fn());
  mockAdapter.onError.mockImplementation(vi.fn());
  mockAdapter.onStateChange.mockImplementation(vi.fn());
});

// ── 辅助：在 Vue 组件中执行 composable ────────────────────────────────────────

function mountASR(options = {}) {
  let composable: ReturnType<typeof useASR>;

  const TestComponent = defineComponent({
    setup() {
      composable = useASR(options as any);
      return {};
    },
    template: '<div />',
  });

  mount(TestComponent);
  return composable!;
}

describe('useASR', () => {
  describe('初始状态', () => {
    it('state 初始值应为 idle', () => {
      const asr = mountASR();
      expect(asr.state.value).toBe('idle');
    });

    it('finalText / interimText 初始值应为空字符串', () => {
      const asr = mountASR();
      expect(asr.finalText.value).toBe('');
      expect(asr.interimText.value).toBe('');
    });

    it('displayText = finalText + interimText', () => {
      const asr = mountASR();
      asr.finalText.value = '已确认 ';
      asr.interimText.value = '识别中';
      expect(asr.displayText.value).toBe('已确认 识别中');
    });

    it('isIdle 在 idle 状态下应为 true', () => {
      const asr = mountASR();
      expect(asr.isIdle.value).toBe(true);
    });
  });

  describe('resetText()', () => {
    it('应清空 finalText 和 interimText', () => {
      const asr = mountASR();
      asr.finalText.value = '一些内容';
      asr.interimText.value = '中间结果';

      asr.resetText();

      expect(asr.finalText.value).toBe('');
      expect(asr.interimText.value).toBe('');
    });
  });

  describe('connect()', () => {
    it('应调用适配器的 connect 并注册三个回调', async () => {
      const asr = mountASR();
      await asr.connect();

      expect(mockAdapter.connect).toHaveBeenCalledOnce();
      expect(mockAdapter.onResult).toHaveBeenCalledOnce();
      expect(mockAdapter.onError).toHaveBeenCalledOnce();
      expect(mockAdapter.onStateChange).toHaveBeenCalledOnce();
    });
  });

  describe('startRecognition() / stopRecognition()', () => {
    it('startRecognition 应调用 adapter.start 并设置 state=recording', async () => {
      const asr = mountASR();
      await asr.connect();
      asr.startRecognition();

      expect(mockAdapter.start).toHaveBeenCalledOnce();
      expect(asr.state.value).toBe('recording');
    });

    it('stopRecognition 应调用 adapter.stop 并设置 state=stopped', async () => {
      const asr = mountASR();
      await asr.connect();
      asr.startRecognition();
      asr.stopRecognition();

      expect(mockAdapter.stop).toHaveBeenCalledOnce();
      expect(asr.state.value).toBe('stopped');
    });
  });

  describe('onResult 回调处理', () => {
    it('最终结果（isFinal=true）应追加到 finalText 并清空 interimText', async () => {
      const asr = mountASR();
      await asr.connect();

      // 获取注册的 onResult 回调
      const onResultCallback = mockAdapter.onResult.mock.calls[0][0] as (r: ASRResult) => void;

      // 模拟中间结果
      onResultCallback({ text: '你好', isFinal: false });
      expect(asr.interimText.value).toBe('你好');
      expect(asr.finalText.value).toBe('');

      // 模拟最终结果
      onResultCallback({ text: '你好世界', isFinal: true });
      expect(asr.finalText.value).toBe('你好世界');
      expect(asr.interimText.value).toBe('');
    });

    it('多条最终结果应累积追加到 finalText', async () => {
      const asr = mountASR();
      await asr.connect();

      const onResultCallback = mockAdapter.onResult.mock.calls[0][0] as (r: ASRResult) => void;

      onResultCallback({ text: '第一句。', isFinal: true });
      onResultCallback({ text: '第二句。', isFinal: true });

      expect(asr.finalText.value).toBe('第一句。第二句。');
    });
  });

  describe('onError 回调处理', () => {
    it('适配器错误应更新 error.value 并设置 state=error', async () => {
      const asr = mountASR();
      await asr.connect();

      const onErrorCallback = mockAdapter.onError.mock.calls[0][0] as (e: Error) => void;
      const err = new Error('识别服务异常');
      onErrorCallback(err);

      expect(asr.error.value).toBe(err);
      expect(asr.state.value).toBe('error');
    });
  });
});
