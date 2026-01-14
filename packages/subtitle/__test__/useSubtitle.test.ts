import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import type { SubtitleCue, SubtitleSource } from '../src/types';
import { useSubtitle } from '../src/useSubtitle';

// Mock fetch for URL loading tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useSubtitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with empty state', () => {
      const { cues, currentCue, currentIndex, loading, error } = useSubtitle();

      expect(cues.value).toEqual([]);
      expect(currentCue.value).toBeNull();
      expect(currentIndex.value).toBe(-1);
      expect(loading.value).toBe(false);
      expect(error.value).toBeNull();
    });
  });

  describe('load', () => {
    it('should load cues from source type "cues"', async () => {
      const { cues, load, loading } = useSubtitle();

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 0, endTime: 5, text: 'First' },
        { id: '2', startTime: 5, endTime: 10, text: 'Second' },
      ];

      const source: SubtitleSource = { type: 'cues', cues: testCues };

      await load(source);

      expect(loading.value).toBe(false);
      expect(cues.value).toEqual(testCues);
    });

    it('should load cues from source type "text"', async () => {
      const { cues, load } = useSubtitle();

      const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
First subtitle

00:00:05.000 --> 00:00:10.000
Second subtitle`;

      const source: SubtitleSource = {
        type: 'text',
        content: vttContent,
        format: 'vtt',
      };

      await load(source);

      expect(cues.value).toHaveLength(2);
      expect(cues.value[0]?.text).toBe('First subtitle');
      expect(cues.value[1]?.text).toBe('Second subtitle');
    });

    it('should load cues from source type "url"', async () => {
      const vttContent = `WEBVTT

00:00:00.000 --> 00:00:05.000
Test subtitle`;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(vttContent),
      });

      const { cues, load } = useSubtitle();
      const source: SubtitleSource = {
        type: 'url',
        url: 'https://example.com/subtitle.vtt',
      };

      await load(source);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/subtitle.vtt',
      );
      expect(cues.value).toHaveLength(1);
      expect(cues.value[0]?.text).toBe('Test subtitle');
    });

    it('should handle URL load failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const { error, load } = useSubtitle();
      const source: SubtitleSource = {
        type: 'url',
        url: 'https://example.com/notfound.vtt',
      };

      await load(source);

      expect(error.value).toBeInstanceOf(Error);
      expect(error.value?.message).toContain('404');
    });

    it('should reset state before loading', async () => {
      const { cues, currentCue, currentIndex, load } = useSubtitle();

      // First load
      await load({
        type: 'cues',
        cues: [{ id: '1', startTime: 0, endTime: 5, text: 'First' }],
      });
      expect(cues.value).toHaveLength(1);

      // Second load should reset
      await load({
        type: 'cues',
        cues: [{ id: '2', startTime: 0, endTime: 5, text: 'Second' }],
      });
      expect(cues.value).toHaveLength(1);
      expect(cues.value[0]?.text).toBe('Second');
      expect(currentCue.value).toBeNull();
      expect(currentIndex.value).toBe(-1);
    });

    it('should sync with currentTime after loading', async () => {
      const currentTime = ref(3);
      const { currentCue, currentIndex, load } = useSubtitle({ currentTime });

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 0, endTime: 5, text: 'First' },
        { id: '2', startTime: 5, endTime: 10, text: 'Second' },
      ];

      await load({ type: 'cues', cues: testCues });

      expect(currentIndex.value).toBe(0);
      expect(currentCue.value?.text).toBe('First');
    });
  });

  describe('time synchronization', () => {
    it('should update currentCue when currentTime changes', async () => {
      const currentTime = ref(0);
      const { currentCue, currentIndex, load } = useSubtitle({ currentTime });

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 0, endTime: 5, text: 'First' },
        { id: '2', startTime: 5, endTime: 10, text: 'Second' },
        { id: '3', startTime: 10, endTime: 15, text: 'Third' },
      ];

      await load({ type: 'cues', cues: testCues });

      // Initially at 0
      expect(currentIndex.value).toBe(0);
      expect(currentCue.value?.text).toBe('First');

      // Move to second cue
      currentTime.value = 7;
      await nextTick();
      expect(currentIndex.value).toBe(1);
      expect(currentCue.value?.text).toBe('Second');

      // Move to third cue
      currentTime.value = 12;
      await nextTick();
      expect(currentIndex.value).toBe(2);
      expect(currentCue.value?.text).toBe('Third');
    });

    it('should set currentCue to null when time is outside all cues', async () => {
      const currentTime = ref(0);
      const { currentCue, currentIndex, load } = useSubtitle({ currentTime });

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 5, endTime: 10, text: 'First' },
      ];

      await load({ type: 'cues', cues: testCues });

      // Before first cue
      expect(currentIndex.value).toBe(-1);
      expect(currentCue.value).toBeNull();

      // After last cue
      currentTime.value = 15;
      await nextTick();
      expect(currentIndex.value).toBe(-1);
      expect(currentCue.value).toBeNull();
    });

    it('should call onChange callback when cue changes', async () => {
      const currentTime = ref(0);
      const onChange = vi.fn();
      const { load } = useSubtitle({ currentTime, onChange });

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 0, endTime: 5, text: 'First' },
        { id: '2', startTime: 5, endTime: 10, text: 'Second' },
      ];

      await load({ type: 'cues', cues: testCues });

      // Should be called once after load sync
      expect(onChange).toHaveBeenCalledWith(testCues[0], 0);

      onChange.mockClear();

      // Change time to trigger cue change
      currentTime.value = 7;
      await nextTick();
      expect(onChange).toHaveBeenCalledWith(testCues[1], 1);
    });

    it('should not call onChange when cue does not change', async () => {
      const currentTime = ref(1);
      const onChange = vi.fn();
      const { load } = useSubtitle({ currentTime, onChange });

      await load({
        type: 'cues',
        cues: [{ id: '1', startTime: 0, endTime: 10, text: 'First' }],
      });

      onChange.mockClear();

      // Change time but stay in same cue
      currentTime.value = 2;
      await nextTick();
      currentTime.value = 3;
      await nextTick();

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('getCueAtTime', () => {
    it('should return cue at given time', async () => {
      const { getCueAtTime, load } = useSubtitle();

      const testCues: SubtitleCue[] = [
        { id: '1', startTime: 0, endTime: 5, text: 'First' },
        { id: '2', startTime: 5, endTime: 10, text: 'Second' },
      ];

      await load({ type: 'cues', cues: testCues });

      expect(getCueAtTime(2)?.text).toBe('First');
      expect(getCueAtTime(7)?.text).toBe('Second');
      expect(getCueAtTime(15)).toBeNull();
    });

    it('should return null for empty cues', () => {
      const { getCueAtTime } = useSubtitle();
      expect(getCueAtTime(5)).toBeNull();
    });
  });

  describe('updateTime', () => {
    it('should manually update current time', async () => {
      const { currentCue, updateTime, load } = useSubtitle();

      await load({
        type: 'cues',
        cues: [
          { id: '1', startTime: 0, endTime: 5, text: 'First' },
          { id: '2', startTime: 5, endTime: 10, text: 'Second' },
        ],
      });

      updateTime(7);
      expect(currentCue.value?.text).toBe('Second');

      updateTime(2);
      expect(currentCue.value?.text).toBe('First');
    });
  });

  describe('binary search optimization', () => {
    it('should efficiently find cues in large list', async () => {
      const { getCueAtTime, load } = useSubtitle();

      // Create 1000 cues
      const testCues: SubtitleCue[] = Array.from({ length: 1000 }, (_, i) => ({
        id: String(i + 1),
        startTime: i * 5,
        endTime: (i + 1) * 5,
        text: `Cue ${i + 1}`,
      }));

      await load({ type: 'cues', cues: testCues });

      // Test various positions
      expect(getCueAtTime(0)?.text).toBe('Cue 1');
      expect(getCueAtTime(2500)?.text).toBe('Cue 501');
      expect(getCueAtTime(4995)?.text).toBe('Cue 1000');
      expect(getCueAtTime(5000)).toBeNull(); // Outside range
    });

    it('should optimize sequential access', async () => {
      const currentTime = ref(0);
      const { currentCue, load } = useSubtitle({ currentTime });

      const testCues: SubtitleCue[] = Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 1),
        startTime: i * 5,
        endTime: (i + 1) * 5,
        text: `Cue ${i + 1}`,
      }));

      await load({ type: 'cues', cues: testCues });

      // Sequential access should use optimization
      for (let i = 0; i < 10; i++) {
        currentTime.value = i * 5 + 2;
        await nextTick();
        expect(currentCue.value?.text).toBe(`Cue ${i + 1}`);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle cues with same start and end time', async () => {
      const { getCueAtTime, load } = useSubtitle();

      await load({
        type: 'cues',
        cues: [{ id: '1', startTime: 5, endTime: 5, text: 'Instant' }],
      });

      // Time exactly at the cue should not match (endTime is exclusive)
      expect(getCueAtTime(5)).toBeNull();
    });

    it('should handle overlapping cues', async () => {
      const { getCueAtTime, load } = useSubtitle();

      await load({
        type: 'cues',
        cues: [
          { id: '1', startTime: 0, endTime: 10, text: 'First' },
          { id: '2', startTime: 5, endTime: 15, text: 'Second' },
        ],
      });

      // Should return first matching cue
      expect(getCueAtTime(7)?.text).toBe('First');
    });

    it('should handle time at exact cue boundary', async () => {
      const { getCueAtTime, load } = useSubtitle();

      await load({
        type: 'cues',
        cues: [
          { id: '1', startTime: 0, endTime: 5, text: 'First' },
          { id: '2', startTime: 5, endTime: 10, text: 'Second' },
        ],
      });

      // At boundary, should match second cue (endTime is exclusive)
      expect(getCueAtTime(5)?.text).toBe('Second');
    });
  });
});
