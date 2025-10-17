# @aix/hooks

AIX 组件库的工具 Hooks 集合，提供国际化、格式化等通用功能。

## 安装

```bash
pnpm add @aix/hooks
```

## 功能特性

### 🌍 国际化（i18n）

- ✅ 轻量级实现（~5KB）
- ✅ TypeScript 类型安全
- ✅ 支持中文、英文、日文
- ✅ 组件级语言包
- ✅ SSR 兼容
- ✅ 浏览器原生 Intl API 支持

### 📊 格式化器

- **复数处理** - 使用 `Intl.PluralRules`
- **日期格式化** - 多种格式（短日期、长日期、相对时间）
- **数字格式化** - 小数、百分比、紧凑格式
- **货币格式化** - 多币种支持

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
const { locale, t, plural, date, number, currency } = useLocale(buttonLocale);
</script>

<template>
  <div>
    <!-- 文本翻译 -->
    <p>{{ t.placeholder }}</p>

    <!-- 复数处理 -->
    <p>{{ plural(5, t.items) }}</p>

    <!-- 日期格式化 -->
    <p>{{ date.short(new Date()) }}</p>

    <!-- 数字格式化 -->
    <p>{{ number.percent(0.75) }}</p>

    <!-- 货币格式化 -->
    <p>{{ currency(1234.56, 'CNY') }}</p>
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

## API 文档

### createLocale(defaultLocale)

创建全局语言上下文。

**参数：**
- `defaultLocale: Locale` - 默认语言，可选值：`'zh-CN'` | `'en-US'`

**返回：**
- `{ localeContext, install }` - locale 上下文和 Vue 插件安装函数

### useLocale(componentLocale)

组件内使用的国际化 hook。

**参数：**
- `componentLocale: ComponentLocale<T>` - 组件的语言包

**返回：**
```typescript
{
  locale: ComputedRef<Locale>;       // 当前语言
  t: ComputedRef<T>;                 // 翻译文本对象
  plural: PluralFormatter;           // 复数格式化器
  date: DateFormatter;               // 日期格式化器
  number: NumberFormatter;           // 数字格式化器
  currency: CurrencyFormatter;       // 货币格式化器
}
```

### useCommonLocale()

仅使用公共语言包的 hook。

**返回：**
与 `useLocale` 相同，但 `t` 仅包含公共语言包的文案。

## 格式化器详解

### 复数格式化 (plural)

```typescript
const { plural } = useLocale(locale);

// 语言包定义
const items = {
  zero: '没有项目',
  one: '{count} 个项目',
  other: '{count} 个项目',
};

plural(0, items);  // => "没有项目"
plural(1, items);  // => "1 个项目"
plural(5, items);  // => "5 个项目"
```

### 日期格式化 (date)

```typescript
const { date } = useLocale(locale);
const now = new Date();

date.short(now);     // => "2025-01-15"
date.long(now);      // => "2025年1月15日 星期三"
date.time(now);      // => "14:30:00"
date.relative(now);  // => "刚刚"
```

### 数字格式化 (number)

```typescript
const { number } = useLocale(locale);

number.decimal(1234.5678);      // => "1,234.57"
number.percent(0.755);          // => "75.5%"
number.compact(12000);          // => "1.2万" (zh-CN) / "12K" (en-US)
```

### 货币格式化 (currency)

```typescript
const { currency } = useLocale(locale);

currency(1234.56);              // => "¥1,234.56" (默认 CNY)
currency(1234.56, 'USD');       // => "$1,234.56"
currency(1234.56, 'EUR');       // => "€1,234.56"
```

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

## 最佳实践

### 1. 组件语言包设计

- ✅ 只定义组件特有的文案
- ✅ 通用文案使用公共语言包
- ✅ 导出类型定义供外部使用

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
