/**
 * TTSAdapter - TTS 适配器基类接口
 * 所有 TTS 供应商适配器必须实现此接口
 */
import type { TTSState, TTSOptions } from '../../../types';

export interface TTSAdapter {
  /** 当前状态 */
  readonly state: TTSState;
  /** 合成并播放语音 */
  speak(text: string, options?: TTSOptions): Promise<void>;
  /** 暂停播放 */
  pause(): void;
  /** 恢复播放 */
  resume(): void;
  /** 停止播放 */
  stop(): void;
  /** 注册状态变化回调 */
  onStateChange(callback: (state: TTSState) => void): void;
  /** 注册错误回调 */
  onError(callback: (error: Error) => void): void;
  /** 销毁适配器 */
  destroy(): void;
}

/**
 * BaseTTSAdapter - TTS 适配器抽象基类
 */
export abstract class BaseTTSAdapter implements TTSAdapter {
  protected _state: TTSState = 'idle';
  protected stateCallbacks: Array<(state: TTSState) => void> = [];
  protected errorCallbacks: Array<(error: Error) => void> = [];

  get state(): TTSState {
    return this._state;
  }

  protected setState(state: TTSState): void {
    if (this._state !== state) {
      this._state = state;
      this.stateCallbacks.forEach((cb) => cb(state));
    }
  }

  protected emitError(error: Error): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  onStateChange(callback: (state: TTSState) => void): void {
    this.stateCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  abstract speak(text: string, options?: TTSOptions): Promise<void>;
  abstract pause(): void;
  abstract resume(): void;
  abstract stop(): void;
  abstract destroy(): void;
}
