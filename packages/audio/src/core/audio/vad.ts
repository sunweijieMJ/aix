/**
 * VAD - Voice Activity Detection（语音活动检测）
 * 基于能量阈值的简单静音检测，用于自动断句和超时停录
 */
import type { VADConfig, VADEvent } from '../../types';

const DEFAULT_CONFIG: Required<VADConfig> = {
  threshold: 10, // 能量阈值（0-100）
  silenceDuration: 1500, // 静音判定时长（毫秒）
  sampleInterval: 100, // 采样间隔（毫秒）
};

export type VADCallback = (event: VADEvent) => void;

export class VAD {
  private config: Required<VADConfig>;
  private lastSpeechTime = 0;
  private isSilent = true;
  /**
   * 本轮静音是否已通知过，说话后复位
   * 只靠 isSilent 做边沿判定会漏掉「开麦后从未出声」的场景：
   * 初始即为静音态，永远等不到 说话→静音 的跳变
   */
  private silenceNotified = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private callback: VADCallback | null = null;
  private getEnergy: (() => number) | null = null;

  constructor(config: VADConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 开始检测
   * @param getEnergy - 获取当前能量值的函数，返回 **0-1** 归一化值
   *   （与 `WaveformAnalyser.getEnergy()` 一致，内部会换算为 0-100 再比对 threshold）
   * @param callback - 状态变化回调（进入说话态、或静音累计达到阈值时触发）
   *
   * 计时从 start() 起算：即便用户全程未出声，静音满 silenceDuration 也会通知一次
   */
  start(getEnergy: () => number, callback: VADCallback): void {
    this.getEnergy = getEnergy;
    this.callback = callback;
    this.lastSpeechTime = Date.now();
    this.isSilent = true;
    this.silenceNotified = false;

    this.timer = setInterval(() => this.check(), this.config.sampleInterval);
  }

  /**
   * 停止检测
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.callback = null;
    this.getEnergy = null;
  }

  /**
   * 获取当前状态
   */
  getState(): { isSilent: boolean; silenceDuration: number } {
    return {
      isSilent: this.isSilent,
      silenceDuration: Date.now() - this.lastSpeechTime,
    };
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────────

  private check(): void {
    if (!this.getEnergy || !this.callback) return;

    const energy = this.getEnergy() * 100; // 转为 0-100 范围
    const now = Date.now();
    const isSpeaking = energy >= this.config.threshold;

    if (isSpeaking) {
      this.lastSpeechTime = now;
      this.silenceNotified = false;
      if (this.isSilent) {
        this.isSilent = false;
        this.callback({ isSilent: false, energy, timestamp: now });
      }
    } else {
      const silenceDuration = now - this.lastSpeechTime;
      // 用 silenceNotified 而非 isSilent 判定：既能覆盖「从未出声」的初始静音，
      // 又保证同一段静音只通知一次
      if (!this.silenceNotified && silenceDuration >= this.config.silenceDuration) {
        this.silenceNotified = true;
        this.isSilent = true;
        this.callback({ isSilent: true, energy, timestamp: now });
      }
    }
  }
}
