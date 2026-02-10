# @aix/theme

AIX Design System 主题系统，基于 Design Token 架构，提供完整的 TypeScript API 和 Vue 集成。

## 特性

- **Design Token 架构**：基础 Token（原子级）+ 语义 Token（业务级）两层设计
- **暗色模式**：内置亮色/暗色主题，支持系统跟随和自动切换
- **紧凑模式**：支持 `compact` 和 `dark-compact` 组合算法
- **TypeScript**：完整的类型定义，类型安全的 CSS 变量引用
- **Vue 集成**：Context API + Composition API，响应式状态管理
- **预设主题**：5 个内置主题，支持自定义预设
- **颜色算法**：自动生成派生颜色（hover/active/bg/border 等）
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

const { mode, toggleMode, cssVar, applyPreset } = useTheme();

// 应用预设主题
applyPreset('tech'); // 科技蓝
</script>
```

## 核心 API

### createTheme - 创建主题实例

```typescript
import { createTheme } from '@aix/theme';

const { themeContext, install, dispose } = createTheme({
  initialMode: 'light',           // 初始模式
  persist: true,                  // 持久化
  watchSystem: false,             // 跟随系统主题
  storageKey: 'aix-theme-mode',   // localStorage key
  initialConfig: {                // 初始配置（可选）
    token: { colorPrimary: 'rgb(0 102 255)' },
    algorithm: 'default',
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

  // 预设管理
  applyPreset,    // (name: string) => void
  registerPreset, // (preset: ThemePreset) => void
  getPresets,     // () => ThemePreset[]

  // 过渡动画
  setTransition,  // (config: TransitionConfig) => void
  getTransition,  // () => Required<TransitionConfig>

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
import { cssVar, cssVarName, getCSSVar } from '@aix/theme';

// 对象形式（推荐）
const style = {
  color: cssVar.colorPrimary,        // => "var(--colorPrimary)"
  background: cssVar.colorBgContainer,
};

// 函数形式（支持 fallback）
const color = getCSSVar('colorPrimary');           // => "var(--colorPrimary)"
const colorWithFallback = getCSSVar('colorPrimary', '#000');  // => "var(--colorPrimary, #000)"

// 获取变量名（用于 setProperty）
const varName = cssVarName.colorPrimary;  // => "--colorPrimary"
element.style.setProperty(varName, '#ff0000');
```

### defineTheme - 定义主题配置

```typescript
import { defineTheme, generateThemeTokens, tokensToCSSVars } from '@aix/theme';

const myTheme = defineTheme({
  token: {
    colorPrimary: 'rgb(0 102 255)',
    fontSize: '16px',
  },
  algorithm: 'dark',  // 'default' | 'dark' | 'compact' | 'dark-compact'
  transition: {
    duration: 200,
    easing: 'ease-in-out',
    enabled: true,
  },
});

// 生成完整的 Token 对象
const tokens = generateThemeTokens(myTheme);

// 转换为 CSS 变量对象
const cssVars = tokensToCSSVars(tokens);
// { '--colorPrimary': 'rgb(0 102 255)', ... }
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

  // 调整
  adjustLightness,
  adjustSaturation,

  // 生成
  generateColorSeries,
  generateColorPalette,
  generateHoverColor,
  generateActiveColor,
  generateBgColor,
} from '@aix/theme';

// 生成完整色系
const series = generateColorSeries('rgb(0 180 180)');
// { base, hover, active, bg, bgHover, border, borderHover, text, textHover, textActive }

// 生成 10 级色盘
const palette = generateColorPalette('rgb(0 180 180)');
// ['rgb(...)', 'rgb(...)', ... ] // 10 个颜色

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
  token: { colorPrimary: 'invalid-color' },
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

## 预设主题

| 名称 | 主色 | 说明 |
|------|------|------|
| `default` | Cyan | 默认青色主题 |
| `tech` | Blue | 科技蓝主题 |
| `nature` | Green | 自然绿主题 |
| `sunset` | Orange | 日落橙主题 |
| `purple` | Purple | 优雅紫主题 |

```typescript
// 应用预设
const { applyPreset } = useTheme();
applyPreset('tech');

// 注册自定义预设
const { registerPreset } = useTheme();
registerPreset({
  name: 'custom',
  displayName: '自定义主题',
  token: {
    colorPrimary: 'rgb(255 0 100)',
  },
});
```

## 算法模式

| 算法 | 说明 |
|------|------|
| `default` | 默认亮色模式 |
| `dark` | 暗色模式（自动反转颜色） |
| `compact` | 紧凑模式（减小间距和字号） |
| `dark-compact` | 暗色 + 紧凑模式组合 |

```typescript
import { defineTheme } from '@aix/theme';

const darkCompactTheme = defineTheme({
  algorithm: 'dark-compact',
});
```

## Token 架构

```
基础 Token (原子级)           语义 Token (业务级)
─────────────────────────────────────────────────
--tokenCyan6                → --colorPrimary
--tokenSpacing4             → --padding
--tokenFontSize3            → --fontSize
--tokenBorderRadius3        → --borderRadius
```

### 颜色 Token

```css
/* 品牌色 */
--colorPrimary, --colorPrimaryHover, --colorPrimaryActive
--colorPrimaryBg, --colorPrimaryBgHover
--colorPrimaryBorder, --colorPrimaryBorderHover
--colorPrimaryText, --colorPrimaryTextHover, --colorPrimaryTextActive

/* 功能色（Success/Warning/Error 同上结构） */
--colorSuccess, --colorWarning, --colorError

/* 文本色 */
--colorText, --colorTextSecondary, --colorTextTertiary, --colorTextQuaternary
--colorTextDisabled, --colorTextPlaceholder, --colorTextHeading

/* 背景色 */
--colorBgBase, --colorBgContainer, --colorBgElevated, --colorBgLayout
--colorBgMask, --colorBgSpotlight, --colorBgTextHover, --colorBgTextActive

/* 边框色 */
--colorBorder, --colorBorderSecondary, --colorSplit

/* 链接色 */
--colorLink, --colorLinkHover, --colorLinkActive
```

### 尺寸 Token

```css
/* 间距 */
--sizeXXS (4px) → --sizeXXL (48px)
--paddingXXS → --paddingXXL
--marginXXS → --marginXXL

/* 字号 */
--fontSizeXS (12px) → --fontSizeXXL (20px)

/* 圆角 */
--borderRadiusXS (2px) → --borderRadiusLG (8px)

/* 控制高度 */
--controlHeightXS (16px) → --controlHeightLG (40px)

/* 行高 */
--lineHeightSM (1.2), --lineHeight (1.5), --lineHeightLG (1.8)
```

### 其他 Token

```css
/* 阴影 */
--shadowXS, --shadowSM, --shadow, --shadowMD, --shadowLG, --shadowXL

/* z-index */
--zIndexBase, --zIndexPopupBase, --zIndexAffix, --zIndexModal
--zIndexPopover, --zIndexDropdown, --zIndexTooltip, --zIndexNotification

/* 字体 */
--fontFamily, --fontFamilyCode
```

## 目录结构

```
src/
├── core/                    # 核心模块
│   ├── color-algorithm.ts   # 颜色算法
│   ├── define-theme.ts      # 主题定义与 Token 生成
│   └── theme-dom-renderer.ts # DOM 渲染器
├── vue/                     # Vue 集成
│   ├── theme-context.ts     # Context 状态管理
│   ├── use-theme.ts         # useTheme Hook
│   └── use-theme-context.ts # useThemeContext Hook
├── utils/                   # 工具函数
│   ├── css-var.ts           # CSS 变量引用
│   ├── ssr-utils.ts         # SSR 兼容工具
│   └── theme-validator.ts   # 主题验证器
├── vars/                    # CSS 变量定义
│   ├── index.css            # 入口（CSS Layers）
│   ├── base-tokens.css      # 基础 Token
│   ├── semantic-tokens-light.css  # 亮色语义 Token
│   ├── semantic-tokens-dark.css   # 暗色语义 Token
│   └── transition.css       # 过渡动画
├── index.ts                 # 导出入口
└── theme-types.ts           # 类型定义
```

## 构建产物

```
es/                  # ESM 格式
├── index.js
├── index.d.ts
└── ...

lib/                 # CJS 格式
├── index.js
└── ...

vars/                # CSS 变量
├── index.css        # 完整入口
├── base-tokens.css
├── semantic-tokens-light.css
└── semantic-tokens-dark.css
```

## 最佳实践

### 1. 使用语义 Token

```css
/* ✅ 推荐：使用语义 Token */
.button {
  background: var(--colorPrimary);
  padding: var(--padding);
  border-radius: var(--borderRadius);
}

/* ❌ 避免：使用基础 Token 或硬编码 */
.button {
  background: var(--tokenCyan6);
  padding: 16px;
  border-radius: 6px;
}
```

### 2. 使用类型安全的 cssVar

```typescript
// ✅ 推荐：类型安全，有自动补全
const style = { color: cssVar.colorPrimary };

// ❌ 避免：字符串拼接，容易出错
const style = { color: 'var(--colorPrimary)' };
```

### 3. 监听主题变化

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

## License

MIT
