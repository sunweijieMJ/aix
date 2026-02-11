# 主题定制

Aix 提供了强大的主题系统，基于 **Token 架构** 和 **TypeScript API**，支持亮色/暗色模式切换和完全自定义。

## 架构设计

### Token 系统

Aix 采用三层 Token 架构：

```
Seed Tokens（种子层）
    ↓ 派生
Map Tokens（映射层）
    ↓ 别名
Alias Tokens（别名层）
    ↓ 使用
组件样式
```

**Seed Tokens**：核心设计变量，如 `colorPrimary`、`fontSize`、`borderRadius`
**Map Tokens**：由种子派生的中间层变量，如各级颜色色阶
**Alias Tokens**：语义化别名，如 `colorBgContainer`、`colorTextSecondary`

这种设计允许你通过修改种子 Token 来全局影响主题，系统会自动派生出完整的 Token 体系。

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

const { mode, toggleMode, cssVar } = useTheme();
</script>

<template>
  <div>
    <p>当前模式: {{ mode }}</p>
    <button @click="toggleMode">切换主题</button>
    <!-- 使用 CSS 变量引用 -->
    <div :style="{ color: cssVar.colorPrimary }">主题色文本</div>
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
    },
    // algorithm: darkAlgorithm, // 可选：使用暗色算法
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
      // 响应式状态
      mode,           // 当前模式 (Ref<'light' | 'dark'>)
      config,         // 当前配置 (Ref<ThemeConfig>)
      cssVar,         // CSS 变量引用映射

      // 模式控制
      setMode,        // 设置模式
      toggleMode,     // 切换模式

      // Token 操作
      setToken,       // 设置单个 Token
      setTokens,      // 批量设置 Token
      getToken,       // 获取单个 Token 值
      getTokens,      // 获取所有 Token

      // 主题配置
      applyTheme,     // 应用完整配置
      reset,          // 重置为默认主题

      // 过渡动画
      setTransition,  // 设置过渡配置
      getTransition,  // 获取过渡配置

      // 组件级主题
      setComponentTheme,    // 设置组件级主题覆写
      removeComponentTheme, // 移除组件级主题覆写
    } = useTheme();

    // 1. 设置主题模式
    setMode('dark');  // 'light' | 'dark'

    // 2. 切换模式
    const newMode = toggleMode(); // light ↔ dark

    // 3. 获取当前模式（响应式）
    console.log(mode.value); // 'light' | 'dark'

    // 4. 设置单个 Token
    setToken('colorPrimary', 'rgb(255 0 0)');

    // 5. 批量设置 Token
    setTokens({
      colorPrimary: 'rgb(24 144 255)',
      fontSize: 16,
    });

    // 6. 获取 Token 值
    const primaryColor = getToken('colorPrimary');

    // 7. 使用 CSS 变量引用（用于动态样式）
    const buttonStyle = {
      color: cssVar.colorPrimary,        // => "var(--aix-colorPrimary)"
      background: cssVar.colorBgContainer,
    };

    // 8. 响应主题变化（mode 是响应式的）
    watch(mode, (newMode) => {
      console.log('Theme changed to:', newMode);
    });

    return { mode, toggleMode, buttonStyle };
  }
}
```

## 自定义主题

通过 `applyTheme` 可以应用完整的主题配置：

```vue
<script setup lang="ts">
import { useTheme, darkAlgorithm, compactAlgorithm } from '@aix/theme';

const { applyTheme } = useTheme();

// 应用自定义主题配置
applyTheme({
  // 种子 Token（核心配置）
  seed: {
    colorPrimary: 'rgb(24 144 255)',  // 科技蓝
    borderRadius: 8,
  },
  // 直接覆写 Token（高优先级）
  token: {
    colorBgContainer: 'rgb(250 250 250)',
  },
  // 主题算法（可组合）
  algorithm: [darkAlgorithm, compactAlgorithm],
  // 过渡动画配置
  transition: {
    duration: 300,
    easing: 'ease-in-out',
  },
});
</script>
```

### 主题算法

Aix 提供多种可组合的主题算法：

| 算法 | 说明 | 效果 |
|------|------|------|
| `defaultAlgorithm` | 默认算法 | 亮色主题 |
| `darkAlgorithm` | 暗色算法 | 暗色主题 |
| `darkMixAlgorithm` | 混合暗色 | 柔和暗色 |
| `compactAlgorithm` | 紧凑算法 | 减小间距和尺寸 |
| `wireframeAlgorithm` | 线框算法 | 无填充样式 |

算法可以组合使用：

```typescript
import { darkAlgorithm, compactAlgorithm } from '@aix/theme';

applyTheme({
  algorithm: [darkAlgorithm, compactAlgorithm], // 暗色 + 紧凑
});
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
| `--aix-colorPrimary` | 主色 | `rgb(0 180 180)` | `rgb(31 194 188)` |
| `--aix-colorPrimaryHover` | 主色悬停 | 自动生成 | 自动生成 |
| `--aix-colorPrimaryActive` | 主色激活 | 自动生成 | 自动生成 |

#### 功能色

| Token | 说明 | 用途 |
|-------|------|------|
| `--aix-colorSuccess` | 成功色 | 成功提示、完成状态 |
| `--aix-colorWarning` | 警告色 | 警告提示、注意状态 |
| `--aix-colorError` | 错误色 | 错误提示、危险操作 |

#### 文本色

| Token | 说明 | 透明度 |
|-------|------|--------|
| `--aix-colorText` | 主文本 | 88% |
| `--aix-colorTextSecondary` | 次要文本 | 65% |
| `--aix-colorTextTertiary` | 三级文本 | 45% |
| `--aix-colorTextDisabled` | 禁用文本 | 25% |

### 尺寸 Token

#### 间距

| Token | 值 | 说明 |
|-------|-----|------|
| `--aix-sizeXXS` | 4px | 极小间距 |
| `--aix-sizeXS` | 8px | 较小间距 |
| `--aix-sizeSM` | 12px | 小间距 |
| `--aix-size` | 16px | 标准间距 |
| `--aix-sizeLG` | 24px | 大间距 |

#### 字号

| Token | 值 | 说明 |
|-------|-----|------|
| `--aix-fontSizeXS` | 12px | 辅助文字 |
| `--aix-fontSize` | 14px | 正文（默认） |
| `--aix-fontSizeLG` | 16px | 小标题 |
| `--aix-fontSizeXL` | 18px | 标题 |

#### 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| `--aix-borderRadiusXS` | 2px | 小组件 |
| `--aix-borderRadiusSM` | 4px | 按钮（默认） |
| `--aix-borderRadius` | 6px | 卡片 |
| `--aix-borderRadiusLG` | 8px | 大型容器 |

## 高级用法

### 颜色算法

```typescript
import {
  generateColorSeries,
  generatePalette,
  adjustLightness
} from '@aix/theme';

// 生成完整色系（包含 hover、active、bg 等派生色）
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

// 生成 10 级色阶
const palette = generatePalette('rgb(0 180 180)');
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
    seed: {
      colorPrimary: 'rgb(0 102 255)',  // 科技蓝
      borderRadius: 8,
    },
    // algorithm: darkAlgorithm, // 可选：使用暗色算法
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

const { mode, config, setMode, toggleMode, setTokens, cssVar } = useTheme();

// 响应主题变化
watch(mode, (newMode) => {
  console.log('Theme changed to:', newMode);
});

// 自定义主题配置
const themes = {
  default: { colorPrimary: 'rgb(0 180 180)' },
  tech: { colorPrimary: 'rgb(24 144 255)' },
  nature: { colorPrimary: 'rgb(82 196 26)' },
};

const applyCustomTheme = (name: keyof typeof themes) => {
  setTokens(themes[name]);
};
</script>

<template>
  <div class="app">
    <header>
      <h1>My App</h1>
      <button @click="toggleMode">
        {{ mode === 'dark' ? '🌞' : '🌙' }}
      </button>
    </header>

    <nav>
      <button @click="applyCustomTheme('default')">默认</button>
      <button @click="applyCustomTheme('tech')">科技蓝</button>
      <button @click="applyCustomTheme('nature')">自然绿</button>
    </nav>

    <main>
      <p>当前模式: {{ mode }}</p>
      <p :style="{ color: cssVar.colorPrimary }">主题色文本</p>
    </main>
  </div>
</template>
```

## 最佳实践

### 1. 使用语义 Token

```css
/* ✅ 推荐：使用 aix 前缀的语义 Token */
.button {
  background: var(--aix-colorPrimary);
  padding: var(--aix-paddingSM);
}

/* ❌ 避免：硬编码值 */
.button {
  background: #00b4b4;
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
  ThemeTokens,         // 完整 Token 类型
  PartialThemeTokens,  // 部分 Token 类型（用于覆写）
  ThemeConfig,         // 主题配置类型
  ThemeMode,           // 主题模式类型 ('light' | 'dark')
  ThemeAlgorithm,      // 主题算法类型
  SeedTokens,          // 种子 Token 类型
  TransitionConfig,    // 过渡动画配置
  ComponentThemeConfig, // 组件级主题配置
} from '@aix/theme';
```
