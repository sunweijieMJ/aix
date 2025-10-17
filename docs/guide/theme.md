# 主题定制

Aix 提供了强大的主题系统，基于 **Token 架构** 和 **TypeScript API**，支持亮色/暗色模式、预设主题和完全自定义。

## 架构设计

### Token 系统

Aix 采用两层 Token 架构：

```
基础Token (Base Tokens)
    ↓ 映射
语义Token (Semantic Tokens)
    ↓ 使用
组件样式
```

**基础Token**：原子级设计变量，如 `--tokenCyan6`、`--tokenSpacing4`
**语义Token**：业务级变量，如 `--colorPrimary`、`--padding`

这种设计允许你通过修改基础Token来全局影响主题，或单独调整语义Token来细粒度定制。

## 快速开始

### 1. 安装主题系统

```typescript
// main.ts
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';
import '@aix/theme/style'; // 完整主题（包含亮色+暗色）

const app = createApp(App);

// 创建并安装主题 Context
const { install } = createTheme({
  initialMode: 'light',  // 初始模式：'light' | 'dark'
  persist: true,         // 持久化到 localStorage
  watchSystem: true,     // 跟随系统主题
});

app.use({ install });
app.mount('#app');
```

### 2. 在组件中使用

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, toggleMode, applyPreset } = useTheme();
</script>

<template>
  <div>
    <p>当前模式: {{ mode }}</p>
    <button @click="toggleMode">切换主题</button>
    <button @click="applyPreset('tech')">科技蓝主题</button>
  </div>
</template>
```

## TypeScript API

### createTheme - 创建主题 Context

```typescript
import { createTheme } from '@aix/theme';

const { themeContext, install } = createTheme({
  // 初始主题模式
  initialMode: 'light',  // 'light' | 'dark'

  // 初始主题配置
  initialConfig: {
    token: {
      colorPrimary: 'rgb(0 180 180)',
      fontSize: '14px',
    },
    algorithm: 'default',
  },

  // 持久化配置
  persist: true,          // 是否持久化到 localStorage
  storageKey: 'aix-theme-mode', // localStorage key

  // 系统主题跟随
  watchSystem: true,      // 是否跟随系统主题
});

// 在 Vue 应用中安装
app.use({ install });

// 直接访问 themeContext（通常不需要）
console.log(themeContext.mode);
themeContext.setMode('dark');
```

### useTheme - 组件中使用主题

```typescript
import { useTheme } from '@aix/theme';

export default {
  setup() {
    const {
      mode,           // 当前模式 (Ref<'light' | 'dark'>)
      config,         // 当前配置 (Ref<ThemeConfig>)
      setMode,        // 设置模式
      toggleMode,     // 切换模式
      applyTheme,     // 应用完整配置
      setToken,       // 设置单个 Token
      setTokens,      // 批量设置 Token
      applyPreset,    // 应用预设主题
      registerPreset, // 注册自定义预设
      getPresets,     // 获取所有预设
      reset,          // 重置为默认主题
    } = useTheme();

    // 1. 设置主题模式
    setMode('dark');  // 'light' | 'dark'

    // 2. 切换模式
    const newMode = toggleMode(); // light ↔ dark

    // 3. 获取当前模式（响应式）
    console.log(mode.value); // 'light' | 'dark'

    // 4. 设置单个Token
    setToken('colorPrimary', 'rgb(255 0 0)');

    // 5. 批量设置Token
    setTokens({
      colorPrimary: 'rgb(24 144 255)',
      fontSize: '16px',
    });

    // 6. 应用预设主题
    applyPreset('tech');

    // 7. 响应主题变化（mode 是响应式的）
    watch(mode, (newMode) => {
      console.log('Theme changed to:', newMode);
    });

    return { mode, toggleMode };
  }
}
```

## 预设主题

Aix 内置了5个预设主题：

| 名称 | 说明 | 主色 |
|------|------|------|
| `default` | 默认主题 | 青色 (Cyan) |
| `tech` | 科技蓝 | 蓝色 (Blue) |
| `nature` | 自然绿 | 绿色 (Green) |
| `sunset` | 日落橙 | 橙色 (Orange) |
| `purple` | 优雅紫 | 紫色 (Purple) |

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { applyPreset, registerPreset, getPresets } = useTheme();

// 应用预设
applyPreset('tech');

// 查看所有预设
const presets = getPresets();
console.log(presets);

// 注册自定义预设
registerPreset({
  name: 'custom',
  displayName: '自定义主题',
  token: {
    colorPrimary: 'rgb(255 105 180)',
  },
});
</script>
```

## 暗色模式

### 方式1：手动切换

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, setMode, toggleMode } = useTheme();

// 设置暗色模式
setMode('dark');

// 或切换模式
toggleMode();
</script>

<template>
  <button @click="toggleMode">
    {{ mode === 'dark' ? '☀️ 亮色' : '🌙 暗色' }}
  </button>
</template>
```

### 方式2：跟随系统主题

```typescript
// main.ts
import { createTheme } from '@aix/theme';

const { install } = createTheme({
  initialMode: 'light',
  watchSystem: true,  // 自动跟随系统主题设置
});

app.use({ install });
```

### 方式3：时间自动切换

```vue
<script setup lang="ts">
import { onMounted } from 'vue';
import { useTheme } from '@aix/theme';

const { setMode } = useTheme();

onMounted(() => {
  // 18:00-6:00 使用暗色模式
  const hour = new Date().getHours();
  if (hour >= 18 || hour < 6) {
    setMode('dark');
  }
});
</script>
```

### CSS 类名方式

主题系统会自动设置 `data-theme` 属性：

```html
<!-- 亮色模式 -->
<html data-theme="light">

<!-- 暗色模式 -->
<html data-theme="dark">
```

你也可以使用CSS类：

```css
/* 暗色模式特定样式 */
:root[data-theme='dark'] .my-component {
  background: #000;
}
```

## Token 列表

### 颜色 Token

#### 品牌色

| Token | 说明 | 亮色值 | 暗色值 |
|-------|------|--------|--------|
| `--colorPrimary` | 主色 | `rgb(0 180 180)` | `rgb(31 194 188)` |
| `--colorPrimaryHover` | 主色悬停 | 自动生成 | 自动生成 |
| `--colorPrimaryActive` | 主色激活 | 自动生成 | 自动生成 |

#### 功能色

| Token | 说明 | 用途 |
|-------|------|------|
| `--colorSuccess` | 成功色 | 成功提示、完成状态 |
| `--colorWarning` | 警告色 | 警告提示、注意状态 |
| `--colorError` | 错误色 | 错误提示、危险操作 |

#### 文本色

| Token | 说明 | 透明度 |
|-------|------|--------|
| `--colorText` | 主文本 | 88% |
| `--colorTextSecondary` | 次要文本 | 65% |
| `--colorTextTertiary` | 三级文本 | 45% |
| `--colorTextDisabled` | 禁用文本 | 25% |

### 尺寸 Token

#### 间距

| Token | 值 | 说明 |
|-------|-----|------|
| `--sizeXXS` | 4px | 极小间距 |
| `--sizeXS` | 8px | 较小间距 |
| `--sizeSM` | 12px | 小间距 |
| `--size` | 16px | 标准间距 |
| `--sizeLG` | 24px | 大间距 |

#### 字号

| Token | 值 | 说明 |
|-------|-----|------|
| `--fontSizeXS` | 12px | 辅助文字 |
| `--fontSize` | 14px | 正文（默认） |
| `--fontSizeLG` | 16px | 小标题 |
| `--fontSizeXL` | 18px | 标题 |

#### 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `--borderRadiusXS` | 2px | 小组件 |
| `--borderRadiusSM` | 4px | 按钮（默认） |
| `--borderRadius` | 6px | 卡片 |
| `--borderRadiusLG` | 8px | 大型容器 |

## 高级用法

### 颜色算法

```typescript
import {
  generateColorSeries,
  generateColorPalette,
  adjustLightness
} from '@aix/theme';

// 生成完整色系
const series = generateColorSeries('rgb(0 180 180)');
console.log(series);
// {
//   base: 'rgb(0 180 180)',
//   hover: 'rgb(31 194 188)',
//   active: 'rgb(0 138 143)',
//   bg: 'rgb(220 245 241)',
//   border: 'rgb(105 219 208)',
//   text: 'rgb(0 71 79)',
//   ...
// }

// 生成10级色盘
const palette = generateColorPalette('rgb(0 180 180)');
console.log(palette); // [浅色...深色]

// 调整亮度
const lighter = adjustLightness('rgb(0 180 180)', 20); // 变亮
const darker = adjustLightness('rgb(0 180 180)', -20); // 变暗
```

### 完整示例

```typescript
// main.ts
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';
import '@aix/theme/style';
import App from './App.vue';

const app = createApp(App);

// 创建主题 Context
const { install } = createTheme({
  initialMode: 'light',
  initialConfig: {
    token: {
      colorPrimary: 'rgb(0 102 255)',  // 科技蓝
      fontSize: '16px',
      borderRadius: '8px',
    },
    algorithm: 'default',
  },
  persist: true,      // 持久化到 localStorage
  watchSystem: true,  // 跟随系统主题
});

app.use({ install });
app.mount('#app');
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { watch } from 'vue';
import { useTheme } from '@aix/theme';

const { mode, config, setMode, applyPreset } = useTheme();

// 响应主题变化
watch(mode, (newMode) => {
  console.log('Theme changed to:', newMode);
  // 可以在这里执行其他逻辑
});
</script>

<template>
  <div class="app">
    <header>
      <h1>My App</h1>
      <button @click="setMode(mode === 'dark' ? 'light' : 'dark')">
        {{ mode === 'dark' ? '🌞' : '🌙' }}
      </button>
    </header>

    <nav>
      <button @click="applyPreset('default')">默认</button>
      <button @click="applyPreset('tech')">科技蓝</button>
      <button @click="applyPreset('nature')">自然绿</button>
    </nav>

    <main>
      <p>当前模式: {{ mode }}</p>
      <p>主色: {{ config.token?.colorPrimary }}</p>
    </main>
  </div>
</template>
```

## 最佳实践

### 1. 使用语义Token

```css
/* ✅ 推荐 */
.button {
  background: var(--colorPrimary);
  padding: var(--padding);
}

/* ❌ 避免 */
.button {
  background: var(--tokenCyan6);
  padding: 16px;
}
```

### 2. 响应主题变化

```vue
<script setup lang="ts">
import { watch, computed } from 'vue';
import { useTheme } from '@aix/theme';

const { mode } = useTheme();

// mode 是响应式的，直接使用
const isDark = computed(() => mode.value === 'dark');

// 监听主题变化
watch(mode, (newMode) => {
  console.log('Theme changed to:', newMode);
  // 执行其他副作用
  if (newMode === 'dark') {
    document.body.classList.add('dark-scrollbar');
  } else {
    document.body.classList.remove('dark-scrollbar');
  }
});
</script>

<template>
  <div :class="{ dark: isDark }">
    {{ isDark ? '暗色模式' : '亮色模式' }}
  </div>
</template>
```

### 3. 持久化主题

通过 `createTheme` 配置持久化：

```typescript
// main.ts
import { createTheme } from '@aix/theme';

const { install } = createTheme({
  persist: true,  // 开启持久化（默认为 true）
  storageKey: 'aix-theme-mode',  // 自定义 localStorage key
});

// 用户设置的主题会自动保存，刷新页面后自动恢复
```

### 4. 性能优化

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { setToken, setTokens } = useTheme();

// ✅ 批量更新 - 只触发一次 DOM 更新
setTokens({
  colorPrimary: 'rgb(24 144 255)',
  fontSize: '16px',
  borderRadius: '8px',
});

// ❌ 避免逐个更新 - 会触发多次 DOM 更新
setToken('colorPrimary', 'rgb(24 144 255)');
setToken('fontSize', '16px');
setToken('borderRadius', '8px');
</script>
```

> 主题系统内部使用 `requestAnimationFrame` 批处理 DOM 更新，但仍建议使用 `setTokens` 批量设置以获得最佳性能。

## 类型定义

完整的TypeScript类型支持：

```typescript
import type {
  ThemeTokens,         // 完整Token类型
  PartialThemeTokens,  // 部分Token类型
  ThemeConfig,         // 主题配置类型
  ThemeMode,           // 主题模式类型
  ThemePreset,         // 预设类型
} from '@aix/theme';
```

## 迁移指南

### 从旧 ThemeController API 迁移到 Context API

如果你之前直接使用 `themeController`，现在应该使用 Context-based API：

```typescript
// ❌ 旧版本（已废弃）
import { themeController, setThemeMode, toggleThemeMode } from '@aix/theme';

themeController.setMode('dark');
setThemeMode('dark');
toggleThemeMode();

const unsubscribe = themeController.onChange((e) => {
  console.log(e.detail.mode);
});

themeController.watchSystemTheme();
```

```typescript
// ✅ 新版本（推荐）
// 1. 在 main.ts 安装主题 Context
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';

const app = createApp(App);

const { install } = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: true,  // 替代 watchSystemTheme()
});

app.use({ install });
```

```vue
<!-- 2. 在组件中使用 useTheme -->
<script setup lang="ts">
import { watch } from 'vue';
import { useTheme } from '@aix/theme';

const { mode, setMode, toggleMode } = useTheme();

// 切换模式
setMode('dark');
toggleMode();

// 监听变化（替代 onChange）
watch(mode, (newMode) => {
  console.log('Theme changed:', newMode);
});
</script>
```

### 主要变化

| 旧 API | 新 API | 说明 |
|--------|--------|------|
| `themeController.setMode()` | `useTheme().setMode()` | 在组件中使用 composable |
| `setThemeMode()` | `useTheme().setMode()` | 便捷函数已移除 |
| `toggleThemeMode()` | `useTheme().toggleMode()` | 便捷函数已移除 |
| `themeController.onChange()` | `watch(mode, ...)` | 使用 Vue watch |
| `themeController.watchSystemTheme()` | `createTheme({ watchSystem: true })` | 配置选项 |
| `themeController.getMode()` | `useTheme().mode.value` | 响应式 Ref |

### 迁移步骤

1. **安装主题 Context**（在 main.ts）
   ```typescript
   import { createTheme } from '@aix/theme';
   const { install } = createTheme({ persist: true, watchSystem: true });
   app.use({ install });
   ```

2. **替换组件中的直接调用**
   ```typescript
   // 旧代码
   import { themeController } from '@aix/theme';
   themeController.setMode('dark');

   // 新代码
   import { useTheme } from '@aix/theme';
   const { setMode } = useTheme();
   setMode('dark');
   ```

3. **替换事件监听**
   ```typescript
   // 旧代码
   const unsubscribe = themeController.onChange((e) => {
     console.log(e.detail.mode);
   });

   // 新代码
   import { watch } from 'vue';
   const { mode } = useTheme();
   watch(mode, (newMode) => {
     console.log(newMode);
   });
   ```
