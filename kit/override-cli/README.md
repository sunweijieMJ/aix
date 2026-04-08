# @kit/override-cli

CLI 工具：一键生成定制化覆盖层目录结构和模板文件，帮助多项目场景快速搭建按需定制的覆盖层骨架。

## 特性

- **交互式向导** - 引导选择项目代码、语言、定制模块，支持 `--yes` 跳过向导
- **模块化生成** - 按需选择 9 个定制维度（路由、组件、API、布局等），必选模块自动补全
- **干跑模式** - `--dry-run` 预览将生成的文件，不实际写入
- **冲突处理** - 检测已有文件并交互式决策，支持 `--force` 强制覆盖
- **TypeScript / JavaScript 双支持** - 模板文件按语言分组，生成对应扩展名的文件
- **项目代码重名检测** - 在同一输出目录下防止项目代码冲突
- **编程 API** - 除 CLI 外还提供 Node.js API，可集成到其他工具中

---

## 快速开始

无需安装，直接用 `npx` 执行（在项目根目录运行）：

```bash
# 交互式向导（推荐）
npx @kit/override-cli

# 指定参数，跳过向导
npx @kit/override-cli --project sysu --lang ts --modules router,views,locale --yes

# 干跑模式（预览文件，不写入）
npx @kit/override-cli --project sysu --dry-run

# 强制覆盖已有文件
npx @kit/override-cli --project sysu --force
```

> 须在包含 `package.json` 的项目根目录执行。

---

## CLI 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --project <code>` | 项目代码（如 `sysu`、`gzdx`） | 交互式输入 |
| `-l, --lang <ts\|js>` | 语言 | 交互式选择 |
| `-m, --modules <list>` | 定制模块（逗号分隔） | 交互式多选 |
| `-o, --output <dir>` | 输出目录 | `src/overrides` |
| `-y, --yes` | 跳过所有确认提示 | `false` |
| `--dry-run` | 仅预览，不写入文件 | `false` |
| `--force` | 强制覆盖已有文件 | `false` |

---

## 可选模块

| 模块 | 维度 | 说明 |
|------|------|------|
| `constants` *(必选)* | 静态 | 常量覆盖（角色、菜单、API 码等） |
| `router` *(必选)* | 静态 | 路由覆盖（替换、新增、禁用） |
| `views` *(必选)* | — | 自定义页面组件目录 |
| `api` | 运行时 | API 配置覆盖（实例注册/替换） |
| `components` | 运行时 | 组件覆盖（预埋组件替换） |
| `directives` | 运行时 | 指令覆盖（新增/替换全局指令） |
| `layout` | 运行时 | 布局覆盖（整体/区域替换） |
| `locale` | 运行时 | 国际化覆盖（文案覆盖/新增） |
| `store` | 运行时 | 状态覆盖（Pinia action 包装） |

`constants`、`router`、`views` 为必选模块，即使未指定也会自动生成。

---

## 生成的文件结构

以 `--project sysu --lang ts --modules router,views,locale` 为例，输出到 `src/overrides/`：

```
src/overrides/
├── types.ts          # 公共类型定义
├── index.ts          # 统一导出（根据已有项目动态聚合）
├── registry.ts       # 项目代码 → NID 映射表
└── sysu/
    ├── index.ts      # 项目聚合入口（动态 import 各模块）
    ├── router/
    │   └── index.ts  # 路由覆盖逻辑
    ├── views/        # 自定义页面组件目录
    └── locale/
        └── index.ts  # 国际化覆盖逻辑
```

生成完成后需要：
1. 在 `registry.ts` 中添加学校 NID 映射
2. 在各模块的 `index.ts` 中实现定制逻辑

---

## 接入方式

生成文件后，需手动在项目中接入 Override 系统。

### 必接入（所有项目）

#### main.ts — 初始化运行时覆盖

运行时维度（`components` / `store` / `locale` / `api` / `layout` / `directives`）统一在此初始化：

```ts
import { initOverrides } from '@/utils/override';
import overrideConfig from '@/overrides';
// 如有 api 模块，额外导入 instances
// import { instances } from '@/api/core/request';

initOverrides({ pinia, i18n, config: overrideConfig, app });
// 如有 api 模块：
// initOverrides({ pinia, i18n, config: overrideConfig, app, apiInstances: instances });
```

#### router/index.ts — 路由覆盖（`router` 模块，在 createRouter 之前同步执行）

```ts
import { routerManager } from '@/utils/override';
import { customRoutes } from '@/overrides';

routerManager.register(customRoutes);

const router = createRouter({
  routes: [...routerManager.applyOverrides(staticRoutes)],
});

routerManager.addCustomRoutes(router);
```

#### constants/index.ts — 常量覆盖（`constants` 模块）

```ts
import { mergeConstants } from '@/utils/override';
import { customConstants } from '@/overrides';

// 对象字段 → 浅合并；数组/原始值字段 → 整体替换
export const ROLES = mergeConstants(DEFAULT_ROLES, customConstants.roles ?? {});
export const MENU_LIST = customConstants.menuList ?? DEFAULT_MENU_LIST;
export const DEFAULT_LOCALE = customConstants.defaultLocale ?? 'zh-CN';
```

### 按需接入

#### components 模块 — 消费预埋组件

在需要替换的位置使用 `componentManager.getComponent`，未注册时自动回退到默认组件：

```ts
import { componentManager } from '@/utils/override';
import DefaultWelcomeCard from './WelcomeCard.vue';

// 优先使用定制组件，否则使用默认组件
const WelcomeCard = componentManager.getComponent('WelcomeCard', DefaultWelcomeCard);
```

#### layout 模块 — 消费 Layout 覆盖

在 Layout 组件中使用 `layoutManager` 获取覆盖后的组件：

```ts
import { layoutManager } from '@/utils/override';
import DefaultLayout from './DefaultLayout.vue';
import DefaultHeader from './Header.vue';

const LayoutComponent = layoutManager.getLayoutComponent(DefaultLayout);
const HeaderComponent = layoutManager.getSlotComponent('header', DefaultHeader);
const extraConfig = layoutManager.getDefaultConfig(); // 覆盖默认配置值
```

#### views 模块 — 自定义页面组件

`views/` 目录在 `router` 模块中通过 lazy import 引用，无需额外接入：

```ts
// overrides/sysu/router/index.ts
export function getCustomRoutes(): CustomRouteConfig {
  return {
    overrideRoutes: {
      '/home': () => import('../views/CustomHome.vue'),
    },
    customRoutes: [{
      path: '/sysu-lab',
      component: () => import('@/layout/index.vue'),
      children: [{ path: '', component: () => import('../views/LabManagement.vue') }],
    }],
  };
}
```

#### api 模块 — API 实例覆盖

通过 `initOverrides` 的 `apiInstances` 参数接入，将覆盖的实例合并到 `instances` 对象：

```ts
// main.ts
import { instances } from '@/api/core/request';

initOverrides({ pinia, i18n, config: overrideConfig, app, apiInstances: instances });
```

```ts
// overrides/sysu/api/index.ts
export function getCustomApiConfig(): CustomApiConfig {
  return {
    instances: {
      external: PolymasApi.create({ baseURL: 'https://sysu-api.example.com' }),
    },
  };
}
```

#### locale / store / directives 模块

这三个模块无需额外接入，由 `initOverrides` 自动处理：

| 模块 | 处理方式 |
|------|---------|
| `locale` | 调用 `i18n.global.mergeLocaleMessage` 合并语言包 |
| `store` | 注册 Pinia 插件，包装指定 store 的 action |
| `directives` | 调用 `app.directive` 注册/覆盖全局指令 |

---

## 编程 API

```typescript
import { generateFiles } from '@kit/override-cli';

const files = generateFiles({
  project: 'sysu',
  lang: 'ts',
  modules: ['constants', 'router', 'views', 'locale'],
  output: 'src/overrides',
  yes: true,
  dryRun: false,
  force: false,
});

// files: Array<{ path: string; content: string }>
for (const file of files) {
  console.log(file.path, file.content);
}
```

### GenerateOptions

| 字段 | 类型 | 必须 | 默认值 | 说明 |
|------|------|:----:|--------|------|
| `project` | `string` | ✅ | - | 项目代码（输出子目录名） |
| `lang` | `'ts' \| 'js'` | ✅ | - | 语言 |
| `modules` | `ModuleId[]` | ✅ | - | 选中的模块列表 |
| `output` | `string` | ✅ | `'src/overrides'` | 输出根目录（相对路径） |
| `yes` | `boolean` | ✅ | `false` | 跳过确认 |
| `dryRun` | `boolean` | ✅ | `false` | 干跑模式 |
| `force` | `boolean` | ✅ | `false` | 强制覆盖 |

---

## 架构

```
kit/override-cli/
├── __test__/           # 单元测试
├── src/
│   ├── cli.ts          # CLI 入口 (Commander)
│   ├── index.ts        # 编程 API 导出
│   ├── types.ts        # 类型定义 & 模块常量
│   ├── generator.ts    # 核心文件生成逻辑（Eta 模板渲染）
│   ├── conflict.ts     # 冲突检测 & 文件写入
│   ├── detector.ts     # 项目根目录检测
│   └── prompts.ts      # 交互式向导（prompts）
├── templates/
│   ├── ts/             # TypeScript 模板（.eta 文件）
│   └── js/             # JavaScript 模板（.eta 文件）
```

---

## 开发

```bash
# 开发模式（交互式）
pnpm dev

# 开发模式（非交互 + 干跑）
pnpm dev --project sysu --yes --dry-run

# 构建
pnpm build

# 单元测试
pnpm test

# 代码检查
pnpm lint
```
