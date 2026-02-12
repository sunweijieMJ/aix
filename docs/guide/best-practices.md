# 最佳实践

本文档汇总了使用 Aix 组件库的最佳实践和开发建议。

## 组件使用

### 按需引入

优先使用按需引入，减小打包体积：

```typescript
// ✅ 推荐：按需引入
import { Button } from '@aix/button';
import { Input } from '@aix/input';

// ❌ 避免：全量引入（未来可能支持）
import Aix from 'aix';
const { Button, Input } = Aix;
```

### 样式引入

样式文件应该在应用入口引入一次：

```typescript
// main.ts
import '@aix/theme/dist/index.css';  // ✅ 在这里引入

// ❌ 不要在每个组件中重复引入
```

**按需引入样式**（高级用法）：

```typescript
// 只引入 CSS 变量，不引入具体样式
import '@aix/theme/dist/vars/index.css';

// 按需引入亮色或暗色主题
import '@aix/theme/dist/vars/light.css';
// import '@aix/theme/dist/vars/dark.css';
```

### 组件注册

根据项目规模选择合适的注册方式：

#### 1. 局部注册（小型项目）

```vue
<script setup lang="ts">
import { Button } from '@aix/button';
</script>

<template>
  <Button type="primary">提交</Button>
</template>
```

#### 2. 全局注册（大型项目）

```typescript
// main.ts
import { createApp } from 'vue';
import Button from '@aix/button';
import Input from '@aix/input';
import App from './App.vue';

const app = createApp(App);

// 全局注册常用组件
app.use(Button);
app.use(Input);

app.mount('#app');
```

```vue
<!-- 组件中直接使用 -->
<template>
  <AixButton type="primary">提交</AixButton>
  <AixInput v-model="value" />
</template>
```

## TypeScript 实践

### 类型导入

充分利用 TypeScript 的类型系统：

```typescript
import { Button } from '@aix/button';
import type { ButtonProps, ButtonEmits } from '@aix/button';

// 定义 Props 类型
const buttonProps: ButtonProps = {
  type: 'primary',
  size: 'large',
  disabled: false,
};

// 组件引用类型
import type { ComponentPublicInstance } from 'vue';
const buttonRef = ref<ComponentPublicInstance<typeof Button>>();
```

### 泛型组件（未来功能）

```typescript
// Select 组件的类型推导
interface User {
  id: number;
  name: string;
}

const users: User[] = [
  { id: 1, name: 'Alice' },
  { id: 2, name: 'Bob' },
];

// TypeScript 自动推导 valueKey 的类型
<Select<User>
  :options="users"
  valueKey="id"     // ✅ 自动提示 'id' | 'name'
  labelKey="name"
/>
```

### 扩展组件类型

```typescript
// 扩展 Button Props
import type { ButtonProps } from '@aix/button';

interface MyButtonProps extends ButtonProps {
  analytics?: string;
  testId?: string;
}

// 创建自定义组件
const MyButton = defineComponent<MyButtonProps>({
  // ...
});
```

## 性能优化

### 避免不必要的响应式

```typescript
// ✅ 常量数据使用普通对象
const OPTIONS = [
  { label: '选项1', value: 1 },
  { label: '选项2', value: 2 },
];

// ❌ 静态数据不需要 ref
const options = ref([
  { label: '选项1', value: 1 },
  { label: '选项2', value: 2 },
]);
```

### 使用 Computed 缓存计算结果

```vue
<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ items: any[] }>();

// ✅ 使用 computed 缓存
const filteredItems = computed(() =>
  props.items.filter(item => item.active)
);

// ❌ 模板内直接计算（每次渲染都执行）
// <div v-for="item in items.filter(i => i.active)">
</script>

<template>
  <div v-for="item in filteredItems" :key="item.id">
    {{ item.name }}
  </div>
</template>
```

### 组件懒加载

对于大型组件或不常用的组件，使用懒加载：

```typescript
// 路由懒加载
const routes = [
  {
    path: '/admin',
    component: () => import('./views/Admin.vue'),
  },
];

// 组件懒加载
const HeavyComponent = defineAsyncComponent(() =>
  import('./components/HeavyComponent.vue')
);
```

### v-show vs v-if

```vue
<template>
  <!-- ✅ 频繁切换使用 v-show -->
  <Modal v-show="visible">...</Modal>

  <!-- ✅ 条件很少改变使用 v-if -->
  <AdminPanel v-if="isAdmin">...</AdminPanel>
</template>
```

## 国际化实践

### 统一语言管理

```typescript
// locales/index.ts
export const APP_LOCALES = {
  'zh-CN': {
    app: {
      title: '我的应用',
      description: '描述',
    },
  },
  'en-US': {
    app: {
      title: 'My App',
      description: 'Description',
    },
  },
};

// 在组件中使用
import { useLocale } from '@aix/hooks';
import { APP_LOCALES } from '@/locales';

const { t } = useLocale(APP_LOCALES);
```

### 格式化器的正确使用

```typescript
const { formatters } = useLocale(locale);

// ✅ 使用格式化器
const formattedDate = formatters.date.format(date, 'short');
const formattedNumber = formatters.number.format(1234.56);
const formattedPrice = formatters.currency.format(99.99, 'CNY');

// ❌ 手动格式化（不推荐）
const manualDate = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
```

## 主题定制

### CSS 变量命名

定制主题时保持一致的命名：

```css
:root {
  /* ✅ 使用语义化变量 */
  --colorPrimary: rgb(24, 144, 255);
  --colorSuccess: rgb(82, 196, 26);

  /* ❌ 避免使用具体颜色名 */
  --blue: rgb(24, 144, 255);
  --green: rgb(82, 196, 26);
}
```

### 主题切换

实现主题切换时，使用类名或属性选择器：

```typescript
// utils/theme.ts
export function setTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

export function getTheme(): 'light' | 'dark' {
  return (localStorage.getItem('theme') as 'light' | 'dark') || 'light';
}

// 初始化主题
export function initTheme() {
  const theme = getTheme();
  setTheme(theme);
}
```

```css
/* styles/theme.css */
:root {
  /* 亮色主题（默认） */
}

:root[data-theme='dark'] {
  /* 暗色主题 */
  --colorBgBase: #000;
  --colorText: rgba(255, 255, 255, 0.85);
}
```

### 保持设计一致性

业务组件中应始终使用主题 CSS 变量，避免硬编码颜色和间距值。详细的 CSS 变量使用规范参见[编码规范 - CSS Variables](/guide/development-standards#_4-2-css-variables-禁止硬编码)。

## 表单处理

### 受控组件

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Input, Button } from 'aix';

const formData = ref({
  username: '',
  email: '',
});

function handleSubmit() {
  console.log('提交数据:', formData.value);
}
</script>

<template>
  <form @submit.prevent="handleSubmit">
    <Input
      v-model="formData.username"
      placeholder="用户名"
    />
    <Input
      v-model="formData.email"
      type="email"
      placeholder="邮箱"
    />
    <Button type="primary" native-type="submit">
      提交
    </Button>
  </form>
</template>
```

## 可访问性

### 语义化 HTML

```vue
<template>
  <!-- ✅ 使用正确的语义标签 -->
  <nav>
    <ul>
      <li><a href="/">首页</a></li>
      <li><a href="/about">关于</a></li>
    </ul>
  </nav>

  <!-- ❌ 避免过度使用 div -->
  <div class="nav">
    <div class="nav-item">首页</div>
    <div class="nav-item">关于</div>
  </div>
</template>
```

### ARIA 属性

```vue
<template>
  <Button
    aria-label="关闭对话框"
    @click="closeDialog"
  >
    <CloseIcon />
  </Button>

  <Input
    aria-label="搜索"
    placeholder="搜索..."
    role="searchbox"
  />

  <div
    role="alert"
    aria-live="polite"
    v-if="errorMessage"
  >
    {{ errorMessage }}
  </div>
</template>
```

### 键盘导航

确保所有交互元素可以通过键盘访问：

```vue
<script setup lang="ts">
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    // 触发操作
  }
}
</script>

<template>
  <div
    tabindex="0"
    role="button"
    @click="handleClick"
    @keydown="handleKeydown"
  >
    可点击元素
  </div>
</template>
```

## 测试

组件单元测试的编写规范（文件组织、describe 结构、覆盖维度）参见[编码规范 - 单元测试](/guide/development-standards#_6-单元测试)。本节聚焦业务层面的测试实践。

### 业务组件测试

业务组件测试应关注用户交互流程，而非单个 Props 的枚举验证：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createLocale } from '@aix/hooks';
import UserProfile from '../UserProfile.vue';

describe('UserProfile 组件', () => {
  const createWrapper = (props = {}) => {
    const { install } = createLocale('zh-CN');
    return mount(UserProfile, {
      props: { userId: 1, ...props },
      global: { plugins: [{ install }] },
    });
  };

  it('加载完成后应展示用户信息', async () => {
    const wrapper = createWrapper();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.user-name').exists()).toBe(true);
    expect(wrapper.find('.user-email').exists()).toBe(true);
  });

  it('点击编辑按钮应切换到编辑模式', async () => {
    const wrapper = createWrapper();
    await wrapper.find('[data-testid="edit-btn"]').trigger('click');

    expect(wrapper.find('input[name="username"]').exists()).toBe(true);
  });

  it('提交表单应触发 update 事件并携带表单数据', async () => {
    const wrapper = createWrapper();
    await wrapper.find('[data-testid="edit-btn"]').trigger('click');
    await wrapper.find('input[name="username"]').setValue('Alice');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.emitted('update')?.[0]).toEqual([{
      userId: 1,
      username: 'Alice',
    }]);
  });
});
```

### 测试工具函数

将重复的测试设置提取为工厂函数，保持测试代码简洁：

```typescript
// test-utils.ts
import { mount } from '@vue/test-utils';
import { createLocale } from '@aix/hooks';

/** 创建带国际化插件的 mount wrapper */
export function mountWithPlugins(component: any, options = {}) {
  const { install } = createLocale('zh-CN');
  return mount(component, {
    ...options,
    global: {
      plugins: [{ install }],
      ...(options as any).global,
    },
  });
}
```

## 代码组织

### 文件结构

```
src/
├── components/           # 业务组件
│   ├── common/          # 通用组件
│   │   ├── Header.vue
│   │   └── Footer.vue
│   └── features/        # 功能组件
│       ├── UserProfile/
│       │   ├── index.vue
│       │   ├── types.ts
│       │   └── __test__/
│       └── Dashboard/
├── composables/         # 组合式函数
│   ├── useAuth.ts
│   └── useApi.ts
├── locales/            # 国际化文件
│   ├── zh-CN.ts
│   └── en-US.ts
├── styles/             # 全局样式
│   ├── variables.css   # 主题变量
│   └── global.css      # 全局样式
├── utils/              # 工具函数
│   ├── request.ts
│   └── theme.ts
└── views/              # 页面组件
    ├── Home.vue
    └── About.vue
```

### Composables 组织

```typescript
// composables/useUser.ts
import { ref, computed } from 'vue';
import type { User } from '@/types';

export function useUser() {
  const user = ref<User | null>(null);
  const isLoggedIn = computed(() => user.value !== null);

  async function login(credentials: any) {
    // 登录逻辑
  }

  function logout() {
    user.value = null;
  }

  return {
    user,
    isLoggedIn,
    login,
    logout,
  };
}
```

### 类型定义

```typescript
// types/user.ts
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends LoginCredentials {
  name: string;
}
```

## 错误处理

### 统一错误处理

```typescript
// utils/error-handler.ts
export function handleError(error: any) {
  if (error.response) {
    // HTTP 错误
    const status = error.response.status;
    const message = error.response.data.message;

    switch (status) {
      case 401:
        // 未授权
        break;
      case 403:
        // 禁止访问
        break;
      case 404:
        // 未找到
        break;
      default:
        console.error(message);
    }
  } else if (error.request) {
    // 网络错误
    console.error('网络错误');
  } else {
    // 其他错误
    console.error(error.message);
  }
}
```

### 组件级错误处理

```vue
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const error = ref<Error | null>(null);

onErrorCaptured((err) => {
  error.value = err;
  // 返回 false 阻止错误继续传播
  return false;
});
</script>

<template>
  <div v-if="error" class="error-boundary">
    <p>出错了: {{ error.message }}</p>
    <Button @click="error = null">重试</Button>
  </div>
  <slot v-else />
</template>
```

## 开发工具

### VSCode 配置

```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "typescript.tsdk": "node_modules/typescript/lib",
  "volar.takeOverMode": true
}
```

### 推荐扩展

- **Volar**: Vue 3 语言支持
- **ESLint**: 代码检查
- **Prettier**: 代码格式化
- **TypeScript Vue Plugin**: TS 支持

## 性能监控

### 使用 Vue DevTools

1. 安装 [Vue DevTools](https://devtools.vuejs.org/)
2. 打开浏览器开发者工具
3. 查看组件性能和状态

### LightHouse 审计

定期运行 LightHouse 审计：

```bash
# 使用 Chrome DevTools
# 或安装 CLI
npm install -g lighthouse

# 运行审计
lighthouse https://your-app.com --view
```

## 总结

遵循这些最佳实践可以帮助你：

- ✅ 编写高质量、可维护的代码
- ✅ 提升应用性能和用户体验
- ✅ 增强可访问性
- ✅ 简化国际化和主题定制
- ✅ 提高开发效率

如有问题或建议，欢迎提交 [Issue](https://github.com/sunweijieMJ/aix/issues)。

## 相关文档

- [快速开始](/guide/getting-started)
- [国际化](/guide/i18n)
- [主题定制](/guide/theme)
- [贡献指南](/guide/contributing)
