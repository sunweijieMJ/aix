# templates-override/

`create-app override add` 的模板集（Eta），渲染后写进目标项目：

| 目录                               | 渲染到                                | 说明                                             |
| ---------------------------------- | ------------------------------------- | ------------------------------------------------ |
| `overrides/*.ts.eta`               | `<output>/*.ts`                       | 覆盖层基础设施（types / index / registry / deployment） |
| `overrides/project-index.ts.eta`   | `<output>/<code>/index.ts`            | 单个租户的聚合入口，按选中模块动态 import        |
| `overrides/<module>/index.ts.eta`  | `<output>/<code>/<module>/index.ts`   | 各模块的定制骨架                                 |
| `plugins/override/*.ts.eta`        | `src/plugins/override/*.ts`           | 覆盖层内核，仅在目标项目缺失时补齐               |

## 与模板真源的关系

内核（`src/plugins/override/`）与基础设施（`src/overrides/`）的**主版本在模板真源**
（`vue-admin-template` 的 `overrides` 特性）。生成项目时勾上该特性就已经带全，`override add`
只补齐缺失的文件 —— 所以本目录这份拷贝的唯一消费者是**尚未拥有内核的项目**。

因此本目录必须**自包含**：除了 `@/plugins/override`（同批生成的），不得出现任何
`@/xxx` 语句级 import。这条约束由 `__test__/override-add.test.ts` 的自包含用例守着。

### 有意分叉的三个文件（不要照真源盲拷）

真源为紧耦合与精确类型做了优化，照抄过来会产出悬空 import：

| 文件                                   | 真源的做法                                                                                                                  | 本目录保留的做法                                       |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `plugins/override/index.ts`            | 直接 `import { instances } from '@/api/core/request'`，`initOverrides` 不再收 `apiInstances`；`menuList` 用 `@/constants/menu` 的 `MenuItem` | `apiInstances` 作为参数传入；`menuList?: unknown[]`    |
| `plugins/override/override-layout.ts`  | `defaultConfig` 用 `@/layout/useLayoutContext` 的 `LayoutVisible` / `HeaderVisible` / `LogoConfig`                           | 泛型 `Record<string, Record<string, unknown>>`         |
| `overrides/registry.ts`                | cookie key 统一走 `@/utils/auth` 的 `getUserInfoCookieRaw()`                                                                 | 内联 cookie 解析                                       |

`overrides/types.ts.eta` 反过来**比真源好**：它用 `<%= it.project %>` 参数化了 JSDoc 示例里的
目录名，真源写死了 `sysu`。同步时别倒着覆盖。

其余文件（`override-router` / `override-store` / `override-component` / `override-api` /
`override-constants` / `override-directives`、`overrides/index` / `overrides/deployment`）
与真源保持一致，真源有改动时直接整文件拷过来即可。

## 注意

- Eta 4 **不支持** `<%# … %>` 注释标签（会被当 JS 编译，报 `Bad template syntax`），
  维护者说明写在本文件里，别写进 `.eta` —— `.eta` 里的 JS 注释会原样渲染进用户项目。
- `plugins/override/*.ts.eta` 用空上下文渲染（`eta.render(file, {})`），不要在其中使用 `it.*`。
