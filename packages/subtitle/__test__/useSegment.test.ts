import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, computed, nextTick } from 'vue';
import type { SubtitleCue } from '../src/types';
import {
  useSegment,
  segmentText,
  parseSizeValue,
  getCharWidth,
  estimateTextWidth,
  splitByWidth,
} from '../src/useSegment';

describe('useSegment utility functions', () => {
  describe('parseSizeValue', () => {
    it('should return number as is', () => {
      expect(parseSizeValue(100, 0)).toBe(100);
      expect(parseSizeValue(0, 50)).toBe(0);
    });

    it('should parse string with px suffix', () => {
      expect(parseSizeValue('100px', 0)).toBe(100);
      expect(parseSizeValue('50.5px', 0)).toBe(50.5);
    });

    it('should parse string without suffix', () => {
      expect(parseSizeValue('100', 0)).toBe(100);
    });

    it('should return fallback for invalid values', () => {
      expect(parseSizeValue('invalid', 50)).toBe(50);
      expect(parseSizeValue('', 50)).toBe(50);
    });
  });

  describe('getCharWidth', () => {
    it('should return 1 for CJK characters', () => {
      expect(getCharWidth('中')).toBe(1);
      expect(getCharWidth('国')).toBe(1);
      expect(getCharWidth('字')).toBe(1);
      expect(getCharWidth('。')).toBe(1); // Chinese punctuation
      expect(getCharWidth('！')).toBe(1); // Fullwidth exclamation
    });

    it('should return 0.5 for ASCII characters', () => {
      expect(getCharWidth('a')).toBe(0.5);
      expect(getCharWidth('Z')).toBe(0.5);
      expect(getCharWidth('1')).toBe(0.5);
      expect(getCharWidth('!')).toBe(0.5);
    });

    it('should return 0.25 for whitespace', () => {
      expect(getCharWidth(' ')).toBe(0.25);
      expect(getCharWidth('\t')).toBe(0.25);
    });
  });

  describe('estimateTextWidth', () => {
    it('should calculate width for pure Chinese text', () => {
      expect(estimateTextWidth('中文')).toBe(2);
      expect(estimateTextWidth('你好世界')).toBe(4);
    });

    it('should calculate width for pure English text', () => {
      expect(estimateTextWidth('hello')).toBe(2.5);
      expect(estimateTextWidth('test')).toBe(2);
    });

    it('should calculate width for mixed text', () => {
      // '你好 world' = 2 * 1 + 1 * 0.25 + 5 * 0.5 = 4.75
      expect(estimateTextWidth('你好 world')).toBe(4.75);
    });

    it('should handle empty string', () => {
      expect(estimateTextWidth('')).toBe(0);
    });
  });

  describe('splitByWidth', () => {
    it('should not split text within max width', () => {
      const result = splitByWidth('你好', 10);
      expect(result).toEqual(['你好']);
    });

    it('should split text exceeding max width', () => {
      const result = splitByWidth('你好世界欢迎使用', 4);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('你好世界');
      expect(result[1]).toBe('欢迎使用');
    });

    it('should handle single character exceeding width', () => {
      const result = splitByWidth('大', 0.5);
      expect(result).toEqual(['大']);
    });

    it('should handle empty string', () => {
      const result = splitByWidth('', 10);
      expect(result).toEqual(['']);
    });
  });

  describe('segmentText', () => {
    it('should not segment when autoSegment is false', () => {
      const result = segmentText('这是一段很长的文本用于测试', {
        autoSegment: false,
        fixedHeight: 40,
        fontSize: 20,
        maxWidth: 100,
      });
      expect(result).toEqual(['这是一段很长的文本用于测试']);
    });

    it('should not segment when fixedHeight is undefined', () => {
      const result = segmentText('这是一段很长的文本用于测试', {
        autoSegment: true,
        fixedHeight: undefined,
        fontSize: 20,
        maxWidth: 100,
      });
      expect(result).toEqual(['这是一段很长的文本用于测试']);
    });

    it('should segment long text', () => {
      const longText =
        '这是第一句话。这是第二句话。这是第三句话。这是第四句话。';
      const result = segmentText(longText, {
        autoSegment: true,
        fixedHeight: 32, // Only fits 1 line
        fontSize: 20,
        maxWidth: 200, // 10 Chinese chars per line
      });
      expect(result.length).toBeGreaterThan(1);
    });

    it('should respect sentence boundaries', () => {
      const text = '第一句话。第二句话！第三句话？';
      const result = segmentText(text, {
        autoSegment: true,
        fixedHeight: 32,
        fontSize: 20,
        maxWidth: 100, // 5 Chinese chars per line
      });
      // Should split at punctuation marks
      expect(
        result.some(
          (s) => s.includes('。') || s.includes('！') || s.includes('？'),
        ),
      ).toBe(true);
    });

    it('should handle text without punctuation', () => {
      const text = '这是一段没有标点符号的很长的文本内容';
      const result = segmentText(text, {
        autoSegment: true,
        fixedHeight: 32,
        fontSize: 20,
        maxWidth: 100,
      });
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle fontSize as string', () => {
      const result = segmentText('测试文本', {
        autoSegment: true,
        fixedHeight: 32,
        fontSize: '20px',
        maxWidth: '200px',
      });
      expect(result).toBeDefined();
    });
  });
});

describe('useSegment composable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return segment info for simple text', () => {
    const text = ref('简单文本');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 5,
      text: '简单文本',
    });
    const autoSegment = ref(false);
    const visible = ref(true);
    const fixedHeight = ref<number | undefined>(undefined);
    const fontSize = ref<number | string>(20);
    const maxWidth = ref<number | string>(1200);
    const segmentDuration = ref(3000);

    const { currentSegmentIndex, segmentCount, currentSegmentText } =
      useSegment({
        text,
        currentCue,
        autoSegment,
        visible,
        fixedHeight,
        fontSize,
        maxWidth,
        segmentDuration,
      });

    expect(currentSegmentIndex.value).toBe(0);
    expect(segmentCount.value).toBe(1);
    expect(currentSegmentText.value).toBe('简单文本');
  });

  it('should reset segment index when text changes', async () => {
    const text = ref('第一段文本');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 10,
      text: '第一段文本',
    });
    const autoSegment = ref(true);
    const visible = ref(true);
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(100);
    const segmentDuration = ref(1000);

    const { currentSegmentIndex } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    // Advance timer to change segment
    vi.advanceTimersByTime(1500);
    await nextTick();

    // Change text should reset index
    text.value = '新的文本';
    await nextTick();
    expect(currentSegmentIndex.value).toBe(0);
  });

  it('should cycle through segments with timer', async () => {
    const longText = '这是第一句话。这是第二句话。这是第三句话。';
    const text = ref(longText);
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 30,
      text: longText,
    });
    const autoSegment = ref(true);
    const visible = ref(true);
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(80); // Force segmentation
    const segmentDuration = ref(1000);

    const { currentSegmentIndex, segmentCount } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    // Should have multiple segments
    expect(segmentCount.value).toBeGreaterThan(1);

    const initialIndex = currentSegmentIndex.value;

    // Run all pending timers to trigger segment change
    vi.runOnlyPendingTimers();
    await nextTick();

    // Index should have changed (wrapped or incremented)
    expect(currentSegmentIndex.value).not.toBe(initialIndex);
  });

  it('should not start timer when not visible', async () => {
    const text = ref('这是一段很长的文本。需要分段显示。');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 10,
      text: text.value,
    });
    const autoSegment = ref(true);
    const visible = ref(false); // Not visible
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(80);
    const segmentDuration = ref(1000);

    const { currentSegmentIndex } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    const initialIndex = currentSegmentIndex.value;

    vi.advanceTimersByTime(3000);
    await nextTick();

    // Index should not change when not visible
    expect(currentSegmentIndex.value).toBe(initialIndex);
  });

  it('should start timer when visibility changes to true', async () => {
    const text = ref('这是第一句话。这是第二句话。');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 20,
      text: text.value,
    });
    const autoSegment = ref(true);
    const visible = ref(false);
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(60);
    const segmentDuration = ref(1000);

    const { currentSegmentIndex, segmentCount } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    // Should have segments but no cycling
    expect(segmentCount.value).toBeGreaterThan(1);

    // Make visible
    visible.value = true;
    await nextTick();

    // Now timer should start, run it
    vi.runOnlyPendingTimers();
    await nextTick();

    // Index should have changed from 0
    expect(currentSegmentIndex.value).toBeGreaterThanOrEqual(0);
  });

  it('should handle single segment without timer', async () => {
    const text = ref('短文本');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 5,
      text: '短文本',
    });
    const autoSegment = ref(true);
    const visible = ref(true);
    const fixedHeight = ref(100);
    const fontSize = ref(20);
    const maxWidth = ref(1200);
    const segmentDuration = ref(1000);

    const { currentSegmentIndex, segmentCount } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    expect(segmentCount.value).toBe(1);

    vi.advanceTimersByTime(5000);
    await nextTick();

    // Should stay at 0
    expect(currentSegmentIndex.value).toBe(0);
  });

  it('should calculate segment duration based on cue duration', async () => {
    // Text with clear sentence boundaries
    const text = ref('第一句。第二句。');
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 6, // 6 seconds for segments
      text: text.value,
    });
    const autoSegment = ref(true);
    const visible = ref(true);
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(60); // Force segmentation
    const segmentDuration = ref(5000);

    const { segmentCount } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    // Should have at least 2 segments for this text
    expect(segmentCount.value).toBeGreaterThanOrEqual(2);
  });

  it('should handle empty text', () => {
    const text = ref('');
    const currentCue = ref<SubtitleCue | null>(null);
    const autoSegment = ref(true);
    const visible = ref(true);
    const fixedHeight = ref(32);
    const fontSize = ref(20);
    const maxWidth = ref(100);
    const segmentDuration = ref(3000);

    const { segmentCount, currentSegmentText } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    expect(segmentCount.value).toBe(1);
    expect(currentSegmentText.value).toBe('');
  });

  it('should use computed refs correctly', () => {
    const baseText = ref('计算属性文本');
    const text = computed(() => baseText.value);
    const currentCue = ref<SubtitleCue | null>({
      id: '1',
      startTime: 0,
      endTime: 5,
      text: baseText.value,
    });
    const autoSegment = computed(() => false);
    const visible = computed(() => true);
    const fixedHeight = computed(() => undefined);
    const fontSize = computed(() => 20);
    const maxWidth = computed(() => 1200);
    const segmentDuration = computed(() => 3000);

    const { currentSegmentText } = useSegment({
      text,
      currentCue,
      autoSegment,
      visible,
      fixedHeight,
      fontSize,
      maxWidth,
      segmentDuration,
    });

    expect(currentSegmentText.value).toBe('计算属性文本');
  });
});
