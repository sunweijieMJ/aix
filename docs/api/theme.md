---
title: Theme API
outline: deep
---

# Theme API

::: tip 使用指南
关于主题系统的使用方法和最佳实践，请参阅 [主题定制](/guide/theme) 指南。
:::

## createTheme

创建主题 Context，用于初始化主题系统。

**参数**：

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| initialMode | `'light'` \| `'dark'` | `'light'` | - | 初始主题模式 |
| initialConfig | `ThemeConfig` | - | - | 初始主题配置 |
| persist | `boolean` | `true` | - | 是否持久化到 localStorage |
| storageKey | `string` | `'aix-theme-mode'` | - | localStorage key |
| watchSystem | `boolean` | `false` | - | 是否跟随系统主题 |

**返回值**：

| 属性 | 类型 | 描述 |
|------|------|------|
| themeContext | `ThemeContext` | 主题上下文对象 |
| install | `(app: App) => void` | Vue 插件安装函数 |

**示例**：

```typescript
import { createApp } from 'vue';
import { createTheme } from '@aix/theme';
import '@aix/theme/style';

const app = createApp(App);

const { install } = createTheme({
  initialMode: 'light',
  persist: true,
  watchSystem: true,
});

app.use({ install });
```

## useTheme

组件中使用主题的 Composable。

**返回值**：

| 属性 | 类型 | 描述 |
|------|------|------|
| mode | `Ref<ThemeMode>` | 当前主题模式 |
| config | `Ref<ThemeConfig>` | 当前主题配置 |
| cssVar | `CSSVarRefs` | CSS 变量引用映射 |
| setMode | `(mode: ThemeMode) => void` | 设置主题模式 |
| toggleMode | `() => ThemeMode` | 切换主题模式 |
| setToken | `(key: string, value: string \| number) => void` | 设置单个 Token |
| setTokens | `(tokens: PartialThemeTokens) => void` | 批量设置 Token |
| getToken | `(key: string) => string \| number \| undefined` | 获取 Token 值 |
| getTokens | `() => ThemeTokens` | 获取所有 Token |
| applyTheme | `(config: ThemeConfig) => void` | 应用主题配置 |
| reset | `() => void` | 重置为默认主题 |
| setTransition | `(config: TransitionConfig) => void` | 设置过渡配置 |
| getTransition | `() => TransitionConfig` | 获取过渡配置 |
| setComponentTheme | `(component: string, config: ComponentThemeConfig) => void` | 设置组件级主题 |
| removeComponentTheme | `(component: string) => void` | 移除组件级主题 |

**示例**：

```vue
<script setup lang="ts">
import { useTheme } from '@aix/theme';

const { mode, toggleMode, cssVar, setTokens } = useTheme();

// 切换主题
const handleToggle = () => {
  toggleMode();
};

// 设置自定义颜色
const setCustomColor = () => {
  setTokens({
    colorPrimary: 'rgb(24 144 255)',
  });
};
</script>

<template>
  <button @click="handleToggle">{{ mode }}</button>
  <div :style="{ color: cssVar.colorPrimary }">主题色文本</div>
</template>
```

## useThemeContext

获取原始 ThemeContext（通常使用 useTheme 即可）。

**返回值**：`ThemeContext`

```typescript
import { useThemeContext } from '@aix/theme';

const themeContext = useThemeContext();
```

## 主题算法

### defaultAlgorithm

默认亮色主题算法。

### darkAlgorithm

暗色主题算法。

### darkMixAlgorithm

混合暗色主题算法（更柔和的暗色效果）。

### compactAlgorithm

紧凑布局算法（减小间距和尺寸）。

### wireframeAlgorithm

线框风格算法（无填充样式）。

**使用示例**：

```typescript
import { darkAlgorithm, compactAlgorithm } from '@aix/theme';

// 组合使用多个算法
applyTheme({
  algorithm: [darkAlgorithm, compactAlgorithm],
});
```

## 颜色工具

### parseColor

解析颜色字符串为 RGB 对象。

```typescript
import { parseColor } from '@aix/theme';

const rgb = parseColor('rgb(0 180 180)');
// { r: 0, g: 180, b: 180 }

const rgb2 = parseColor('#00b4b4');
// { r: 0, g: 180, b: 180 }
```

### adjustLightness

调整颜色亮度。

```typescript
import { adjustLightness } from '@aix/theme';

const lighter = adjustLightness('rgb(0 180 180)', 20);  // 变亮
const darker = adjustLightness('rgb(0 180 180)', -20); // 变暗
```

### generateColorSeries

生成完整色系（包含 hover、active、bg 等派生色）。

```typescript
import { generateColorSeries } from '@aix/theme';

const series = generateColorSeries('rgb(0 180 180)');
// {
//   base: 'rgb(0 180 180)',
//   hover: 'rgb(31 194 188)',
//   active: 'rgb(0 138 143)',
//   bg: 'rgb(220 245 241)',
//   border: 'rgb(105 219 208)',
//   text: 'rgb(0 71 79)',
//   ...
// }
```

### generatePalette

生成 10 级色阶。

```typescript
import { generatePalette } from '@aix/theme';

const palette = generatePalette('rgb(0 180 180)');
// ['#e6fffb', '#b5f5ec', '#87e8de', '#5cdbd3', '#36cfc9', ...]
```

### mixColors

混合两个颜色。

```typescript
import { mixColors } from '@aix/theme';

const mixed = mixColors('rgb(255 0 0)', 'rgb(0 0 255)', 0.5);
// 红蓝混合
```

## CSS 变量工具

### cssVar

CSS 变量引用对象（带 `var(--aix-xxx)` 格式）。

```typescript
import { cssVar } from '@aix/theme';

const style = {
  color: cssVar.colorPrimary,        // "var(--aix-colorPrimary)"
  background: cssVar.colorBgContainer,
};
```

### cssVarName

CSS 变量名对象（仅变量名，不带 `var()`）。

```typescript
import { cssVarName } from '@aix/theme';

console.log(cssVarName.colorPrimary); // "--aix-colorPrimary"
```

### getCSSVar / getCSSVarName

动态获取 CSS 变量引用/名称。

```typescript
import { getCSSVar, getCSSVarName } from '@aix/theme';

const ref = getCSSVar('colorPrimary');   // "var(--aix-colorPrimary)"
const name = getCSSVarName('colorPrimary'); // "--aix-colorPrimary"
```

### createCSSVarRefs / createCSSVarNames

创建自定义前缀的 CSS 变量工具。

```typescript
import { createCSSVarRefs, createCSSVarNames } from '@aix/theme';

const myVar = createCSSVarRefs('my');
const myVarName = createCSSVarNames('my');

console.log(myVar.colorPrimary);     // "var(--my-colorPrimary)"
console.log(myVarName.colorPrimary); // "--my-colorPrimary"
```

## SSR 工具

### isBrowser

检测是否在浏览器环境。

```typescript
import { isBrowser } from '@aix/theme';

if (isBrowser) {
  // 浏览器特定代码
}
```

### getSystemThemePreference

获取系统主题偏好。

```typescript
import { getSystemThemePreference } from '@aix/theme';

const systemTheme = getSystemThemePreference(); // 'light' | 'dark'
```

### generateSSRInitScript

生成 SSR 初始化脚本（防止闪烁）。

```typescript
import { generateSSRInitScript } from '@aix/theme';

const script = generateSSRInitScript({
  storageKey: 'aix-theme-mode',
  defaultMode: 'light',
});
// 返回可注入 HTML 的 script 标签内容
```

### generateSSRStyleTag

生成 SSR 样式标签。

```typescript
import { generateSSRStyleTag } from '@aix/theme';

const styleTag = generateSSRStyleTag(themeTokens);
// 返回可注入 HTML 的 style 标签内容
```

## 类型定义

### ThemeMode

```typescript
type ThemeMode = 'light' | 'dark';
```

### ThemeTokens

完整的主题 Token 类型，包含所有颜色、尺寸、间距等变量。

### PartialThemeTokens

部分 Token 类型，用于覆写。

### ThemeConfig

```typescript
interface ThemeConfig {
  seed?: Partial<SeedTokens>;      // 种子 Token
  token?: PartialThemeTokens;       // 直接覆写 Token
  algorithm?: ThemeAlgorithm | ThemeAlgorithm[];  // 主题算法
  transition?: TransitionConfig;    // 过渡动画配置
  components?: ComponentsConfig;    // 组件级主题配置
}
```

### SeedTokens

种子 Token 类型（核心设计变量）。

```typescript
interface SeedTokens {
  colorPrimary: string;
  colorSuccess: string;
  colorWarning: string;
  colorError: string;
  fontSize: number;
  borderRadius: number;
  // ...
}
```

### TransitionConfig

```typescript
interface TransitionConfig {
  duration: number;        // 过渡时长（ms）
  easing: string;          // 缓动函数
}
```

### ThemeAlgorithm

```typescript
type ThemeAlgorithm = (tokens: ThemeTokens) => ThemeTokens;
```

## ThemeScope 组件

嵌套主题作用域组件，用于局部主题覆盖。

**Props**：

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| config | `ThemeConfig` | - | 局部主题配置 |
| mode | `ThemeMode` | - | 覆盖主题模式 |

**示例**：

```vue
<template>
  <div>
    <!-- 全局主题 -->
    <Button type="primary">全局主题按钮</Button>

    <!-- 局部主题覆盖 -->
    <ThemeScope :config="{ seed: { colorPrimary: 'rgb(255 0 0)' } }">
      <Button type="primary">红色主题按钮</Button>
    </ThemeScope>
  </div>
</template>

<script setup lang="ts">
import { ThemeScope } from '@aix/theme';
import { Button } from '@aix/button';
</script>
```
