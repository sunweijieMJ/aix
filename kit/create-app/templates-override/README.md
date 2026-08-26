# templates-override/

`create-app override add` 的模板集（Eta），渲染后写进目标项目：

| 模板                              | 渲染到                              | 说明                                  |
| --------------------------------- | ----------------------------------- | ------------------------------------- |
| `overrides/project-index.ts.eta`  | `<output>/<code>/index.ts`          | 单个租户的聚合入口，按选中模块动态 import |
| `overrides/<module>/index.ts.eta` | `<output>/<code>/<module>/index.ts` | 各模块的定制骨架（返回空配置，待填）  |

**这里只有「按租户」的那部分。** 覆盖层内核（`src/plugins/override/`）与基础设施
（`<output>/types.ts`、`index.ts`、`registry.ts`、`deployment.ts`）由**模板真源**提供
——admin 模板的 `overrides` 特性。`override add` 在生成前会检查它们是否存在，
缺了直接报 `E_MISSING_OVERRIDE_KERNEL` 并说明去哪儿拿。

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

所以收口成单一真源：**内核只在模板真源里维护**，本包不再持有拷贝。

## 注意

- Eta 4 **不支持** `<%# … %>` 注释标签（会被当 JS 编译，报 `Bad template syntax`）；
  而 `.eta` 里的 JS 注释会**原样渲染进用户项目**。维护者说明写在本文件里，别写进 `.eta`。
- 骨架里的 `@/` import 只允许 `@/plugins/override`（内核，由模板提供）与相对路径 `../types`。
  出现别的 `@/xxx` 就会在用户项目里变成死 import ——
  这条由 `__test__/override-add.test.ts` 的自包含用例守着。
