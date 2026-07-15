/**
 * Resampler - PCM 重采样器
 * 将音频从源采样率转换到目标采样率，用于适配各 ASR 供应商的采样率要求
 */

export interface ResamplerConfig {
  /** 源采样率（Hz） */
  sourceSampleRate: number;
  /** 目标采样率（Hz） */
  targetSampleRate: number;
  /** 声道数，默认 1 */
  channels?: number;
}

export class Resampler {
  private config: ResamplerConfig;

  constructor(config: ResamplerConfig) {
    this.config = { channels: 1, ...config };
  }

  /**
   * 重采样 Float32Array PCM 数据（线性插值）
   */
  resample(input: Float32Array): Float32Array {
    const { sourceSampleRate, targetSampleRate } = this.config;

    if (sourceSampleRate === targetSampleRate) return input;

    const ratio = sourceSampleRate / targetSampleRate;
    const outputLength = Math.ceil(input.length / ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;

      if (index + 1 < input.length) {
        output[i] = (input[index] ?? 0) * (1 - fraction) + (input[index + 1] ?? 0) * fraction;
      } else {
        output[i] = input[index] ?? 0;
      }
    }

    return output;
  }

  /**
   * 通过 OfflineAudioContext 高质量重采样 AudioBuffer
   */
  static async resampleAudioBuffer(
    audioBuffer: AudioBuffer,
    targetSampleRate: number,
  ): Promise<AudioBuffer> {
    if (audioBuffer.sampleRate === targetSampleRate) return audioBuffer;

    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.ceil((audioBuffer.length * targetSampleRate) / audioBuffer.sampleRate),
      targetSampleRate,
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0);

    return await offlineContext.startRendering();
  }

  /**
   * Blob 解码为 AudioBuffer
   */
  static async blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new AudioContext();
    const result = await audioContext.decodeAudioData(arrayBuffer);
    audioContext.close();
    return result;
  }

  /**
   * AudioBuffer 转 Float32Array PCM
   */
  static audioBufferToPCM(audioBuffer: AudioBuffer, channel = 0): Float32Array {
    return audioBuffer.getChannelData(channel);
  }
}
