# 主题系统集成指南

## 概述

AIX 组件库已完整集成主题系统，支持亮色/暗色主题无缝切换。本文档介绍如何在应用中使用主题系统。

## 核心特性

- **亮色/暗色主题切换** - 一键切换，平滑过渡
- **CSS 变量架构** - 无需重新渲染组件
- **智能暗色算法** - 根据主题色动态调整
- **主题验证机制** - 运行时类型安全
- **过渡动画配置** - 可自定义过渡效果
- **持久化存储** - 自动保存用户偏好
- **SSR/SSG 友好** - 支持 Nuxt/Next.js/Astro

## 快速开始

### 1. 安装主题包

```bash
pnpm add @aix/theme
```

### 2. 在应用中引入主题

```typescript
// main.ts
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';
import '@aix/theme/vars';
import App from './App.vue';

const app = createApp(App);

// 创建并安装主题 Context
const { install } = createTheme({
  initialMode: 'light',  // 初始模式
  persist: true,         // 持久化到 localStorage
  watchSystem: true,     // 跟随系统主题
});

app.use({ install });
app.mount('#app');
```

### 3. 在组件中使用

```vue
<template>
  <div>
    <button @click="toggleMode">
      切换主题：{{ mode }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, toggleMode } = useTheme();
</script>
```

## API 文档

### createTheme - 创建主题 Context

```typescript
import { createTheme } from '@aix/theme';

const { themeContext, install, dispose } = createTheme({
  initialMode: 'light',      // 初始模式：'light' | 'dark'
  initialConfig: {           // 初始主题配置
    token: { colorPrimary: 'rgb(0 180 180)' },
    algorithm: 'default',
  },
  persist: true,             // 持久化到 localStorage
  storageKey: 'aix-theme-mode', // localStorage key
  watchSystem: true,         // 跟随系统主题
});

// 安装到 Vue 应用
app.use({ install });

// 应用卸载时清理
dispose();
```

### useTheme - 组件中使用主题

```vue
<template>
  <div>
    <p>当前主题：{{ mode }}</p>
    <button @click="toggleMode">切换主题</button>
    <button @click="applyPreset('tech')">应用科技蓝</button>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useTheme } from '@aix/theme';

const {
  mode,              // 响应式：当前主题模式
  config,            // 响应式：当前主题配置
  setMode,           // 设置主题模式
  toggleMode,        // 切换主题模式
  applyTheme,        // 应用主题配置
  setToken,          // 设置单个 Token
  setTokens,         // 批量设置 Token
  applyPreset,       // 应用预设主题
  registerPreset,    // 注册自定义预设
  getPresets,        // 获取所有预设
  reset,             // 重置为默认主题
  setTransition,     // 设置过渡配置
  getTransition,     // 获取过渡配置
} = useTheme();

// 监听主题变化
watch(mode, (newMode) => {
  console.log('主题已变更:', newMode);
});
</script>
```

### 主题预设

```typescript
import { useTheme } from '@aix/theme';

const { applyPreset, registerPreset, getPresets } = useTheme();

// 应用内置预设
applyPreset('tech');     // 科技蓝
applyPreset('nature');   // 自然绿
applyPreset('sunset');   // 日落橙
applyPreset('purple');   // 优雅紫

// 获取所有预设
const presets = getPresets();

// 注册自定义预设
registerPreset({
  name: 'custom',
  displayName: '自定义主题',
  token: {
    colorPrimary: 'rgb(255 0 0)'
  }
});
```

### Token 设置

```typescript
import { useTheme } from '@aix/theme';

const { setToken, setTokens } = useTheme();

// 设置单个 Token
setToken('colorPrimary', 'rgb(0 102 255)');

// 批量设置 Token（推荐，性能更好）
setTokens({
  colorPrimary: 'rgb(0 102 255)',
  colorSuccess: 'rgb(82 196 26)',
  fontSize: '16px',
  borderRadius: '8px'
});
```

### 过渡动画配置

```typescript
import { useTheme } from '@aix/theme';

const { setTransition, getTransition } = useTheme();

// 设置过渡配置
setTransition({
  duration: 300,                              // 过渡时长（毫秒）
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',   // 缓动函数
  enabled: true                               // 是否启用
});

// 获取当前配置
const config = getTransition();
```

### 主题验证

```typescript
import {
  validateThemeConfig,
  validateThemeConfigOrThrow,
  sanitizeThemeConfig
} from '@aix/theme';

// 验证主题配置
const result = validateThemeConfig({
  token: {
    colorPrimary: 'rgb(300 0 0)' // 错误：RGB 值超出范围
  }
});

if (!result.valid) {
  console.error('验证失败:', result.errors);
}

// 验证并抛出异常
try {
  validateThemeConfigOrThrow(config);
} catch (error) {
  console.error(error.message);
}

// 自动清理无效 Token
const safeConfig = sanitizeThemeConfig(config);
```

## 在组件中使用主题

### 使用 CSS 变量

所有组件都应使用主题变量，而不是硬编码颜色值：

```scss
// 推荐：使用主题变量
.button {
  color: var(--colorPrimary);
  background: var(--colorBgContainer);
  border: 1px solid var(--colorBorder);
  padding: var(--paddingXS) var(--padding);
  border-radius: var(--borderRadiusSM);
  font-size: var(--fontSize);
}

// 避免：硬编码值
.button {
  color: #1890ff;
  background: #ffffff;
  border: 1px solid #d9d9d9;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
}
```

### 常用主题变量

#### 颜色变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `--colorPrimary` | 主色 | 按钮、链接 |
| `--colorSuccess` | 成功色 | 成功状态 |
| `--colorWarning` | 警告色 | 警告提示 |
| `--colorError` | 错误色 | 错误提示 |
| `--colorText` | 主文本色 | 正文 |
| `--colorTextSecondary` | 次文本色 | 辅助文字 |
| `--colorBgBase` | 基础背景色 | 页面背景 |
| `--colorBgContainer` | 容器背景色 | 卡片背景 |
| `--colorBorder` | 边框色 | 分割线、边框 |

#### 尺寸变量

| 变量 | 说明 | 值 |
|------|------|-----|
| `--padding` | 标准内边距 | 16px |
| `--paddingXS` | 小内边距 | 8px |
| `--paddingLG` | 大内边距 | 24px |
| `--fontSize` | 标准字号 | 14px |
| `--fontSizeLG` | 大字号 | 16px |
| `--borderRadius` | 标准圆角 | 6px |
| `--controlHeight` | 控件高度 | 32px |

完整的 Token 列表请参考：[主题定制指南](./theme.md)

## 高级用法

### SSR/SSG 支持

#### Nuxt 3

```typescript
// plugins/theme.client.ts
import { createTheme } from '@aix/theme';

export default defineNuxtPlugin((nuxtApp) => {
  const { install } = createTheme({
    initialMode: 'light',
    persist: true,
    watchSystem: true,
  });

  nuxtApp.vueApp.use({ install });
});
```

```vue
<!-- app.vue -->
<template>
  <Html :data-theme="mode">
    <NuxtPage />
  </Html>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode } = useTheme();
</script>
```

#### Next.js App Router

```tsx
// app/layout.tsx
import { generateSSRInitScript } from '@aix/theme';

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: generateSSRInitScript('aix-theme-mode', 'light')
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 自定义主题算法

```typescript
import { defineTheme } from '@aix/theme';
import { useTheme } from '@aix/theme';

// 定义自定义主题
const customTheme = defineTheme({
  token: {
    colorPrimary: 'rgb(114 46 209)', // 紫色
    borderRadius: '8px',
    fontSize: '15px'
  },
  algorithm: 'dark', // 使用暗色算法
  transition: {
    duration: 300,
    easing: 'ease-out'
  }
});

// 在组件中应用
const { applyTheme } = useTheme();
applyTheme(customTheme);
```

### 动态主题生成

```typescript
import { generateColorSeries } from '@aix/theme';
import { useTheme } from '@aix/theme';

const { setTokens } = useTheme();

// 从用户选择的颜色生成完整色系
const userColor = 'rgb(255 0 0)';
const colorSeries = generateColorSeries(userColor);

setTokens({
  colorPrimary: colorSeries.base,
  colorPrimaryHover: colorSeries.hover,
  colorPrimaryActive: colorSeries.active,
  colorPrimaryBg: colorSeries.bg,
  colorPrimaryBorder: colorSeries.border,
  colorPrimaryText: colorSeries.text,
});
```

## Storybook 集成

Storybook 已完整集成主题系统，提供实时主题切换功能。

### 使用方法

1. 启动 Storybook：
```bash
pnpm storybook:dev
```

2. 在工具栏中点击 **主题按钮**（太阳/月亮图标）

3. 选择亮色或暗色主题，所有组件会实时切换

### 查看示例

访问 Storybook 中的 **Button > ThemeDemo** 页面，查看完整的主题切换演示。

## 最佳实践

### 1. 统一使用主题变量

```scss
// 好的做法
.card {
  background: var(--colorBgContainer);
  border: 1px solid var(--colorBorder);
  color: var(--colorText);
}

// 不好的做法
.card {
  background: #fff;
  border: 1px solid #d9d9d9;
  color: rgba(0, 0, 0, 0.88);
}
```

### 2. 提供主题切换入口

```vue
<template>
  <button
    @click="toggleMode"
    :aria-label="`切换到${mode === 'light' ? '暗色' : '亮色'}模式`"
  >
    <IconSun v-if="mode === 'dark'" />
    <IconMoon v-else />
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, toggleMode } = useTheme();
</script>
```

### 3. 考虑无障碍

- 使用足够的颜色对比度
- 提供明确的视觉反馈
- 支持键盘操作
- 添加适当的 ARIA 标签

### 4. 性能优化

```typescript
import { useTheme } from '@aix/theme';

const { setToken, setTokens } = useTheme();

// 好的做法：批量设置（只触发一次 DOM 更新）
setTokens({
  colorPrimary: 'rgb(0 102 255)',
  colorSuccess: 'rgb(82 196 26)',
  fontSize: '16px'
});

// 不好的做法：逐个设置（会触发多次 DOM 更新）
setToken('colorPrimary', 'rgb(0 102 255)');
setToken('colorSuccess', 'rgb(82 196 26)');
setToken('fontSize', '16px');
```

## 常见问题

### Q: 为什么主题切换后某些组件没有变化？

A: 确保组件使用了主题变量而不是硬编码值。检查 CSS 中是否使用了 `var(--colorPrimary)` 等变量。

### Q: 如何在 SSR 应用中避免主题闪烁？

A: 使用 `generateSSRInitScript()` 在 HTML 头部注入初始化脚本，在页面加载前设置正确的主题。

### Q: 能否同时应用多个预设主题？

A: 不能。每次只能应用一个预设，但可以在预设的基础上通过 `setTokens()` 覆盖特定变量。

### Q: 如何验证自定义的主题配置？

A: 使用 `validateThemeConfig()` 进行验证，或使用 `sanitizeThemeConfig()` 自动过滤无效配置。

### Q: 主题配置会保存在哪里？

A: 主题模式会自动保存到 `localStorage`（key: `aix-theme-mode`），刷新页面后会自动恢复。

## 相关文档

- [主题定制指南](./theme.md)
- [组件开发指南](../components/development.md)
