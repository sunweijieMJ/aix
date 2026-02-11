<template>
  <div class="demo-page">
    <h2>Icons 图标</h2>
    <p class="description">
      基于 @aix/icons 的 SVG 图标组件演示，共 580+ 个图标
    </p>

    <div class="demo-group">
      <h3>搜索图标</h3>
      <div class="demo-row">
        <input
          v-model="keyword"
          class="search-input"
          placeholder="输入关键词搜索图标..."
        />
      </div>
    </div>

    <div class="demo-group">
      <h3>常用图标</h3>
      <div class="icon-grid">
        <div
          v-for="item in filteredIcons"
          :key="item.name"
          class="icon-item"
          :title="item.name"
        >
          <component :is="item.component" class="icon-svg" />
          <span class="icon-name">{{ item.name }}</span>
        </div>
      </div>
      <p v-if="filteredIcons.length === 0" class="empty-tip">没有匹配的图标</p>
    </div>

    <div class="demo-group">
      <h3>图标尺寸</h3>
      <div class="demo-row" style="align-items: flex-end">
        <div class="icon-size-item">
          <Home style="width: 16px; height: 16px" />
          <span>16px</span>
        </div>
        <div class="icon-size-item">
          <Home style="width: 24px; height: 24px" />
          <span>24px</span>
        </div>
        <div class="icon-size-item">
          <Home style="width: 32px; height: 32px" />
          <span>32px</span>
        </div>
        <div class="icon-size-item">
          <Home style="width: 48px; height: 48px" />
          <span>48px</span>
        </div>
      </div>
    </div>

    <div class="demo-group">
      <h3>图标颜色</h3>
      <div class="demo-row">
        <Setting style="width: 32px; height: 32px; color: #1890ff" />
        <Setting style="width: 32px; height: 32px; color: #52c41a" />
        <Setting style="width: 32px; height: 32px; color: #faad14" />
        <Setting style="width: 32px; height: 32px; color: #ff4d4f" />
        <Setting style="width: 32px; height: 32px; color: #722ed1" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Home,
  Setting,
  AccountCircle,
  Add,
  AddCircle,
  ArrowBack,
  ArrowForward,
  Close,
  Check,
  Delete,
  Edit,
  IconSearch,
  Refresh,
  Download,
  FileUpload,
  StarFull,
  Favorite,
  Visibility,
  VisibilityOff,
  Lock,
  InfoOutline,
  LiveHelp,
  Warning,
  Error,
} from '@aix/icons';
import { ref, computed, markRaw, type Component } from 'vue';

interface IconEntry {
  name: string;
  component: Component;
}

const keyword = ref('');

const allIcons: IconEntry[] = [
  { name: 'Home', component: markRaw(Home) },
  { name: 'Setting', component: markRaw(Setting) },
  { name: 'AccountCircle', component: markRaw(AccountCircle) },
  { name: 'Add', component: markRaw(Add) },
  { name: 'AddCircle', component: markRaw(AddCircle) },
  { name: 'ArrowBack', component: markRaw(ArrowBack) },
  { name: 'ArrowForward', component: markRaw(ArrowForward) },
  { name: 'Close', component: markRaw(Close) },
  { name: 'Check', component: markRaw(Check) },
  { name: 'Delete', component: markRaw(Delete) },
  { name: 'Edit', component: markRaw(Edit) },
  { name: 'IconSearch', component: markRaw(IconSearch) },
  { name: 'Refresh', component: markRaw(Refresh) },
  { name: 'Download', component: markRaw(Download) },
  { name: 'FileUpload', component: markRaw(FileUpload) },
  { name: 'StarFull', component: markRaw(StarFull) },
  { name: 'Favorite', component: markRaw(Favorite) },
  { name: 'Visibility', component: markRaw(Visibility) },
  { name: 'VisibilityOff', component: markRaw(VisibilityOff) },
  { name: 'Lock', component: markRaw(Lock) },
  { name: 'InfoOutline', component: markRaw(InfoOutline) },
  { name: 'LiveHelp', component: markRaw(LiveHelp) },
  { name: 'Warning', component: markRaw(Warning) },
  { name: 'Error', component: markRaw(Error) },
];

const filteredIcons = computed(() => {
  if (!keyword.value) return allIcons;
  const k = keyword.value.toLowerCase();
  return allIcons.filter((icon) => icon.name.toLowerCase().includes(k));
});
</script>

<style scoped>
.search-input {
  width: 100%;
  max-width: 400px;
  padding: 8px 12px;
  transition: border-color 0.3s;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  outline: none;
  font-size: 14px;
}

.search-input:focus {
  border-color: #667eea;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 12px;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 8px;
  transition: all 0.3s;
  border: 1px solid #f0f0f0;
  border-radius: 8px;
  cursor: pointer;
  gap: 8px;
}

.icon-item:hover {
  border-color: #667eea;
  background: #f5f7ff;
}

.icon-svg {
  width: 28px;
  height: 28px;
  color: #333;
}

.icon-name {
  max-width: 100%;
  overflow: hidden;
  color: #666;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.icon-size-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #333;
}

.icon-size-item span {
  color: #999;
  font-size: 12px;
}

.empty-tip {
  padding: 32px;
  color: #999;
  text-align: center;
}
</style>
