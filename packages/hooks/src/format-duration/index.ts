export interface FormatDurationOptions {
  /**
   * 时长不可用（NaN / Infinity / 负数）时返回的占位串。
   *
   * 播放器在元数据加载完成前拿到的 duration 常是 NaN 或 Infinity，
   * 音频播放器习惯显示 `--:--` 表示「未知」，视频控件则直接归零。
   *
   * @default '00:00'
   */
  fallback?: string;
}

/**
 * 把秒数格式化为 `mm:ss`，超过一小时自动进位为 `hh:mm:ss`。
 *
 * 抽到 hooks 是因为此前三处各写一份且行为已经漂移：@aix/video 包内
 * DefaultControls 不进位、PlaybackControls 进位，同一个 1.5 小时的视频
 * 一处显示 `90:00`、另一处显示 `01:30:00`。
 *
 * @param seconds - 时长（秒）
 * @param options - 见 {@link FormatDurationOptions}
 * @returns 格式化后的时长串
 *
 * @example
 * ```ts
 * formatDuration(65);                          // '01:05'
 * formatDuration(5400);                        // '01:30:00'
 * formatDuration(NaN);                         // '00:00'
 * formatDuration(NaN, { fallback: '--:--' });  // '--:--'
 * ```
 */
export function formatDuration(seconds: number, options: FormatDurationOptions = {}): string {
  const { fallback = '00:00' } = options;
  if (!Number.isFinite(seconds) || seconds < 0) return fallback;

  const pad = (n: number): string => String(n).padStart(2, '0');
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
