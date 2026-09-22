# templates-override/

`create-app override add` 的模板集（Eta），渲染后写进目标项目：

| 模板                              | 渲染到                              | 说明                                  |
| --------------------------------- | ----------------------------------- | ------------------------------------- |
| `overrides/project-index.ts.eta`  | `<output>/<code>/index.ts`          | 单个租户的聚合入口（运行时维度 + router），按选中模块动态 import |
| `overrides/constants/index.ts.eta` | `<output>/<code>/constants.ts`     | 常量覆盖单文件，由基础设施的 `constants.ts` 单独 glob，不进聚合入口 |
| `overrides/<module>/index.ts.eta` | `<output>/<code>/<module>/index.ts` | 其余模块的定制骨架（返回空配置，待填）  |

模块渲染到哪里由 `src/override/types.ts` 的 `MODULE_REGISTRY[id].file` 决定，缺省为 `<id>/index.ts`。

**模板按平台分支。** admin（Web 后台）与 h5（移动端）两个真源的 Override 形态不同：布局插槽
（header / menu / main vs navbar / main / tabbar）、API 维度（`modules` vs `interceptors`）、路由字段
（h5 无 `whiteList`）、入口标题（h5 并入常量 `appTitle`）、locale key 风格（h5 为 flat `__`）。
`override add` 的平台由用户通过 `-p, --platform` 或问答指定，传进 eta 上下文的 `it.platform`，各模板据此切换
注释与示例；骨架的**代码**部分两边一致（返回空配置）。h5 没有 locale 维度（`MODULE_REGISTRY.locale.platforms = ['web']`），
移动端项目选不到它。

**这里只有「按租户」的那部分。** 覆盖层内核（`src/plugins/override/`）与基础设施
（`<output>/index.ts`、`constants.ts`、`registry.ts`、`deployment.ts`，h5 另有 `identity.ts`）由**模板真源**提供
——admin / h5 模板的 `overrides` 特性。`override add` 在生成前检查其中骨架装载依赖的那几个
（内核 + `index.ts` / `constants.ts` / `registry.ts`，mobile 再加 `identity.ts`），缺了直接报 `E_MISSING_OVERRIDE_KERNEL`
并说明去哪儿拿；`deployment.ts` 只被 `constants.ts` 自己 import，骨架不依赖，不在检查内。

## 为什么内核不放在这里

本目录曾经带着一份内核与基础设施的拷贝，用来给「还没有内核的项目」兜底。那份拷贝是
**必然漂移的第二真源**：

- 模板真源为紧耦合与精确类型优化 —— 直接 `import { instances } from '@/api/core/request'`
  （于是 `initOverrides` 不再收 `apiInstances` 参数）、`menuList` 用 `@/constants/menu` 的
  `MenuItem`、`defaultConfig` 用 `@/layout/useLayoutContext` 的精确类型、cookie key 统一走
  `@/utils/auth`；
- 兜底拷贝必须**自包含**（它的消费者恰恰是没有那些文件的项目），只能保留泛型签名。

两个目标互斥，于是两边逻辑越走越远：`override-store` 差过 33 行，`initOverrides` 的签名都
不一样。而「兜底」这个场景本身是空的 —— 真正在用 override 体系的项目都是从 admin 模板带
`overrides` 特性生成的，内核本来就有，`override add -y` 只会跳过那些文件。

所以收口成单一真源：**内核只在模板真源里维护**，本包不再持有拷贝。h5 真源的内核是按移动端形态另写的一份（同名文件、同一套 manager 接口），不与 admin 逐字节同步。

## 注意

- Eta 4 **不支持** `<%# … %>` 注释标签（会被当 JS 编译，报 `Bad template syntax`）；
  而 `.eta` 里的 JS 注释会**原样渲染进用户项目**。维护者说明写在本文件里，别写进 `.eta`。
- 骨架里的 `@/` import 只允许 `@/plugins/override` 及其叶子模块（内核，由模板提供）。
  出现别的 `@/xxx` 就会在用户项目里变成死 import ——
  这条由 `__test__/override-add.test.ts` 的自包含用例守着。
- `constants/index.ts.eta` 渲染出的文件处在 `@/constants` 的同步加载链上：类型只能从叶子
  `@/plugins/override/override-constants` 取，不得 import `@/constants`、`@/overrides` 或内核 barrel，
  否则目标项目启动即因循环依赖崩溃（模板侧 eslint 的 `constantsChain` 规则会报错）。
