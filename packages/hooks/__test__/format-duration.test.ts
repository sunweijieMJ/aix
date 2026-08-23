import { describe, expect, it } from 'vitest';
import { formatDuration } from '../src/format-duration';

describe('formatDuration', () => {
  describe('mm:ss（不足一小时）', () => {
    it('零秒应补零成 00:00', () => {
      expect(formatDuration(0)).toBe('00:00');
    });

    it('应按分秒补零', () => {
      expect(formatDuration(5)).toBe('00:05');
      expect(formatDuration(65)).toBe('01:05');
      expect(formatDuration(600)).toBe('10:00');
    });

    it('应向下取整而非四舍五入', () => {
      expect(formatDuration(59.9)).toBe('00:59');
    });

    it('恰好 59:59 仍不进位到小时', () => {
      expect(formatDuration(3599)).toBe('59:59');
    });
  });

  describe('hh:mm:ss（满一小时自动进位）', () => {
    it('恰好一小时应进位', () => {
      expect(formatDuration(3600)).toBe('01:00:00');
    });

    it('1.5 小时应为 01:30:00 而非 90:00', () => {
      // 回归：@aix/video 包内两处实现曾对同一时长分别输出 90:00 与 01:30:00
      expect(formatDuration(5400)).toBe('01:30:00');
    });

    it('超过十小时不截断', () => {
      expect(formatDuration(36061)).toBe('10:01:01');
    });
  });

  describe('不可用时长', () => {
    it('NaN / Infinity / 负数应返回兜底串', () => {
      expect(formatDuration(NaN)).toBe('00:00');
      expect(formatDuration(Infinity)).toBe('00:00');
      expect(formatDuration(-Infinity)).toBe('00:00');
      expect(formatDuration(-1)).toBe('00:00');
    });

    it('fallback 可自定义（音频播放器用 --:--）', () => {
      expect(formatDuration(NaN, { fallback: '--:--' })).toBe('--:--');
      expect(formatDuration(Infinity, { fallback: '--:--' })).toBe('--:--');
      expect(formatDuration(-1, { fallback: '--:--' })).toBe('--:--');
    });

    it('fallback 不影响合法时长', () => {
      expect(formatDuration(65, { fallback: '--:--' })).toBe('01:05');
    });
  });
});
