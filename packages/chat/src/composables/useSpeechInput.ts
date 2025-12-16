/**
 * @fileoverview useSpeechInput - 语音输入管理
 * 支持 Web Speech API 和自定义语音识别
 */

import { ref, watch, onUnmounted, type Ref } from 'vue';

/**
 * 检测是否在浏览器环境
 */
function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

/**
 * Web Speech API SpeechRecognition 接口定义
 */
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

/** 语音配置 */
export interface SpeechConfig {
  recording?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  customRecognition?: (audio: Blob) => Promise<string>;
}

/** useSpeechInput 配置选项 */
export interface UseSpeechInputOptions {
  /** 语音配置 */
  speech?: SpeechConfig;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否加载中 */
  loading?: boolean;
  /** 输入值引用 */
  inputValue: Ref<string>;
  /** 输入值更新回调 */
  onInputUpdate?: (value: string) => void;
  /** 语音开始回调 */
  onSpeechStart?: () => void;
  /** 语音结束回调 */
  onSpeechEnd?: (text: string) => void;
  /** 语音错误回调 */
  onSpeechError?: (error: Error) => void;
}

/** useSpeechInput 返回值 */
export interface UseSpeechInputReturn {
  /** 是否正在录音 */
  isRecording: Ref<boolean>;
  /** 开始语音输入 */
  startSpeech: () => Promise<void>;
  /** 停止语音输入 */
  stopSpeech: () => void;
  /** 切换语音输入状态 */
  toggleSpeech: () => void;
  /** 清理资源 */
  cleanup: () => void;
}

export function useSpeechInput(
  options: UseSpeechInputOptions,
): UseSpeechInputReturn {
  const {
    speech,
    disabled = false,
    loading = false,
    inputValue,
    onInputUpdate,
    onSpeechStart,
    onSpeechEnd,
    onSpeechError,
  } = options;

  const isRecording = ref(false);
  const mediaRecorder = ref<MediaRecorder | null>(null);
  const audioChunks = ref<Blob[]>([]);
  const recognition = ref<SpeechRecognition | null>(null);
  const mediaStream = ref<MediaStream | null>(null);

  /**
   * 初始化 Web Speech API
   */
  const initSpeechRecognition = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.warn('浏览器不支持 Web Speech API');
      return;
    }

    const recognitionInstance = new SpeechRecognition();
    recognitionInstance.continuous = true;
    recognitionInstance.interimResults = true;
    recognitionInstance.lang = 'zh-CN';

    recognitionInstance.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result && result[0]) {
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalTranscript += transcript;
          }
        }
      }

      if (finalTranscript) {
        inputValue.value += finalTranscript;
        onInputUpdate?.(inputValue.value);
      }
    };

    recognitionInstance.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('语音识别错误:', event.error);
      onSpeechError?.(new Error(event.error));
      stopSpeech();
    };

    recognitionInstance.onend = () => {
      if (isRecording.value) {
        // 如果还在录音状态，重新启动识别
        recognition.value?.start();
      }
    };

    recognition.value = recognitionInstance;
  };

  /**
   * 开始语音输入
   */
  const startSpeech = async () => {
    if (disabled || loading) return;

    // 如果有外部控制的 recording 状态
    if (speech?.recording !== undefined) {
      speech.onRecordingChange?.(true);
      return;
    }

    try {
      // SSR 环境检测
      if (!isBrowser()) {
        console.warn('[useSpeechInput] 语音功能在服务端环境不可用');
        return;
      }

      // 使用自定义语音识别
      if (speech?.customRecognition) {
        isRecording.value = true;
        speech.onRecordingChange?.(true);
        onSpeechStart?.();

        // 检查 navigator.mediaDevices 支持
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('浏览器不支持录音功能');
        }

        // 使用 MediaRecorder 录音
        mediaStream.value = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        mediaRecorder.value = new MediaRecorder(mediaStream.value);
        audioChunks.value = [];

        mediaRecorder.value.ondataavailable = (event) => {
          audioChunks.value.push(event.data);
        };

        mediaRecorder.value.onstop = async () => {
          const audioBlob = new Blob(audioChunks.value, { type: 'audio/webm' });
          try {
            const text = await speech.customRecognition!(audioBlob);
            inputValue.value += text;
            onInputUpdate?.(inputValue.value);
            onSpeechEnd?.(text);
          } catch (error) {
            onSpeechError?.(error as Error);
          }
          // 清理 MediaStream
          if (mediaStream.value) {
            mediaStream.value.getTracks().forEach((track) => track.stop());
            mediaStream.value = null;
          }
        };

        mediaRecorder.value.start();
      } else {
        // 使用 Web Speech API
        if (!recognition.value) {
          initSpeechRecognition();
        }

        if (!recognition.value) {
          throw new Error('浏览器不支持语音识别');
        }

        isRecording.value = true;
        speech?.onRecordingChange?.(true);
        onSpeechStart?.();
        recognition.value.start();
      }
    } catch (error) {
      console.error('启动语音识别失败:', error);
      onSpeechError?.(error as Error);
      isRecording.value = false;
      speech?.onRecordingChange?.(false);
    }
  };

  /**
   * 停止语音输入
   */
  const stopSpeech = () => {
    // 如果有外部控制的 recording 状态
    if (speech?.recording !== undefined) {
      speech.onRecordingChange?.(false);
      onSpeechEnd?.(inputValue.value);
      return;
    }

    isRecording.value = false;
    speech?.onRecordingChange?.(false);

    if (mediaRecorder.value && mediaRecorder.value.state === 'recording') {
      mediaRecorder.value.stop();
    }

    if (recognition.value) {
      recognition.value.stop();
    }

    onSpeechEnd?.(inputValue.value);
  };

  /**
   * 切换语音输入状态
   */
  const toggleSpeech = () => {
    if (isRecording.value) {
      stopSpeech();
    } else {
      startSpeech();
    }
  };

  /**
   * 清理所有资源
   */
  const cleanup = () => {
    // 清理 MediaStream
    if (mediaStream.value) {
      mediaStream.value.getTracks().forEach((track) => track.stop());
      mediaStream.value = null;
    }

    // 清理 MediaRecorder
    if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
      mediaRecorder.value.stop();
      mediaRecorder.value = null;
    }

    // 清理 SpeechRecognition
    if (recognition.value) {
      try {
        recognition.value.stop();
        recognition.value.onresult = null;
        recognition.value.onerror = null;
        recognition.value.onend = null;
        recognition.value = null;
      } catch (error) {
        // 忽略清理时的错误
        console.warn('清理语音识别时出错:', error);
      }
    }

    isRecording.value = false;
  };

  // 监听外部 speech.recording 变化
  watch(
    () => speech?.recording,
    (newValue) => {
      if (newValue !== undefined) {
        isRecording.value = newValue;
      }
    },
    { immediate: true },
  );

  // 组件卸载时自动清理
  onUnmounted(() => {
    cleanup();
  });

  return {
    isRecording,
    startSpeech,
    stopSpeech,
    toggleSpeech,
    cleanup,
  };
}
