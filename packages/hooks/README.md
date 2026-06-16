# @aix/hooks

AIX 组件库的通用 Composition API Hooks 集合：国际化、DOM 生命周期封装、响应式状态、样式与浮层工具。

## 特性

- **国际化**：轻量 i18n，组件级语言包，中/英文，SSR 兼容，可持久化
- **生命周期安全**：事件监听、定时器、ResizeObserver 等均在卸载 / effect scope 销毁时自动清理
- **响应式 target**：DOM 类 hook 的 target 支持 ref / getter，变化自动重绑，传 null 即停用
- **SSR / 环境守卫**：无 `document` / `ResizeObserver`（SSR、jsdom）时安全空转，不抛错
- **TypeScript**：完整类型定义与重载
- **零额外依赖**：仅依赖 Vue

## 安装

```bash
pnpm add @aix/hooks
```

## Hooks 一览

| Hook | 分类 | 说明 |
|------|------|------|
| `createLocale` / `useLocale` / `useCommonLocale` | 国际化 | 组件级 i18n（详见下方「国际化」） |
| `useNamespace` | 样式 | 生成 `.aix-` 前缀的 BEM class |
| `useZIndex` | 浮层 | 全局递增 z-index 管理（模块级单例） |
| `useEventListener` | DOM / 生命周期 | 自动清理的事件监听，target 响应式 |
| `useResizeObserver` | DOM / 生命周期 | 自动清理 + 环境守卫的 ResizeObserver |
| `useClickOutside` | DOM / 生命周期 | 点击外部检测（pointerdown + capture） |
| `useTimeout` | 生命周期 | 自动清理的 setTimeout（restart 语义） |
| `useInterval` | 生命周期 | 自动清理的 setInterval |
| `useControllable` | 状态 | 受控 / 非受控（v-model）统一封装 |
| `useClipboard` / `copyText` | 工具 | 剪贴板复制（降级兜底）+ copied 反馈态 |

## 通用 Hooks

### useNamespace

生成 `.aix-` 前缀的 BEM class，避免各组件包手写模板字符串拼接、消除前缀硬编码漂移。

```ts
import { useNamespace } from '@aix/hooks';

const ns = useNamespace('button');
ns.b();                 // 'aix-button'
ns.b('icon');           // 'aix-button-icon'
ns.e('text');           // 'aix-button__text'
ns.m('primary');        // 'aix-button--primary'
ns.em('text', 'sm');    // 'aix-button__text--sm'
ns.is('active');        // 'is-active'
ns.is('active', false); // ''
```

### useZIndex

全局递增 z-index 计数器，保证最后打开的浮层始终最高。基础值 `2000`（高于主题最高语义层级）。**模块级单例**——全库须共享同一份 `@aix/hooks` 实例，否则计数器分裂会导致叠放错乱。

```ts
import { useZIndex } from '@aix/hooks';

const { currentZIndex, nextZIndex } = useZIndex();
// currentZIndex: Readonly<Ref<number>>
const z = nextZIndex(); // 打开浮层时调用，返回新的最高值
```

### useEventListener

把「`addEventListener` → 卸载时 `removeEventListener`」样板封装掉。`target` 支持响应式（ref / getter / `MaybeRefOrGetter`）：变化时自动解绑旧的、绑定新的；为 `null` / `undefined` 时不绑定（可借此启停）。`event` 支持单个或多个。返回 `stop()` 手动停止。

```ts
import { useEventListener } from '@aix/hooks';

useEventListener(window, 'keydown', onKey);          // 绑到 window，卸载自动清理
useEventListener(elRef, 'click', onClick);            // 响应式 target：变化自动重绑
useEventListener(document, ['pointerdown', 'pointerup'], onPointer, true); // 多事件 + capture
const stop = useEventListener(() => (open.value ? window : null), 'keydown', onEsc); // 启停
```

### useResizeObserver

封装「`new ResizeObserver` → `observe` → 卸载 `disconnect`」，并在无 `ResizeObserver`（SSR / jsdom）时安全空转。`target` 响应式，变化自动重新观测；为 `null` 时不观测。返回 `stop()`。

```ts
import { ref } from 'vue';
import { useResizeObserver } from '@aix/hooks';

const el = ref<HTMLElement | null>(null);
useResizeObserver(el, (entries) => {
  const { width, height } = entries[0].contentRect;
});
```

### useClickOutside

点击元素外部时触发回调，使用 `pointerdown` 在 capture 阶段监听 `document`（比 click 更快）。`enabled` 为 false / SSR 时自动解绑，卸载自动清理。返回 `stop()`。

```ts
import { computed } from 'vue';
import { useClickOutside } from '@aix/hooks';

useClickOutside({
  excludeRefs: computed(() => [triggerRef.value, popupRef.value]), // 不算「外部」的元素
  handler: () => (open.value = false),
  enabled: open, // 可选，支持 ref / getter，默认 true
});
```

### useTimeout

自动清理的 `setTimeout`。`delay` 支持响应式（每次 `start` 取当前值）；`start()` 具备 **restart 语义**（先清旧定时器再启动），适合「活动即重置」的倒计时。

```ts
import { useTimeout } from '@aix/hooks';

const { start, stop, isPending } = useTimeout(() => (copied.value = false), 1500);
start(); // 1.5s 后回调；再次 start 重新计时
// 选项：useTimeout(cb, delay, { immediate: true }) 创建即启动
```

返回 `{ isPending: Readonly<Ref<boolean>>, start(): void, stop(): void }`。

### useInterval

自动清理的 `setInterval`。`interval` 支持响应式；`start()` 同样具 restart 语义。

```ts
import { useInterval } from '@aix/hooks';

const { start, stop, isActive } = useInterval(() => tick(), 1000);
start();
// 选项：useInterval(cb, interval, { immediate: true })
```

返回 `{ isActive: Readonly<Ref<boolean>>, start(): void, stop(): void }`。

### useControllable

统一处理带 v-model 的组件「外部传值则受控、否则用内部状态」的二态逻辑：受控时写入只 `emit` 不改内部（避免切回非受控时状态污染），非受控时读写内部 ref 并同步 emit；写入按 `Object.is` 去重。

```ts
import { useControllable } from '@aix/hooks';

const props = defineProps<{ open?: boolean }>();
const emit = defineEmits<{ 'update:open': [boolean] }>();

const { state: open, setState } = useControllable({
  prop: () => props.open,        // 受控值；undefined 走非受控
  defaultValue: false,           // 非受控初始值
  onChange: (v) => emit('update:open', v),
});
// open 是 WritableComputedRef<boolean>：open.value 可读可写，或 setState(true)
```

### useClipboard / copyText

`copyText(text)` 是纯函数复制：优先异步 Clipboard API，不可用（非 HTTPS / 旧浏览器 / 权限被拒）时降级到 `document.execCommand('copy')`，返回是否成功。`useClipboard` 在其上叠加 `copied` 反馈态（成功后自动回落）。

```ts
import { useClipboard, copyText } from '@aix/hooks';

// 带反馈态（用于「已复制」气泡）
const { copy, copied } = useClipboard();        // 选项 { copiedDuration: 1500 }，0 则不自动回落
await copy('hello');                            // copied 短暂置 true

// 纯函数版（无响应式状态）
const ok = await copyText('hello');             // => boolean
```

`useClipboard` 返回 `{ copied: Readonly<Ref<boolean>>, copy(text): Promise<boolean> }`。

## 国际化（i18n）

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

## 国际化 API

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
