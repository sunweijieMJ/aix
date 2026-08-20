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

/**
 * 桩适配器：模拟真实适配器的状态机契约
 * 状态由适配器自身派发（start → recording、stop → stopped、错误 → error），
 * composable 只做订阅，不再手写状态，桩必须同样遵守这套契约才测得准
 */
const stateListeners: Array<(s: ASRState) => void> = [];

function emitState(next: ASRState): void {
  mockAdapter.state = next;
  stateListeners.forEach((cb) => cb(next));
}

const mockAdapter = {
  state: 'idle' as ASRState,
  audioSource: 'internal' as const,
  connect: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(() => emitState('recording')),
  stop: vi.fn(() => emitState('stopped')),
  destroy: vi.fn(),
  clearCallbacks: vi.fn(),
  onResult: vi.fn(() => () => {}),
  onError: vi.fn(() => () => {}),
  onStateChange: vi.fn((cb: (s: ASRState) => void) => {
    stateListeners.push(cb);
    return () => {
      const i = stateListeners.indexOf(cb);
      if (i !== -1) stateListeners.splice(i, 1);
    };
  }),
};

vi.mock('../src/core/manager', () => ({
  ProviderManager: vi.fn(function MockProviderManager(this: object) {
    Object.assign(this, {
      getASR: vi.fn().mockReturnValue(mockAdapter),
      peekASR: vi.fn().mockReturnValue(mockAdapter),
      switchASR: vi.fn().mockReturnValue(mockAdapter),
      destroy: vi.fn(),
    });
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  stateListeners.length = 0;
  mockAdapter.state = 'idle';
  // clearAllMocks 会清掉实现，重新装回状态机契约
  mockAdapter.start.mockImplementation(() => emitState('recording'));
  mockAdapter.stop.mockImplementation(() => emitState('stopped'));
  mockAdapter.onResult.mockImplementation(() => () => {});
  mockAdapter.onError.mockImplementation(() => () => {});
  mockAdapter.onStateChange.mockImplementation((cb: (s: ASRState) => void) => {
    stateListeners.push(cb);
    return () => {
      const i = stateListeners.indexOf(cb);
      if (i !== -1) stateListeners.splice(i, 1);
    };
  });
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
    it('适配器错误应更新 error.value', async () => {
      const asr = mountASR();
      await asr.connect();

      const onErrorCallback = mockAdapter.onError.mock.calls[0][0] as (e: Error) => void;
      const err = new Error('识别服务异常');
      onErrorCallback(err);

      expect(asr.error.value).toBe(err);
    });

    it('state 由适配器派发的 error 状态驱动，composable 不自行写入', async () => {
      const asr = mountASR();
      await asr.connect();

      emitState('error');

      expect(asr.state.value).toBe('error');
    });
  });

  describe('订阅生命周期（回归 #1：识别文本 N 倍累积）', () => {
    it('重复 connect() 不应重复注册回调', async () => {
      const asr = mountASR();

      await asr.connect();
      await asr.connect();
      await asr.connect();

      // 每次 connect 都会先释放旧订阅，最终只剩一份存活的状态回调
      expect(stateListeners).toHaveLength(1);
    });

    it('三轮 connect + 单次识别结果，文本不应累积翻倍', async () => {
      const asr = mountASR();

      for (let session = 0; session < 3; session++) {
        await asr.connect();
        // 取最近一次注册的 onResult 回调，模拟适配器派发结果
        const calls = mockAdapter.onResult.mock.calls;
        const latest = calls[calls.length - 1]![0] as (r: ASRResult) => void;
        latest({ text: '你好', isFinal: true });
      }

      // 每轮各喂入一次「你好」，三轮应恰好三次，而非 1+2+3=6 次
      expect(asr.finalText.value).toBe('你好你好你好');
    });
  });
});
