/**
 * ASRAdapter - ASR 适配器基类接口
 * 所有 ASR 供应商适配器必须实现此接口
 */
import type { ASRState, ASRResult, ASROptions } from '../../../types';

/** 取消订阅函数，由 on* 系列方法返回 */
export type Unsubscribe = () => void;

/**
 * PCM 音源 - 由编排层（useSpeech）提供的共享麦克风音频源
 * 需要外部推流的适配器通过它订阅 16-bit PCM 帧，避免各自重复 getUserMedia
 */
export interface PCMAudioSource {
  /** 音源采样率（Hz） */
  readonly sampleRate: number;
  /** 订阅 PCM 帧，返回取消订阅函数 */
  onPCM(callback: (frame: ArrayBuffer) => void): Unsubscribe;
}

/**
 * 音频来源模式 —— 编排层据此决定是否需要为适配器推流
 *   internal：适配器内部自行采集（如 BrowserASR 由 Web Speech API 内部采麦）
 *   external：必须由编排层推送音频，否则收不到任何数据（如 ProxyASR）
 *   managed： 可自行采集，也接受编排层注入共享音源（如 AliyunASR）
 */
export type ASRAudioSourceMode = 'internal' | 'external' | 'managed';

export interface ASRAdapter {
  /** 当前状态 */
  readonly state: ASRState;
  /**
   * 音频来源模式，编排层据此决定是否推流
   * 省略时按 'internal' 处理（等同于旧版本行为：编排层不推流），
   * 保证旧的自定义适配器无需改动即可继续工作
   */
  readonly audioSource?: ASRAudioSourceMode;
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
   * 注入共享 PCM 音源（audioSource 为 external/managed 的适配器实现）
   * 传 null 表示解除注入，适配器回退到自行采集（仅 managed 有效）
   */
  attachAudioSource?(source: PCMAudioSource | null): void;
  /**
   * 发送音频数据（流式识别，供手动推流场景使用）
   * 已注入 PCMAudioSource 时无需手动调用
   */
  sendAudio?(audioData: ArrayBuffer): void;
  /**
   * 注册识别结果回调
   * 返回取消订阅函数；返回 void 的旧实现仍可工作，但调用方无法注销订阅
   */
  onResult(callback: (result: ASRResult) => void): Unsubscribe | void;
  /** 注册错误回调，返回取消订阅函数 */
  onError(callback: (error: Error) => void): Unsubscribe | void;
  /** 注册状态变化回调，返回取消订阅函数 */
  onStateChange(callback: (state: ASRState) => void): Unsubscribe | void;
  /** 清空所有已注册回调（不断开连接） */
  clearCallbacks?(): void;
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

  /** 默认自行采集，需要外部推流的子类覆写此字段 */
  readonly audioSource: ASRAudioSourceMode = 'internal';

  constructor(options: ASROptions) {
    this.options = options;
  }

  get state(): ASRState {
    return this._state;
  }

  protected setState(state: ASRState): void {
    if (this._state !== state) {
      this._state = state;
      // 复制一份再遍历，避免回调内注销订阅导致遍历错位
      [...this.stateCallbacks].forEach((cb) => cb(state));
    }
  }

  protected emitResult(result: ASRResult): void {
    [...this.resultCallbacks].forEach((cb) => cb(result));
  }

  protected emitError(error: Error): void {
    [...this.errorCallbacks].forEach((cb) => cb(error));
  }

  onResult(callback: (result: ASRResult) => void): Unsubscribe {
    this.resultCallbacks.push(callback);
    return () => removeCallback(this.resultCallbacks, callback);
  }

  onError(callback: (error: Error) => void): Unsubscribe {
    this.errorCallbacks.push(callback);
    return () => removeCallback(this.errorCallbacks, callback);
  }

  onStateChange(callback: (state: ASRState) => void): Unsubscribe {
    this.stateCallbacks.push(callback);
    return () => removeCallback(this.stateCallbacks, callback);
  }

  clearCallbacks(): void {
    this.resultCallbacks = [];
    this.errorCallbacks = [];
    this.stateCallbacks = [];
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): void;
  abstract start(): void;
  abstract stop(): void;
  abstract destroy(): void;
}

/** 从回调数组中移除指定回调（幂等，重复调用无副作用） */
export function removeCallback<T>(list: T[], callback: T): void {
  const index = list.indexOf(callback);
  if (index !== -1) list.splice(index, 1);
}
