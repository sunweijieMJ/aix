<template>
  <div class="demo-page">
    <h2>Video 视频播放器</h2>
    <p class="description">
      基于 @aix/video 的视频播放器组件，支持 HLS/FLV/DASH 流媒体协议
    </p>

    <div class="demo-group">
      <h3>加载视频</h3>
      <div class="demo-row">
        <input
          v-model="videoUrl"
          class="url-input"
          placeholder="输入视频 URL（支持 MP4/HLS/FLV/DASH）..."
        />
        <button class="action-btn" @click="loadVideo">加载</button>
      </div>
      <div class="preset-urls">
        <span class="preset-label">示例:</span>
        <button
          v-for="preset in presets"
          :key="preset.label"
          class="preset-btn"
          @click="
            videoUrl = preset.url;
            loadVideo();
          "
        >
          {{ preset.label }}
        </button>
      </div>
    </div>

    <div class="demo-group">
      <h3>播放器</h3>
      <div v-if="currentSrc" class="video-container">
        <VideoPlayer
          ref="playerRef"
          :src="currentSrc"
          :controls="true"
          :fluid="true"
          :autoplay="false"
          @ready="onReady"
          @play="onPlay"
          @pause="onPause"
          @timeupdate="onTimeUpdate"
          @error="onError"
        />
      </div>
      <div v-else class="empty-state">
        <p>请输入视频地址或选择示例视频</p>
        <p class="tip">支持 MP4、HLS (.m3u8)、FLV、DASH (.mpd) 格式</p>
      </div>
    </div>

    <div v-if="currentSrc" class="demo-group">
      <h3>播放控制</h3>
      <div class="control-panel">
        <div class="demo-row">
          <button class="tool-btn" @click="playerRef?.play()">播放</button>
          <button class="tool-btn" @click="playerRef?.pause()">暂停</button>
          <button class="tool-btn" @click="playerRef?.seek(0)">回到开始</button>
          <button class="tool-btn" @click="playerRef?.toggleMute()">
            静音切换
          </button>
          <button class="tool-btn" @click="playerRef?.toggleFullscreen()">
            全屏
          </button>
        </div>
        <div class="status-bar">
          <span>状态: {{ playState }}</span>
          <span>时间: {{ formatTime(currentTime) }}</span>
        </div>
      </div>
    </div>

    <div class="demo-group">
      <h3>事件日志</h3>
      <div class="event-log">
        <div v-for="(log, index) in eventLogs" :key="index" class="log-item">
          <span class="log-time">{{ log.time }}</span>
          <span class="log-msg">{{ log.message }}</span>
        </div>
        <p v-if="eventLogs.length === 0" class="empty-tip">暂无事件</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { VideoPlayer } from '@aix/video';
import type { VideoPlayerExpose } from '@aix/video';
import { ref } from 'vue';

const playerRef = ref<VideoPlayerExpose>();
const videoUrl = ref('');
const currentSrc = ref('');
const playState = ref('未就绪');
const currentTime = ref(0);

interface EventLog {
  time: string;
  message: string;
}

const eventLogs = ref<EventLog[]>([]);

const presets = [
  {
    label: 'MP4 示例',
    url: 'https://vjs.zencdn.net/v/oceans.mp4',
  },
  {
    label: 'HLS 示例',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
  },
];

const loadVideo = () => {
  if (videoUrl.value) {
    currentSrc.value = videoUrl.value;
    addLog('加载视频: ' + videoUrl.value);
  }
};

const addLog = (message: string) => {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
  eventLogs.value.unshift({ time, message });
  if (eventLogs.value.length > 20) {
    eventLogs.value.pop();
  }
};

const formatTime = (seconds: number) => {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const onReady = () => {
  playState.value = '就绪';
  addLog('播放器就绪');
};

const onPlay = () => {
  playState.value = '播放中';
  addLog('开始播放');
};

const onPause = () => {
  playState.value = '已暂停';
  addLog('暂停播放');
};

const onTimeUpdate = () => {
  const time = playerRef.value?.getCurrentTime();
  if (time !== undefined) {
    currentTime.value = time;
  }
};

const onError = (error: unknown) => {
  playState.value = '错误';
  addLog(`播放错误: ${error}`);
};
</script>

<style scoped>
.url-input {
  flex: 1;
  padding: 8px 12px;
  transition: border-color 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  outline: none;
  font-size: 14px;
}

.url-input:focus {
  border-color: #667eea;
}

.action-btn {
  padding: 8px 20px;
  transition: background 0.3s;
  border: none;
  border-radius: 6px;
  background: #667eea;
  color: white;
  font-size: 14px;
  cursor: pointer;
}

.action-btn:hover {
  background: #5a6fd6;
}

.preset-urls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}

.preset-label {
  color: #999;
  font-size: 13px;
}

.preset-btn {
  padding: 4px 10px;
  transition: all 0.3s;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;
}

.preset-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.video-container {
  overflow: hidden;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
}

.control-panel {
  padding: 12px;
  border-radius: 8px;
  background: #fafafa;
}

.tool-btn {
  padding: 6px 14px;
  transition: all 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
}

.tool-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.status-bar {
  display: flex;
  gap: 24px;
  margin-top: 10px;
  color: #666;
  font-size: 13px;
}

.event-log {
  max-height: 200px;
  padding: 12px;
  overflow-y: auto;
  border-radius: 8px;
  background: #1e1e1e;
}

.log-item {
  display: flex;
  padding: 4px 0;
  font-family: monospace;
  font-size: 13px;
  gap: 12px;
}

.log-time {
  color: #6a9955;
}

.log-msg {
  color: #d4d4d4;
}

.empty-state {
  padding: 60px 20px;
  border-radius: 8px;
  background: #fafafa;
  color: #999;
  text-align: center;
}

.empty-state .tip {
  margin-top: 8px;
  font-size: 13px;
}

.empty-tip {
  padding: 20px;
  color: #666;
  font-size: 13px;
  text-align: center;
}
</style>
