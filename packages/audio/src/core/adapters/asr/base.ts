/**
 * ASRAdapter - ASR 适配器基类接口
 * 所有 ASR 供应商适配器必须实现此接口
 */
import type { ASRState, ASRResult, ASROptions } from '../../../types';

export interface ASRAdapter {
  /** 当前状态 */
  readonly state: ASRState;
  /** 连接到 ASR 服务 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): void;
  /** 开始识别 */
  start(): void;
  /** 停止识别 */
  stop(): void;
  /** 暂停识别（可选） */
  pause?(): void;
  /** 恢复识别（可选） */
  resume?(): void;
  /**
   * 发送音频数据（流式识别，部分适配器需要外部推流）
   */
  sendAudio?(audioData: ArrayBuffer): void;
  /** 注册识别结果回调 */
  onResult(callback: (result: ASRResult) => void): void;
  /** 注册错误回调 */
  onError(callback: (error: Error) => void): void;
  /** 注册状态变化回调 */
  onStateChange(callback: (state: ASRState) => void): void;
  /** 销毁适配器，释放所有资源 */
  destroy(): void;
}

/**
 * BaseASRAdapter - ASR 适配器抽象基类
 * 提供通用的状态管理和事件分发，子类只需实现核心业务方法
 */
export abstract class BaseASRAdapter implements ASRAdapter {
  protected _state: ASRState = 'idle';
  protected resultCallbacks: Array<(result: ASRResult) => void> = [];
  protected errorCallbacks: Array<(error: Error) => void> = [];
  protected stateCallbacks: Array<(state: ASRState) => void> = [];
  protected options: ASROptions;

  constructor(options: ASROptions) {
    this.options = options;
  }

  get state(): ASRState {
    return this._state;
  }

  protected setState(state: ASRState): void {
    if (this._state !== state) {
      this._state = state;
      this.stateCallbacks.forEach((cb) => cb(state));
    }
  }

  protected emitResult(result: ASRResult): void {
    this.resultCallbacks.forEach((cb) => cb(result));
  }

  protected emitError(error: Error): void {
    this.errorCallbacks.forEach((cb) => cb(error));
  }

  onResult(callback: (result: ASRResult) => void): void {
    this.resultCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  onStateChange(callback: (state: ASRState) => void): void {
    this.stateCallbacks.push(callback);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract start(): void;
  abstract stop(): void;
  abstract destroy(): void;
}
