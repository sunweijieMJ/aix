<template>
  <div class="app">
    <header class="header">
      <h1>AIX 组件库示例</h1>
      <div class="mode-badge">
        <span>联调模式: </span>
        <code>{{ linkMode }}</code>
        <button class="theme-toggle" @click="toggleMode">
          {{ mode === 'light' ? '☀️' : '🌙' }} 切换主题
        </button>
        <button class="theme-toggle" @click="toggleLocale">
          {{ locale === 'zh-CN' ? '中' : 'EN' }}
        </button>
      </div>
    </header>

    <main class="main">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="Button 按钮" name="button">
          <ButtonDemo />
        </el-tab-pane>
        <el-tab-pane label="Icons 图标" name="icons">
          <IconsDemo />
        </el-tab-pane>
        <el-tab-pane label="PdfViewer PDF" name="pdf-viewer">
          <PdfViewerDemo />
        </el-tab-pane>
        <el-tab-pane label="Subtitle 字幕" name="subtitle">
          <SubtitleDemo />
        </el-tab-pane>
        <el-tab-pane label="Video 视频" name="video">
          <VideoDemo />
        </el-tab-pane>
      </el-tabs>
    </main>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';
import { ref, watchEffect } from 'vue';
import { useI18n } from 'vue-i18n';
import ButtonDemo from '@/components/ButtonDemo.vue';
import IconsDemo from '@/components/IconsDemo.vue';
import PdfViewerDemo from '@/components/PdfViewerDemo.vue';
import SubtitleDemo from '@/components/SubtitleDemo.vue';
import VideoDemo from '@/components/VideoDemo.vue';
import { loadLocaleMessages, LocaleKey } from '@/plugins/locale';

const { mode, toggleMode } = useTheme();
const { locale } = useI18n();
const linkMode = import.meta.env.VITE_LINK_MODE || 'source';

const activeTab = ref('button');

const toggleLocale = () => {
  locale.value = locale.value === 'zh-CN' ? 'en-US' : 'zh-CN';
};

// 监听语言变化并重新加载语言包
watchEffect(async () => {
  const currentLocale = locale.value as LocaleKey;
  await loadLocaleMessages(currentLocale);
  document.documentElement.setAttribute('lang', currentLocale);
});
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.header {
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: var(--aix-shadow);
  color: var(--aix-colorTextLight);
  text-align: center;
}

.header h1 {
  margin: 0 0 1rem;
  font-size: 2.5rem;
  font-weight: 600;
}

.mode-badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  background: rgb(255 255 255 / 0.2);
  font-size: 0.9rem;
}

.mode-badge code {
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: rgb(0 0 0 / 0.2);
  color: #ffd700;
  font-weight: bold;
}

.theme-toggle {
  margin-left: 1rem;
  padding: 0.4rem 1rem;
  transition: all 0.3s;
  border: 1px solid rgb(255 255 255 / 0.3);
  border-radius: 20px;
  background: rgb(255 255 255 / 0.1);
  color: white;
  font-size: 0.9rem;
  cursor: pointer;
}

.theme-toggle:hover {
  border-color: rgb(255 255 255 / 0.5);
  background: rgb(255 255 255 / 0.2);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.footer {
  margin-top: 2rem;
  padding: 1.5rem;
  background: var(--aix-colorBgSpotlight);
  color: var(--aix-colorTextLight);
  text-align: center;
}

.footer p {
  margin: 0;
}

:global(body) {
  margin: 0;
  background: var(--aix-colorBgLayout);
  color: var(--aix-colorText);
  font-family: var(--aix-fontFamily);
}

:global(*) {
  box-sizing: border-box;
}

/* 各 demo 页面共享样式 */
:global(.demo-page) {
  padding: 0;
}

:global(.demo-page h2) {
  margin-top: 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--aix-colorPrimary);
  color: var(--aix-colorText);
  font-size: 1.8rem;
}

:global(.demo-page .description) {
  margin-bottom: 1.5rem;
  color: var(--aix-colorTextSecondary);
}

:global(.demo-page .demo-group) {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border-radius: var(--aix-borderRadiusLG);
  background: var(--aix-colorBgContainer);
  box-shadow: var(--aix-shadow);
}

:global(.demo-page .demo-group:last-child) {
  margin-bottom: 0;
}

:global(.demo-page .demo-group h3) {
  margin-top: 0;
  margin-bottom: 1rem;
  color: var(--aix-colorTextSecondary);
  font-size: 1.1rem;
}

:global(.demo-page .demo-row) {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: center;
}
</style>
