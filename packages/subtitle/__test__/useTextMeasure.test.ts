import {
  prepare as _prepare,
  prepareWithSegments as _prepareWithSegments,
  layout as _layout,
  layoutWithLines as _layoutWithLines,
} from '@chenglou/pretext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useTextMeasure } from '../src/useTextMeasure';

// Mock @chenglou/pretext
vi.mock('@chenglou/pretext', () => ({
  prepare: vi.fn(() => ({ __brand: 'prepared' })),
  prepareWithSegments: vi.fn(() => ({ __brand: 'preparedWithSegments' })),
  layout: vi.fn(() => ({ lineCount: 2, height: 64 })),
  layoutWithLines: vi.fn(() => ({
    lineCount: 2,
    height: 64,
    lines: [
      {
        text: '第一行内容',
        width: 100,
        start: { segmentIndex: 0, graphemeIndex: 0 },
        end: { segmentIndex: 0, graphemeIndex: 5 },
      },
      {
        text: '第二行内容',
        width: 90,
        start: { segmentIndex: 0, graphemeIndex: 5 },
        end: { segmentIndex: 0, graphemeIndex: 10 },
      },
    ],
  })),
}));

const prepare = vi.mocked(_prepare);
const prepareWithSegments = vi.mocked(_prepareWithSegments);
const layout = vi.mocked(_layout);
const layoutWithLines = vi.mocked(_layoutWithLines);

describe('useTextMeasure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('初始状态 ready 为 false（无容器）', () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { ready } = useTextMeasure({ containerRef, fontSize });

    expect(ready.value).toBe(false);
  });

  it('容器挂载后 ready 变为 true', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { ready } = useTextMeasure({ containerRef, fontSize });
    expect(ready.value).toBe(false);

    // 模拟容器挂载
    const mockEl = document.createElement('div');
    // jsdom 中 getComputedStyle 返回的 font 可能为空，测试降级拼接
    containerRef.value = mockEl;
    await nextTick();

    expect(ready.value).toBe(true);
  });

  it('measureText 在未就绪时返回零值', () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { measureText } = useTextMeasure({ containerRef, fontSize });

    const result = measureText('测试文本', 300, 32);
    expect(result).toEqual({ lineCount: 0, height: 0 });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('measureText 在就绪时调用 Pretext API', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { measureText } = useTextMeasure({ containerRef, fontSize });

    // 模拟容器挂载
    containerRef.value = document.createElement('div');
    await nextTick();

    const result = measureText('测试文本', 300, 32);
    expect(prepare).toHaveBeenCalled();
    expect(layout).toHaveBeenCalled();
    expect(result).toEqual({ lineCount: 2, height: 64 });
  });

  it('getLines 在未就绪时返回原文本', () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { getLines } = useTextMeasure({ containerRef, fontSize });

    const result = getLines('测试文本', 300, 32);
    expect(result).toEqual(['测试文本']);
    expect(prepareWithSegments).not.toHaveBeenCalled();
  });

  it('getLines 在就绪时调用 Pretext API', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { getLines } = useTextMeasure({ containerRef, fontSize });

    containerRef.value = document.createElement('div');
    await nextTick();

    const result = getLines('测试文本', 300, 32);
    expect(prepareWithSegments).toHaveBeenCalled();
    expect(layoutWithLines).toHaveBeenCalled();
    expect(result).toEqual(['第一行内容', '第二行内容']);
  });

  it('空文本返回零值', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref(20);

    const { measureText, getLines } = useTextMeasure({
      containerRef,
      fontSize,
    });

    containerRef.value = document.createElement('div');
    await nextTick();

    expect(measureText('', 300, 32)).toEqual({ lineCount: 0, height: 0 });
    expect(getLines('', 300, 32)).toEqual(['']);
  });

  it('fontSize 变化时更新字体', async () => {
    const containerRef = ref<HTMLElement | null>(null);
    const fontSize = ref<number | string>(20);

    const { ready } = useTextMeasure({ containerRef, fontSize });

    containerRef.value = document.createElement('div');
    await nextTick();
    expect(ready.value).toBe(true);

    // 改变 fontSize，watch 应重新执行
    fontSize.value = '24px';
    await nextTick();
    // ready 应保持 true
    expect(ready.value).toBe(true);
  });
});
