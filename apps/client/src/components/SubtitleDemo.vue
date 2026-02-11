<template>
  <div class="demo-page">
    <h2>Subtitle 字幕</h2>
    <p class="description">
      基于 @aix/subtitle 的字幕组件，支持 VTT/SRT/JSON/SBV/ASS 格式
    </p>

    <div class="demo-group">
      <h3>基础用法</h3>
      <div class="subtitle-preview">
        <div class="preview-area">
          <Subtitle
            :source="{ type: 'cues', cues: demoCues }"
            :current-time="currentTime"
            :visible="visible"
            :position="position"
            :font-size="fontSize"
            :background="background"
            @change="onCueChange"
          />
        </div>
      </div>
    </div>

    <div class="demo-group">
      <h3>控制面板</h3>
      <div class="control-panel">
        <div class="control-row">
          <label>播放时间: {{ currentTime.toFixed(1) }}s</label>
          <input
            v-model.number="currentTime"
            type="range"
            min="0"
            max="20"
            step="0.1"
            class="range-input"
          />
        </div>

        <div class="control-row">
          <label>字体大小: {{ fontSize }}px</label>
          <input
            v-model.number="fontSize"
            type="range"
            min="14"
            max="40"
            class="range-input"
          />
        </div>

        <div class="control-row">
          <label>显示/隐藏:</label>
          <button class="toggle-btn" @click="visible = !visible">
            {{ visible ? '隐藏字幕' : '显示字幕' }}
          </button>
        </div>

        <div class="control-row">
          <label>位置:</label>
          <div class="btn-group">
            <button
              :class="['option-btn', { active: position === 'top' }]"
              @click="position = 'top'"
            >
              顶部
            </button>
            <button
              :class="['option-btn', { active: position === 'center' }]"
              @click="position = 'center'"
            >
              居中
            </button>
            <button
              :class="['option-btn', { active: position === 'bottom' }]"
              @click="position = 'bottom'"
            >
              底部
            </button>
          </div>
        </div>

        <div class="control-row">
          <label>背景:</label>
          <div class="btn-group">
            <button
              :class="['option-btn', { active: background === 'blur' }]"
              @click="background = 'blur'"
            >
              模糊
            </button>
            <button
              :class="['option-btn', { active: background === 'solid' }]"
              @click="background = 'solid'"
            >
              实色
            </button>
            <button
              :class="['option-btn', { active: background === 'none' }]"
              @click="background = 'none'"
            >
              无
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="demo-group">
      <h3>字幕时间线</h3>
      <div class="timeline">
        <div
          v-for="cue in demoCues"
          :key="cue.id"
          :class="[
            'timeline-item',
            {
              active:
                currentTime >= cue.startTime && currentTime <= cue.endTime,
            },
          ]"
          @click="currentTime = cue.startTime"
        >
          <span class="time">
            {{ cue.startTime.toFixed(1) }}s - {{ cue.endTime.toFixed(1) }}s
          </span>
          <span class="text">{{ cue.text }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Subtitle } from '@aix/subtitle';
import type { SubtitleCue } from '@aix/subtitle';
import { ref } from 'vue';

const currentTime = ref(0);
const visible = ref(true);
const position = ref<'top' | 'bottom' | 'center'>('bottom');
const fontSize = ref(20);
const background = ref<'blur' | 'solid' | 'none'>('blur');

const demoCues: SubtitleCue[] = [
  { id: '1', startTime: 0, endTime: 3, text: '欢迎使用 AIX 字幕组件' },
  {
    id: '2',
    startTime: 3,
    endTime: 6,
    text: '支持 VTT、SRT、JSON、SBV、ASS 格式',
  },
  {
    id: '3',
    startTime: 6,
    endTime: 9,
    text: '可以自定义字幕位置、字体大小和背景样式',
  },
  {
    id: '4',
    startTime: 9,
    endTime: 12,
    text: '通过 currentTime 控制当前显示的字幕',
  },
  {
    id: '5',
    startTime: 12,
    endTime: 15,
    text: '字幕组件还支持长文本自动分段功能',
  },
  {
    id: '6',
    startTime: 15,
    endTime: 18,
    text: '配合视频播放器使用效果更佳',
  },
  { id: '7', startTime: 18, endTime: 20, text: '感谢观看！' },
];

const onCueChange = (cue: SubtitleCue | null) => {
  console.log('当前字幕:', cue?.text);
};
</script>

<style scoped>
.subtitle-preview {
  overflow: hidden;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
}

.preview-area {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: center;
  height: 300px;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}

.control-panel {
  display: flex;
  flex-direction: column;
  padding: 16px;
  border-radius: 8px;
  background: #fafafa;
  gap: 16px;
}

.control-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.control-row label {
  min-width: 140px;
  color: #555;
  font-size: 14px;
}

.range-input {
  flex: 1;
  max-width: 300px;
}

.toggle-btn {
  padding: 6px 16px;
  transition: all 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
}

.toggle-btn:hover {
  border-color: #667eea;
  color: #667eea;
}

.btn-group {
  display: flex;
  gap: 4px;
}

.option-btn {
  padding: 4px 12px;
  transition: all 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
  background: white;
  font-size: 13px;
  cursor: pointer;
}

.option-btn:hover {
  border-color: #667eea;
}

.option-btn.active {
  border-color: #667eea;
  background: #667eea;
  color: white;
}

.timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-item {
  display: flex;
  align-items: center;
  padding: 10px 16px;
  transition: all 0.3s;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  cursor: pointer;
  gap: 16px;
}

.timeline-item:hover {
  border-color: #667eea;
  background: #f5f7ff;
}

.timeline-item.active {
  border-color: #667eea;
  background: #eef0ff;
}

.timeline-item .time {
  min-width: 120px;
  color: #999;
  font-family: monospace;
  font-size: 12px;
}

.timeline-item .text {
  color: #333;
  font-size: 14px;
}
</style>
