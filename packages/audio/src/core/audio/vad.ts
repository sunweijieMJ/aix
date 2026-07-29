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
   * @param callback - 状态变化回调（说话↔静音 切换时触发）
   */
  start(getEnergy: () => number, callback: VADCallback): void {
    this.getEnergy = getEnergy;
    this.callback = callback;
    this.lastSpeechTime = Date.now();
    this.isSilent = true;

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
      if (this.isSilent) {
        this.isSilent = false;
        this.callback({ isSilent: false, energy, timestamp: now });
      }
    } else {
      const silenceDuration = now - this.lastSpeechTime;
      if (!this.isSilent && silenceDuration >= this.config.silenceDuration) {
        this.isSilent = true;
        this.callback({ isSilent: true, energy, timestamp: now });
      }
    }
  }
}
