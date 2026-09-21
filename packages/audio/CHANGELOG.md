# @aix/audio

## 0.0.4

### Patch Changes

- 266d161: 统一语言包导出命名，并修掉几处 SSR 与样式加载缺陷。
  
  - **语言包导出改名**：破坏性改动，但多语言尚无业务方使用，故按 patch 发布。三个包的语言包导出对齐 `menu` / `button` / `flow-graph` 的命名，
    统一为「包名前缀 + Locale / ZhCN / EnUS」
    - `@aix/rich-text-editor`：原先经 `export *` 导出的裸 `locale` / `zhCN` / `enUS`
      改为 `richTextEditorLocale` / `richTextEditorZhCN` / `richTextEditorEnUS`
    - `@aix/pdf-viewer`：裸 `locale` 改为 `pdfViewerLocale`，并新增导出 `pdfViewerZhCN` / `pdfViewerEnUS`
    - `@aix/ai-chat`：裸 `zhCN` / `enUS` 改为 `aiChatZhCN` / `aiChatEnUS`（`aiChatLocale` 不变）
    - `createLocale` 的切片名（`'rich-text-editor'` / `'pdf-viewer'` / `'ai-chat'`）不变
  - **`@aix/pdf-viewer` 的 `contextMenu` 事件补第二个参数**（签名变化，原来的单参数写法仍可用）：
    点击菜单项时一并给出被点击的 `ContextMenuItem`，业务侧据此实现复制、下载等动作
  - **`@aix/pdf-viewer` 新增 `config.workerSrc`**：pdf.js worker 默认取 jsDelivr CDN，内网部署可指向自托管副本
  - **`@aix/ai-chat` 修复 KaTeX 与 highlight.js 主题样式加载失败**：打包器对动态导入的纯 CSS 只产出指向空
    chunk 的引用，运行时 404、样式静默丢失；改为经 JS 壳模块加载，构建产物里样式随 chunk 正常注入
  - **SSR 安全**：`@aix/audio` 的 `BrowserTTS` / `BrowserASR` 不再在构造函数里读 `window`，
    `WaveformCanvas` 的设备像素比改为挂载后读取——服务端渲染不再因此整页失败

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
