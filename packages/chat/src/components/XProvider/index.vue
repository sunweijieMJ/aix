<template>
  <div class="aix-x-provider" :data-theme="currentTheme">
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview XProvider 全局配置组件
 * 提供全局 AI 配置、主题、语言等上下文
 */

import { provide, computed, watchEffect } from 'vue';
import { X_PROVIDER_KEY } from './types';

/** XProvider 配置 */
interface XProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  theme?: 'light' | 'dark' | 'auto';
  locale?: 'zh-CN' | 'en-US';
  defaultParams?: Record<string, any>;
}

/** XProvider 组件 Props */
interface XProviderProps {
  config?: XProviderConfig;
}

const props = withDefaults(defineProps<XProviderProps>(), {
  config: () => ({}),
});

/*  合并默认配置 */
const mergedConfig = computed(() => ({
  apiKey: props.config?.apiKey || '',
  baseURL: props.config?.baseURL || 'https://api.openai.com/v1',
  model: props.config?.model || 'gpt-3.5-turbo',
  theme: props.config?.theme || 'light',
  locale: props.config?.locale || 'zh-CN',
  defaultParams: props.config?.defaultParams || {},
}));

/*  计算当前主题 */
const currentTheme = computed(() => {
  if (mergedConfig.value.theme === 'auto') {
    // 自动检测系统主题
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
    return 'light';
  }
  return mergedConfig.value.theme;
});

/*  提供配置给子组件 */
provide(X_PROVIDER_KEY, mergedConfig);

/*  监听主题变化，更新 CSS 变量 */
watchEffect(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', currentTheme.value);
  }
});
</script>

<style scoped lang="scss">
.aix-x-provider {
  width: 100%;
  height: 100%;
}
</style>
