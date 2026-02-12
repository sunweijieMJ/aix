---
title: Hooks API
outline: deep
---

# Hooks API

::: warning 自动生成
此文档由 `pnpm docs:sync` 自动生成。请勿手动编辑此文件。

如需更新 API 文档，请修改组件源码注释，然后运行：

```bash
pnpm docs:gen  # 生成 API 到 README.md
pnpm docs:sync # 同步到文档站点
```

:::

## createLocale

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

## useLocale

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

## useCommonLocale

仅使用公共语言包的 hook。

| 属性 | 类型 | 默认值 | 必填 | 描述 |
|------|------|--------|:----:|------|
| overrideLocale | `Locale \| Ref<Locale>` | - | ❌ | 覆盖语言 |

**返回值：**

| 属性 | 类型 | 描述 |
|------|------|------|
| locale | `ComputedRef<Locale>` | 当前语言 |
| t | `ComputedRef<CommonLocale>` | 公共翻译文本对象 |
