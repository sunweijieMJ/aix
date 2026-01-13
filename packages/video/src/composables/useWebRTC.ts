import {
  ref,
  watch,
  onBeforeUnmount,
  type Ref,
  type WatchStopHandle,
} from 'vue';

/**
 * useWebRTC 返回类型
 */
export interface UseWebRTCReturn {
  isLoading: Ref<boolean>;
  isReady: Ref<boolean>;
  connectionState: Ref<RTCPeerConnectionState>;
  init: () => Promise<void>;
  destroy: () => void;
  isSupported: () => boolean;
  getConnectionState: () => RTCPeerConnectionState;
  getStats: () => Promise<RTCStatsReport | null>;
}

/**
 * WebRTC 配置选项
 */
export interface WebRTCOptions {
  /** 信令服务器地址 */
  signalServerUrl?: string;
  /** ICE 服务器配置 */
  iceServers?: RTCIceServer[];
  /** 是否启用音频 */
  enableAudio?: boolean;
  /** 是否启用视频 */
  enableVideo?: boolean;
  /** 是否启用调试日志 */
  enableDebugLog?: boolean;
  /** 回调 */
  onReady?: () => void;
  onError?: (error: Error) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

const DEFAULT_OPTIONS: Required<
  Omit<
    WebRTCOptions,
    | 'signalServerUrl'
    | 'iceServers'
    | 'onReady'
    | 'onError'
    | 'onConnectionStateChange'
  >
> = {
  enableAudio: true,
  enableVideo: true,
  enableDebugLog: false,
};

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * WebRTC 流媒体支持
 *
 * 用于播放 WebRTC 流，支持:
 * 1. 信令服务器连接
 * 2. P2P 视频流接收
 * 3. ICE 候选协商
 */
export function useWebRTC(
  videoRef: Ref<HTMLVideoElement | null>,
  uri: Ref<string>,
  options: Ref<WebRTCOptions>,
): UseWebRTCReturn {
  const isLoading = ref(false);
  const isReady = ref(false);
  const connectionState = ref<RTCPeerConnectionState>('new');

  // WebRTC 连接
  let peerConnection: RTCPeerConnection | null = null;
  // 信令 WebSocket
  let signalSocket: WebSocket | null = null;
  // 销毁标记
  let isDestroying = false;
  // watch 清理函数
  let stopWatch: WatchStopHandle | null = null;

  function getOption<K extends keyof typeof DEFAULT_OPTIONS>(
    key: K,
  ): (typeof DEFAULT_OPTIONS)[K] {
    const value = options.value[key];
    return value !== undefined
      ? (value as (typeof DEFAULT_OPTIONS)[K])
      : DEFAULT_OPTIONS[key];
  }

  function logDebug(message: string, ...args: unknown[]): void {
    if (getOption('enableDebugLog')) {
      console.log(`[WebRTC] ${message}`, ...args);
    }
  }

  /**
   * 获取 ICE 服务器配置
   */
  function getIceServers(): RTCIceServer[] {
    return options.value.iceServers || DEFAULT_ICE_SERVERS;
  }

  /**
   * 创建 PeerConnection
   */
  function createPeerConnection(): RTCPeerConnection {
    const config: RTCConfiguration = {
      iceServers: getIceServers(),
    };

    const pc = new RTCPeerConnection(config);

    // 监听 ICE 候选
    pc.onicecandidate = (event) => {
      if (event.candidate && signalSocket?.readyState === WebSocket.OPEN) {
        logDebug('发送 ICE 候选', event.candidate);
        signalSocket.send(
          JSON.stringify({
            type: 'candidate',
            candidate: event.candidate,
          }),
        );
      }
    };

    // 监听连接状态变化
    pc.onconnectionstatechange = () => {
      connectionState.value = pc.connectionState;
      logDebug('连接状态变化', pc.connectionState);
      options.value.onConnectionStateChange?.(pc.connectionState);

      if (pc.connectionState === 'connected') {
        isReady.value = true;
        isLoading.value = false;
        options.value.onReady?.();
      } else if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'disconnected'
      ) {
        options.value.onError?.(
          new Error(
            `WebRTC 连接${pc.connectionState === 'failed' ? '失败' : '断开'}`,
          ),
        );
      }
    };

    // 监听远程流
    pc.ontrack = (event) => {
      const video = videoRef.value;
      if (video && event.streams[0]) {
        logDebug('收到远程流', event.streams[0]);
        video.srcObject = event.streams[0];
      }
    };

    return pc;
  }

  /**
   * 处理信令消息
   */
  async function handleSignalMessage(message: {
    type: string;
    sdp?: string;
    candidate?: RTCIceCandidateInit;
  }): Promise<void> {
    if (!peerConnection) return;

    try {
      switch (message.type) {
        case 'offer':
          if (message.sdp) {
            logDebug('收到 Offer');
            await peerConnection.setRemoteDescription({
              type: 'offer',
              sdp: message.sdp,
            });

            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);

            signalSocket?.send(
              JSON.stringify({
                type: 'answer',
                sdp: answer.sdp,
              }),
            );
          }
          break;

        case 'answer':
          if (message.sdp) {
            logDebug('收到 Answer');
            await peerConnection.setRemoteDescription({
              type: 'answer',
              sdp: message.sdp,
            });
          }
          break;

        case 'candidate':
          if (message.candidate) {
            logDebug('收到 ICE 候选');
            await peerConnection.addIceCandidate(message.candidate);
          }
          break;
      }
    } catch (error) {
      options.value.onError?.(
        error instanceof Error ? error : new Error('处理信令消息失败'),
      );
    }
  }

  /**
   * 连接信令服务器
   */
  function connectSignalServer(signalUrl: string, streamId: string): void {
    const wsUrl = `${signalUrl}?stream=${encodeURIComponent(streamId)}`;
    logDebug('连接信令服务器', wsUrl);

    signalSocket = new WebSocket(wsUrl);

    signalSocket.onopen = () => {
      logDebug('信令服务器已连接');

      try {
        // 发送加入请求
        signalSocket?.send(
          JSON.stringify({
            type: 'join',
            streamId,
          }),
        );
      } catch (error) {
        options.value.onError?.(
          error instanceof Error ? error : new Error('发送加入请求失败'),
        );
      }
    };

    signalSocket.onmessage = async (event) => {
      // 检查销毁标记，防止在销毁过程中继续处理
      if (isDestroying) return;

      try {
        const message = JSON.parse(event.data);
        await handleSignalMessage(message);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : '未知错误';
        logDebug('处理信令消息失败', errorMsg);
        options.value.onError?.(new Error(`信令消息处理失败: ${errorMsg}`));
      }
    };

    signalSocket.onerror = () => {
      options.value.onError?.(new Error('信令服务器连接错误'));
    };

    signalSocket.onclose = () => {
      logDebug('信令服务器连接关闭');
    };
  }

  /**
   * 初始化 WebRTC 播放
   */
  async function init(): Promise<void> {
    const video = videoRef.value;
    const src = uri.value;

    if (!video || !src) return;

    // 验证信令服务器配置
    const signalServerUrl = options.value.signalServerUrl;
    if (!signalServerUrl) {
      options.value.onError?.(new Error('WebRTC 信令服务器地址未配置'));
      return;
    }

    destroy();
    isLoading.value = true;

    // 检查 WebRTC 支持
    if (!isSupported()) {
      options.value.onError?.(new Error('浏览器不支持 WebRTC'));
      isLoading.value = false;
      return;
    }

    try {
      // 创建 PeerConnection
      peerConnection = createPeerConnection();

      // 提取 stream ID (从 URI 中解析)
      // 假设格式: webrtc://server/app/stream 或 直接使用 URI 作为 stream ID
      const streamId = src.replace(/^webrtc:\/\//, '');

      // 连接信令服务器
      connectSignalServer(signalServerUrl, streamId);
    } catch (error) {
      isLoading.value = false;
      options.value.onError?.(
        error instanceof Error ? error : new Error('初始化 WebRTC 失败'),
      );
    }
  }

  /**
   * 销毁 WebRTC 连接
   */
  function destroy(): void {
    isDestroying = true;

    // 停止 watch
    if (stopWatch) {
      stopWatch();
      stopWatch = null;
    }

    // 关闭信令 WebSocket
    if (signalSocket) {
      signalSocket.close();
      signalSocket = null;
    }

    // 关闭 PeerConnection
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    // 清理 video srcObject
    const video = videoRef.value;
    if (video && video.srcObject) {
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    }

    connectionState.value = 'new';
    isReady.value = false;
    isDestroying = false;
  }

  /**
   * 检查是否支持 WebRTC
   */
  function isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'RTCPeerConnection' in window &&
      'WebSocket' in window
    );
  }

  /**
   * 获取连接状态
   */
  function getConnectionState(): RTCPeerConnectionState {
    return connectionState.value;
  }

  /**
   * 获取统计信息
   */
  async function getStats(): Promise<RTCStatsReport | null> {
    if (!peerConnection) return null;
    return peerConnection.getStats();
  }

  // 监听变化 (保存 stop 函数以便销毁时清理)
  stopWatch = watch([videoRef, uri], ([video, src]) => {
    if (video && src && !isDestroying) {
      init();
    }
  });

  onBeforeUnmount(destroy);

  return {
    isLoading,
    isReady,
    connectionState,
    init,
    destroy,
    isSupported,
    getConnectionState,
    getStats,
  };
}
