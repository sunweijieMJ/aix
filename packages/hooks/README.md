# @aix/hooks

AIX 组件库的工具 Hooks 集合，提供国际化等通用功能。

## ✨ 特性

- 轻量级国际化实现
- TypeScript 类型安全
- 支持中文、英文
- 组件级语言包
- SSR 兼容
- 支持语言持久化

## 安装

```bash
pnpm add @aix/hooks
```

## 快速开始

### 1. 应用层配置

```typescript
// main.ts
import { createApp } from 'vue';
import { createLocale } from '@aix/hooks';
import App from './App.vue';

const app = createApp(App);

// 创建并安装全局 locale
const { install } = createLocale('zh-CN');
app.use({ install });

app.mount('#app');
```

### 2. 组件中使用

```vue
<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { buttonLocale } from './locale';

// 使用组件语言包
const { locale, t } = useLocale(buttonLocale);
</script>

<template>
  <div>
    <!-- 文本翻译 -->
    <p>{{ t.placeholder }}</p>
    <p>当前语言: {{ locale }}</p>
  </div>
</template>
```

### 3. 创建组件语言包

```typescript
// packages/my-component/src/locale/zh-CN.ts
export default {
  placeholder: '请输入',
  submit: '提交',
} as const;

// packages/my-component/src/locale/en-US.ts
export default {
  placeholder: 'Please enter',
  submit: 'Submit',
} as const;

// packages/my-component/src/locale/index.ts
import type { ComponentLocale } from '@aix/hooks';
import zhCN from './zh-CN';
import enUS from './en-US';

export interface MyComponentLocale {
  placeholder: string;
  submit: string;
}

export const myComponentLocale: ComponentLocale<MyComponentLocale> = {
  'zh-CN': zhCN,
  'en-US': enUS,
};
```

## API

### createLocale

创建全局语言上下文。

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| defaultLocale | `'zh-CN'` \| `'en-US'` | `'zh-CN'` | ❌ | 默认语言 |
| options.persist | `boolean` | `false` | ❌ | 是否持久化到 localStorage |

**返回值：**

| 属性 | 类型 | 描述 |
|------|------|------|
| localeContext | `LocaleContext` | locale 上下文对象 |
| install | `(app: App) => void` | Vue 插件安装函数 |

**示例：**

```typescript
import { createLocale } from '@aix/hooks';

// 基础用法
const { install } = createLocale('zh-CN');
app.use({ install });

// 启用持久化
const { install } = createLocale('zh-CN', { persist: true });
app.use({ install });
```

### useLocale

组件内使用的国际化 hook。

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| componentLocale | `ComponentLocale<T>` | - | ✅ | 组件的语言包 |
| overrideLocale | `Locale \| Ref<Locale>` | - | ❌ | 覆盖语言（优先级高于全局设置） |

**返回值：**

| 属性 | 类型 | 描述 |
|------|------|------|
| locale | `ComputedRef<Locale>` | 当前语言 |
| t | `ComputedRef<T & CommonLocale>` | 翻译文本对象（包含组件文案和公共文案） |

**示例：**

```vue
<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { buttonLocale } from './locale';

const { locale, t } = useLocale(buttonLocale);

// t.value 包含组件文案和公共文案
console.log(t.value.confirm); // 公共文案
console.log(t.value.submit);  // 组件文案
</script>
```

### useCommonLocale

仅使用公共语言包的 hook。

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| overrideLocale | `Locale \| Ref<Locale>` | - | ❌ | 覆盖语言 |

**返回值：**

| 属性 | 类型 | 描述 |
|------|------|------|
| locale | `ComputedRef<Locale>` | 当前语言 |
| t | `ComputedRef<CommonLocale>` | 公共翻译文本对象 |

## 公共语言包

所有组件都可以使用公共语言包中的文案：

```typescript
{
  confirm: '确认' | 'Confirm',
  cancel: '取消' | 'Cancel',
  ok: '好的' | 'OK',
  close: '关闭' | 'Close',
  submit: '提交' | 'Submit',
  reset: '重置' | 'Reset',
  save: '保存' | 'Save',
  delete: '删除' | 'Delete',
  edit: '编辑' | 'Edit',
  search: '搜索' | 'Search',
  add: '添加' | 'Add',
  loading: '加载中...' | 'Loading...',
  noData: '暂无数据' | 'No data',
  // ... 更多通用文案
}
```

## 类型定义

```typescript
// 支持的语言
type Locale = 'zh-CN' | 'en-US';

// 组件语言包结构
interface ComponentLocale<T> {
  'zh-CN': T;
  'en-US': T;
}

// useLocale 返回值
interface LocaleReturn<T> {
  locale: ComputedRef<Locale>;
  t: ComputedRef<T>;
}

// Locale 上下文
interface LocaleContext {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}
```

## 最佳实践

### 1. 组件语言包设计

- 只定义组件特有的文案
- 通用文案使用公共语言包
- 导出类型定义供外部使用

```typescript
// ✅ 好的实践
export interface SelectLocale {
  placeholder: string;
  noMatch: string;
  // loading、noData 等从 commonLocale 继承
}

// ❌ 避免重复定义
export interface SelectLocale {
  placeholder: string;
  noMatch: string;
  loading: string;      // 重复了！
  noData: string;       // 重复了！
}
```

### 2. 支持用户自定义文案

```vue
<script setup>
const props = defineProps<{
  placeholder?: string;  // 允许用户覆盖
}>();

const { t } = useLocale(selectLocale);

// 优先使用用户提供的文案
const placeholderText = computed(() => props.placeholder ?? t.value.placeholder);
</script>
```

### 3. SSR 兼容

`createLocale` 已内置 SSR 支持，会自动检测环境并处理 localStorage 访问。

## License

MIT
