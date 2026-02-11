# @aix/theme

AIX Design System 主题系统，基于三层 Design Token 架构（Seed → Map → Alias），提供完整的 TypeScript API 和 Vue 集成。

## 特性

- **三层 Token 架构**：Seed（种子）→ Map（基础）→ Alias（语义）派生体系
- **暗色模式**：内置亮色/暗色主题，支持系统跟随和自动切换
- **算法可组合**：支持 `darkAlgorithm`、`compactAlgorithm`、`wireframeAlgorithm` 叠加
- **TypeScript**：完整的类型定义，类型安全的 CSS 变量引用
- **Vue 集成**：Context API + Composition API，响应式状态管理
- **嵌套主题**：ThemeScope 组件支持局部主题覆盖
- **组件级定制**：支持按组件覆写 Token
- **颜色算法**：HSV 色板生成，自动派生 hover/active/bg/border 等状态色
- **预设色板**：7 种内置预设色（Cyan、Blue、Purple、Green、Red、Orange、Gold）
- **SSR 支持**：提供防闪烁脚本和 SSR 工具函数
- **主题验证**：内置配置验证器，确保 Token 格式正确
- **持久化**：自动保存用户主题偏好到 localStorage

## 安装

```bash
pnpm add @aix/theme
# 或
npm install @aix/theme
```

## 快速开始

### 1. 安装主题插件

```typescript
// main.ts
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';
import '@aix/theme/style';
import App from './App.vue';

const app = createApp(App);

const { install, dispose } = createTheme({
  initialMode: 'light',    // 初始模式：'light' | 'dark'
  persist: true,           // 持久化到 localStorage
  watchSystem: false,      // 跟随系统主题
  storageKey: 'aix-theme-mode',
  prefix: 'aix',           // CSS 变量前缀
});

app.use({ install });
app.mount('#app');

// 应用卸载时清理（可选）
// dispose();
```

### 2. 在组件中使用

```vue
<template>
  <div :style="{ color: cssVar.colorPrimary }">
    <button @click="toggleMode">
      当前主题: {{ mode }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, toggleMode, cssVar } = useTheme();
</script>
```

## 三层 Token 架构

```
Seed Token (种子层)              约 20 个核心配置
  │  colorPrimary, fontSize, borderRadius, sizeUnit...
  │
  ▼  deriveMapTokens()
Map Token (基础层)               原子级设计变量
  │  tokenCyan1~10, tokenSpacing1~12, tokenFontSize1~7...
  │
  ▼  deriveAliasTokens()
Alias Token (语义层)             组件直接使用的语义变量
     colorPrimary, padding, fontSize, borderRadius...
```

**设计优势**：
- **Seed**：用户只需配置少量种子值，即可影响整套主题
- **Map**：原子级变量，确保设计一致性
- **Alias**：语义化命名，组件直接使用

## 核心 API

### createTheme - 创建主题实例

```typescript
import { createTheme, darkAlgorithm, compactAlgorithm } from '@aix/theme';

const { themeContext, install, dispose } = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: false,
  storageKey: 'aix-theme-mode',
  prefix: 'aix',
  cssCompatibility: 'normal',  // 'normal' | 'where'
  initialConfig: {
    seed: {
      colorPrimary: 'rgb(22 119 255)',  // 自定义主色
      borderRadius: 8,
    },
    token: {
      // 直接覆写语义 Token
    },
    algorithm: [darkAlgorithm, compactAlgorithm],  // 算法组合
    transition: {
      duration: 200,
      easing: 'ease-in-out',
      enabled: true,
    },
  },
});

app.use({ install });
```

### useTheme - 组件内使用（推荐）

```typescript
import { useTheme } from '@aix/theme';

const {
  // 响应式状态
  mode,           // Ref<'light' | 'dark'>
  config,         // Ref<ThemeConfig>
  cssVar,         // CSS 变量引用（类型安全）

  // 模式控制
  setMode,        // (mode: ThemeMode) => void
  toggleMode,     // () => ThemeMode

  // Token 操作
  setToken,       // (key, value) => void
  setTokens,      // (tokens) => void
  getToken,       // <K>(key: K) => ThemeTokens[K]
  getTokens,      // () => ThemeTokens

  // 主题配置
  applyTheme,     // (config: ThemeConfig) => void

  // 过渡动画
  setTransition,  // (config: TransitionConfig) => void
  getTransition,  // () => Required<TransitionConfig>

  // 组件级主题
  setComponentTheme,    // (name: string, config) => void
  removeComponentTheme, // (name: string) => void

  // 重置
  reset,          // () => void
} = useTheme();
```

### useThemeContext - 底层 API

```typescript
import { useThemeContext, useThemeContextOptional } from '@aix/theme';

// 必须在 Context 内使用，否则抛出错误
const context = useThemeContext();

// 可选版本，Context 不存在时返回 undefined
const contextOrUndefined = useThemeContextOptional();
```

### cssVar - 类型安全的 CSS 变量引用

```typescript
import { cssVar, cssVarName, getCSSVar, createCSSVarRefs } from '@aix/theme';

// 对象形式（推荐）
const style = {
  color: cssVar.colorPrimary,        // => "var(--aix-colorPrimary)"
  background: cssVar.colorBgContainer,
};

// 函数形式（支持 fallback）
const color = getCSSVar('colorPrimary');
// => "var(--aix-colorPrimary)"
const colorWithFallback = getCSSVar('colorPrimary', '#000');
// => "var(--aix-colorPrimary, #000)"

// 获取变量名（用于 setProperty）
const varName = cssVarName.colorPrimary;  // => "--aix-colorPrimary"
element.style.setProperty(varName, '#ff0000');

// 自定义前缀
const myVar = createCSSVarRefs('my-app');
myVar.colorPrimary  // => "var(--my-app-colorPrimary)"
```

### ThemeScope - 嵌套主题组件

```vue
<template>
  <div>
    <!-- 外层：亮色主题 -->
    <Card>Light Theme Card</Card>

    <!-- 内层：暗色主题 -->
    <ThemeScope :config="darkConfig" mode="dark">
      <Card>Dark Theme Card</Card>
    </ThemeScope>
  </div>
</template>

<script setup lang="ts">
import { ThemeScope, darkAlgorithm } from '@aix/theme';

const darkConfig = {
  algorithm: darkAlgorithm,
  seed: {
    colorPrimary: 'rgb(22 119 255)',
  },
};
</script>
```

**注意**：ThemeScope 内的 context 是只读的，调用 `setMode()`、`setToken()` 等方法会输出警告。

### 算法函数

```typescript
import {
  defaultAlgorithm,    // 默认算法（亮色）
  darkAlgorithm,       // 暗色算法
  darkMixAlgorithm,    // 暗色混合算法（更柔和）
  compactAlgorithm,    // 紧凑算法（减小间距/字号）
  wireframeAlgorithm,  // 线框算法（无填充色）
} from '@aix/theme';

// 算法可组合叠加
const { install } = createTheme({
  initialConfig: {
    algorithm: [darkAlgorithm, compactAlgorithm],
  },
});
```

### 种子派生 API

```typescript
import {
  defaultSeedTokens,       // 默认种子值
  deriveMapTokens,         // Seed → Map
  deriveAliasTokens,       // Map + Seed → Alias
  deriveThemeTokens,       // 完整派生（便捷函数）
  derivePresetColorTokens, // 生成预设色板
  DEFAULT_PRESET_COLORS,   // 默认 7 种预设色
} from '@aix/theme';

// 自定义种子派生
const customSeed = { ...defaultSeedTokens, colorPrimary: 'rgb(255 0 100)' };
const mapTokens = deriveMapTokens(customSeed);
const aliasTokens = deriveAliasTokens(mapTokens, customSeed);
```

### 颜色算法

```typescript
import {
  // 解析
  parseColor,
  parseHex,
  detectColorFormat,

  // 转换
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToHsv,
  hsvToRgb,

  // 调整
  adjustLightness,
  adjustSaturation,
  mixColors,

  // 生成
  generateColorSeries,
  generateColorSeriesFromPalette,
  generatePalette,
} from '@aix/theme';

// 生成 10 级色板（HSV 步进法）
const palette = generatePalette('rgb(22 119 255)');
// => ['rgb(...)', 'rgb(...)', ...] // 10 个颜色

// 生成完整色系
const series = generateColorSeriesFromPalette('rgb(22 119 255)');
// => { base, hover, active, bg, bgHover, border, borderHover, text, textHover, textActive }

// 调整亮度
const lighter = adjustLightness('rgb(0 180 180)', 20);  // 变亮
const darker = adjustLightness('rgb(0 180 180)', -20);  // 变暗
```

### 主题验证

```typescript
import {
  validateThemeConfig,
  validateThemeConfigOrThrow,
  sanitizeThemeConfig,
} from '@aix/theme';

const result = validateThemeConfig({
  seed: { colorPrimary: 'invalid-color' },
});

if (!result.valid) {
  console.error(result.errors);   // 错误列表
  console.warn(result.warnings);  // 警告列表
}

// 抛出异常版本
validateThemeConfigOrThrow(config);

// 自动过滤无效配置
const safeConfig = sanitizeThemeConfig(config);
```

### SSR 支持

```typescript
import {
  isBrowser,
  generateSSRInitScript,
  generateSSRStyleTag,
  getSystemThemePreference,
} from '@aix/theme';

// 生成防闪烁脚本（放在 <head> 中）
const script = generateSSRInitScript('aix-theme-mode', 'light');
// <script>${script}</script>

// 生成 style 标签
const styleTag = generateSSRStyleTag('light');
// <style id="aix-theme-ssr">:root{color-scheme:light}</style>
```

## 组件级主题覆写

```typescript
const { setComponentTheme, removeComponentTheme } = useTheme();

// 为 Button 组件设置特殊主题
setComponentTheme('button', {
  token: {
    colorPrimary: 'rgb(255 0 100)',
    borderRadius: '20px',
  },
});

// 移除覆写
removeComponentTheme('button');
```

生成的 CSS：
```css
.aix-button,
:root[data-theme] .aix-button {
  --aix-colorPrimary: rgb(255 0 100);
  --aix-borderRadius: 20px;
}
```

## Token 参考

### Seed Token（种子配置）

| Token | 类型 | 默认值 | 说明 |
|-------|------|--------|------|
| colorPrimary | string | `rgb(19 194 194)` | 主色 |
| colorSuccess | string | `rgb(82 196 26)` | 成功色 |
| colorWarning | string | `rgb(250 173 20)` | 警告色 |
| colorError | string | `rgb(245 34 45)` | 错误色 |
| colorInfo | string | `rgb(19 194 194)` | 信息色 |
| colorTextBase | string | `rgb(0 0 0)` | 文本基色 |
| colorBgBase | string | `rgb(255 255 255)` | 背景基色 |
| fontSize | number | `14` | 基础字号 |
| borderRadius | number | `6` | 基础圆角 |
| sizeUnit | number | `4` | 间距单位 |
| controlHeight | number | `32` | 控件高度 |
| lineWidth | number | `1` | 边框宽度 |
| fontWeightStrong | number | `600` | 粗体字重 |
| motion | boolean | `true` | 是否启用动效 |

### 语义 Token（组件使用）

```css
/* 品牌色 */
--aix-colorPrimary, --aix-colorPrimaryHover, --aix-colorPrimaryActive
--aix-colorPrimaryBg, --aix-colorPrimaryBgHover
--aix-colorPrimaryBorder, --aix-colorPrimaryBorderHover
--aix-colorPrimaryText, --aix-colorPrimaryTextHover, --aix-colorPrimaryTextActive

/* 功能色（Success/Warning/Error/Info 同上结构） */
--aix-colorSuccess, --aix-colorWarning, --aix-colorError, --aix-colorInfo

/* 文本色 */
--aix-colorText, --aix-colorTextSecondary, --aix-colorTextTertiary
--aix-colorTextDisabled, --aix-colorTextPlaceholder, --aix-colorTextHeading

/* 背景色 */
--aix-colorBgBase, --aix-colorBgContainer, --aix-colorBgElevated, --aix-colorBgLayout
--aix-colorBgMask, --aix-colorBgSpotlight

/* 边框色 */
--aix-colorBorder, --aix-colorBorderSecondary, --aix-colorSplit

/* 间距 */
--aix-sizeXXS (4px) → --aix-sizeXXL (48px)
--aix-paddingXXS → --aix-paddingXXL
--aix-marginXXS → --aix-marginXXL

/* 字号 */
--aix-fontSizeXS (12px) → --aix-fontSizeXXL (20px)

/* 圆角 */
--aix-borderRadiusXS → --aix-borderRadiusLG

/* 控制高度 */
--aix-controlHeightXS (16px) → --aix-controlHeightLG (40px)

/* 阴影 */
--aix-shadowXS, --aix-shadowSM, --aix-shadow, --aix-shadowMD, --aix-shadowLG

/* z-index */
--aix-zIndexBase, --aix-zIndexPopupBase, --aix-zIndexModal, --aix-zIndexTooltip

/* 动效 */
--aix-motionDurationFast, --aix-motionDurationMid, --aix-motionDurationSlow
--aix-motionEaseInOut, --aix-motionEaseOut, --aix-motionEaseIn
```

## 目录结构

```
src/
├── core/                       # 核心模块（纯函数，无 Vue 依赖）
│   ├── color-algorithm.ts      # 颜色算法（HSL/HSV 转换、色板生成）
│   ├── define-theme.ts         # 主题定义与算法组合
│   ├── seed-derivation.ts      # 三层 Token 派生逻辑
│   └── theme-dom-renderer.ts   # DOM 渲染器
├── vue/                        # Vue 集成
│   ├── theme-context.ts        # Context 状态管理 + Plugin
│   ├── ThemeScope.ts           # 嵌套主题组件
│   ├── use-theme.ts            # useTheme Hook
│   └── use-theme-context.ts    # useThemeContext Hook
├── utils/                      # 工具函数
│   ├── css-var.ts              # CSS 变量引用
│   ├── ssr-utils.ts            # SSR 兼容工具
│   ├── theme-validator.ts      # 主题验证器
│   └── token-metadata.ts       # Token 元数据（CLI 用）
├── vars/                       # 静态 CSS 变量文件
│   ├── index.css               # 入口（CSS Layers）
│   ├── base-tokens.css         # 基础 Token
│   ├── semantic-tokens-light.css
│   ├── semantic-tokens-dark.css
│   └── transition.css          # 过渡动画
├── cli.ts                      # CLI 工具
├── index.ts                    # 导出入口
└── theme-types.ts              # 类型定义
```

## 最佳实践

### 1. 使用语义 Token

```css
/* ✅ 推荐：使用语义 Token */
.button {
  background: var(--aix-colorPrimary);
  padding: var(--aix-padding);
  border-radius: var(--aix-borderRadius);
}

/* ❌ 避免：使用基础 Token 或硬编码 */
.button {
  background: var(--aix-tokenCyan6);
  padding: 16px;
  border-radius: 6px;
}
```

### 2. 使用类型安全的 cssVar

```typescript
// ✅ 推荐：类型安全，有自动补全
const style = { color: cssVar.colorPrimary };

// ❌ 避免：字符串拼接，容易出错
const style = { color: 'var(--aix-colorPrimary)' };
```

### 3. 通过 Seed 定制主题

```typescript
// ✅ 推荐：配置种子值，自动派生完整主题
const { install } = createTheme({
  initialConfig: {
    seed: {
      colorPrimary: 'rgb(22 119 255)',
      borderRadius: 8,
    },
  },
});

// ❌ 避免：逐个覆写语义 Token（维护成本高）
```

### 4. 监听主题变化

```typescript
import { watch } from 'vue';
import { useTheme } from '@aix/theme';

const { mode } = useTheme();

watch(mode, (newMode) => {
  console.log('主题已切换:', newMode);
});

// 或监听 DOM 事件
window.addEventListener('aix-theme-change', (e) => {
  console.log('主题变化:', e.detail);
});
```
