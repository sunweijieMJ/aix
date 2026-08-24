# @aix/audio

## 0.0.3

### Patch Changes

- 统一升级，优化打包产物
- Updated dependencies
  - @aix/hooks@0.0.5
  - @aix/theme@0.0.4

## 0.0.2

### Patch Changes

- 优化修复
- dd36485: 修复录音会话、适配器生命周期与流式播放的一组缺陷

  **严重问题**

  - `useSpeech`：`stopRecording()` 未结束时重新开始录音，迟到的收尾会释放新一轮的麦克风与 AudioContext，
    导致「UI 显示录音中、实际已断麦」的假死。改为按会话代次隔离，被取代那轮的结果直接丢弃并撤销其 ObjectURL
  - `ProxyASR` / `AliyunASR`：重连定时器句柄未持有，`destroy()` 后仍会爬起来重建 WebSocket；
    首次连接就失败时也会自行重连，与降级后的适配器抢资源。现在 stop/disconnect/destroy 一律取消重连
  - `AliyunTTS`：暂停期间到达的音频包会把已挂起的 AudioContext 唤醒，出现「按了暂停声音继续播」
  - `AliyunTTS`：服务端只回结束信号而未推任何音频时 `speak()` 永久挂起，新增 20 秒合成超时兜底
  - `VAD`：靠「说话→静音」边沿判定，用户开麦后从未出声时 `maxSilenceDuration` 完全不生效。
    现在静音计时自开始录音起算

  **其他修复**

  - `AudioSourceHub`：浏览器不接受 `sampleRate` 约束时自动重采样到目标采样率，
    不再向服务端申报 48000（阿里云 NLS 只接受 8000/16000）
  - `AudioSourceHub`：新增 `prerollMs` 预滚动缓冲，消除流式 ASR 建连期间的首句丢字
  - `useSpeech`：`recorder` 配置整体透传给 `Recorder`（此前仅 `maxDuration` 生效，`mimeType` 被静默丢弃）
  - `useSpeech`：ASR 连接失败不再连累录音，错误仅经 `asrError` 暴露
  - `useSpeech`：`setProvider()` 改为返回 `Promise<void>`，切换失败不再产生 unhandledrejection
  - `ProxyASR`：token 代理未返回 `wsUrl` 时明确报错，不再连到 `undefined`
  - `ProxyTTS`：`resume()` 处理 `play()` 的 rejection
  - `AudioPlayer`：切换 `src` 时复位时长并断开旧音频源
  - 导出 `RecorderState` / `RecorderEvents` 类型

## 0.0.1

### Patch Changes

- audio正式包

## 0.1.1-beta.0

### Patch Changes

- audio发包
