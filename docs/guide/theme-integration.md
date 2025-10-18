# 主题系统集成指南

## 🎯 概述

AIX 组件库已完整集成主题系统，支持亮色/暗色主题无缝切换。本文档介绍如何在应用中使用主题系统。

## ✨ 核心特性

- ✅ **亮色/暗色主题切换** - 一键切换，平滑过渡
- ✅ **CSS 变量架构** - 无需重新渲染组件
- ✅ **智能暗色算法** - 根据主题色动态调整
- ✅ **主题验证机制** - 运行时类型安全
- ✅ **过渡动画配置** - 可自定义过渡效果
- ✅ **持久化存储** - 自动保存用户偏好
- ✅ **SSR/SSG 友好** - 支持 Nuxt/Next.js/Astro

## 🚀 快速开始

### 1. 安装主题包

```bash
pnpm add @aix/theme
```

### 2. 在应用中引入主题

```typescript
// main.ts
import { createApp } from 'vue';
import App from './App.vue';

// 引入主题样式（必须）
import '@aix/theme/vars';

const app = createApp(App);
app.mount('#app');
```

### 3. 使用主题控制器

```vue
<template>
  <div>
    <button @click="toggleTheme">
      切换主题：{{ mode }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { themeController } from '@aix/theme';

const mode = ref(themeController.getMode());

const toggleTheme = () => {
  const newMode = themeController.toggleMode();
  mode.value = newMode;
};
</script>
```

## API 文档

### ThemeController

主题控制器是一个单例对象，提供运行时主题管理能力。

#### 基础方法

```typescript
import { themeController } from '@aix/theme';

// 获取当前主题模式
const mode = themeController.getMode(); // 'light' | 'dark'

// 设置主题模式
themeController.setMode('dark');

// 切换主题模式
themeController.toggleMode();

// 应用主题配置
themeController.applyTheme({
  token: {
    colorPrimary: 'rgb(0 102 255)',
    fontSize: '16px'
  },
  algorithm: 'dark'
});
```

#### 主题预设

```typescript
// 应用内置预设
themeController.applyPreset('tech');     // 科技蓝
themeController.applyPreset('nature');   // 自然绿
themeController.applyPreset('sunset');   // 日落橙
themeController.applyPreset('purple');   // 优雅紫

// 获取所有预设
const presets = themeController.getPresets();

// 注册自定义预设
themeController.registerPreset({
  name: 'custom',
  displayName: '自定义主题',
  token: {
    colorPrimary: 'rgb(255 0 0)'
  }
});
```

#### Token 设置

```typescript
// 设置单个 Token
themeController.setToken('colorPrimary', 'rgb(0 102 255)');

// 批量设置 Token
themeController.setTokens({
  colorPrimary: 'rgb(0 102 255)',
  colorSuccess: 'rgb(82 196 26)',
  fontSize: '16px',
  borderRadius: '8px'
});
```

#### 过渡动画配置

```typescript
import { setTransition, getTransition } from '@aix/theme';

// 设置过渡配置
setTransition({
  duration: 300,                              // 过渡时长（毫秒）
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',   // 缓动函数
  enabled: true                               // 是否启用
});

// 获取当前配置
const config = getTransition();
```

#### 系统主题跟随

```typescript
// 跟随系统主题
const unWatch = themeController.watchSystemTheme((mode) => {
  console.log('系统主题变更为:', mode);
});

// 取消跟随
unWatch();
```

#### 主题变化监听

```typescript
// 监听主题变化事件
const unListen = themeController.onChange((event) => {
  console.log('主题已变更:', event.detail);
  // { mode: 'dark', config: {...} }
});

// 取消监听
unListen();
```

### Vue Composition API

```vue
<template>
  <div>
    <p>当前主题：{{ mode }}</p>
    <button @click="toggleMode">切换主题</button>
    <button @click="applyPreset('tech')">应用科技蓝</button>
  </div>
</template>

<script setup lang="ts">
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
  watchSystemTheme,  // 监听系统主题
} = useTheme({
  watchSystem: false,    // 是否跟随系统主题
  initialMode: 'light',  // 初始主题模式
});
</script>
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
  // [{
  //   field: 'colorPrimary',
  //   message: 'RGB 值必须在 0-255 范围内',
  //   value: 'rgb(300 0 0)'
  // }]
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

## 🎨 在组件中使用主题

### 使用 CSS 变量

所有组件都应使用主题变量，而不是硬编码颜色值：

```scss
// ✅ 推荐：使用主题变量
.button {
  color: var(--colorPrimary);
  background: var(--colorBgContainer);
  border: 1px solid var(--colorBorder);
  padding: var(--paddingXS) var(--padding);
  border-radius: var(--borderRadiusSM);
  font-size: var(--fontSize);
}

// ❌ 避免：硬编码值
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

## 🔧 高级用法

### SSR/SSG 支持

#### Nuxt 3

```typescript
// plugins/theme.client.ts
import { themeController } from '@aix/theme';

export default defineNuxtPlugin(() => {
  // 自动恢复用户主题偏好
  // 主题控制器会自动从 localStorage 读取
});
```

```vue
<!-- app.vue -->
<template>
  <Html :data-theme="themeMode">
    <NuxtPage />
  </Html>
</template>

<script setup lang="ts">
const themeMode = ref('light');

onMounted(() => {
  themeMode.value = themeController.getMode();

  themeController.onChange((event) => {
    themeMode.value = event.detail.mode;
  });
});
</script>
```

#### Next.js App Router

```tsx
// app/layout.tsx
import { generateSSRInitScript } from '@aix/theme/ssr-utils';

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
import { defineTheme, generateThemeTokens } from '@aix/theme';

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

// 应用自定义主题
themeController.applyTheme(customTheme);
```

### 动态主题生成

```typescript
import { generateColorSeries } from '@aix/theme';

// 从用户选择的颜色生成完整色系
const userColor = 'rgb(255 0 0)';
const colorSeries = generateColorSeries(userColor);

themeController.setTokens({
  colorPrimary: colorSeries.base,
  colorPrimaryHover: colorSeries.hover,
  colorPrimaryActive: colorSeries.active,
  colorPrimaryBg: colorSeries.bg,
  colorPrimaryBorder: colorSeries.border,
  colorPrimaryText: colorSeries.text,
});
```

## 📝 Storybook 集成

Storybook 已完整集成主题系统，提供实时主题切换功能。

### 使用方法

1. 启动 Storybook：
```bash
pnpm preview
```

2. 在工具栏中点击 **主题按钮**（太阳☀️/月亮🌙 图标）

3. 选择亮色或暗色主题，所有组件会实时切换

### 查看示例

访问 Storybook 中的 **Button > ThemeDemo** 页面，查看完整的主题切换演示。

## 🎯 最佳实践

### 1. 统一使用主题变量

```scss
// ✅ 好的做法
.card {
  background: var(--colorBgContainer);
  border: 1px solid var(--colorBorder);
  color: var(--colorText);
}

// ❌ 不好的做法
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
    @click="toggleTheme"
    :aria-label="`切换到${mode === 'light' ? '暗色' : '亮色'}模式`"
  >
    <IconSun v-if="mode === 'dark'" />
    <IconMoon v-else />
  </button>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';
const { mode, toggleMode } = useTheme();

const toggleTheme = () => {
  toggleMode();
};
</script>
```

### 3. 考虑无障碍

- 使用足够的颜色对比度
- 提供明确的视觉反馈
- 支持键盘操作
- 添加适当的 ARIA 标签

### 4. 性能优化

```typescript
// 使用批量设置而不是逐个设置
// ✅ 好的做法
themeController.setTokens({
  colorPrimary: 'rgb(0 102 255)',
  colorSuccess: 'rgb(82 196 26)',
  fontSize: '16px'
});

// ❌ 不好的做法（会触发多次重渲染）
themeController.setToken('colorPrimary', 'rgb(0 102 255)');
themeController.setToken('colorSuccess', 'rgb(82 196 26)');
themeController.setToken('fontSize', '16px');
```

## 🐛 常见问题

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

## 📚 相关文档

- [主题定制指南](./theme.md)
- [组件开发指南](../components/development.md)
- [设计规范](../../README.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进主题系统！
