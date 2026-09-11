---
name: package-creator
description: Use ONLY when creating a brand-new **package** (top-level packages/<name>/ directory with its own package.json/tsconfig/rollup.config.js) in the AIX monorepo. Trigger phrases - "新建一个 XX 组件包"、"创建一个新包"、"scaffold a new package". DO NOT use for adding a component inside an existing package — use component-generator for that. Wraps the repo's real scaffold script `pnpm gen`; do not hand-write package files.
license: MIT
compatibility: Requires Vue 3, TypeScript
metadata:
  author: aix
  version: "2.0.0"
  category: scaffold
---

# 包创建器 Skill

## 核心原则：不要手写脚手架文件

本仓有真实的生成器 **`pnpm gen`**（`scripts/gen/`，20 个 `.eta` 模板）。
它是新建包的**单一事实来源**。

> ❌ 不要用 Write 工具逐个创建 `package.json` / `tsconfig.json` / `rollup.config.js`。
> 手写的副本一定会和 `scripts/gen/templates/` 漂移——本 Skill 的上一版就是这么烂掉的
> （模板写 `version: 0.0.0`，文档抄成了 `0.0.1`）。
>
> ✅ 调用 `pnpm gen`，然后基于产物做增量修改。

---

## 执行流程

### 步骤 1: 确认包名（kebab-case，硬性校验）

`scripts/gen/validators.ts` 强制 `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`：

| 输入 | 结果 |
|------|------|
| `select` | ✅ → `packages/select/`，组件 `Select.vue` |
| `date-picker` | ✅ → `packages/date-picker/`，组件 `DatePicker.vue` |
| `Select` / `DatePicker` | ❌ 被拒：「组件名称必须是 kebab-case 格式」 |
| `src` / `lib` / `es` / `dist` / `test` / `tests` / `node_modules` | ❌ 保留名称 |
| 已存在的包名 | ❌ 提前报错，不会覆盖 |

用户如果给的是 PascalCase（"创建一个 DatePicker 包"），**先转成 kebab-case 再传给 `pnpm gen`**，
不要原样透传。

### 步骤 2: 先 dry-run

```bash
pnpm gen <kebab-name> -d "<描述>" --dry-run -y
```

`--dry-run` 在任何写盘动作之前就 return（见 `generator.ts`），安全。
把文件清单给用户确认后再实际执行。

### 步骤 3: 执行生成

```bash
pnpm gen <kebab-name> -d "<描述>"          # 交互式，逐项确认
pnpm gen <kebab-name> -d "<描述>" -y       # 快速模式，用默认配置
```

**CLI 选项**（以 `pnpm gen --help` 为准）：

| 选项 | 作用 | 默认 |
|------|------|------|
| `-d, --description <desc>` | 包描述，写进 package.json | 交互式询问 |
| `--deps <a,b>` | 依赖包，逗号分隔 | `@aix/theme,@aix/hooks` |
| `--i18n` | 生成 `src/locale/`（zh-CN / en-US / types） | 关 |
| `--no-scss` | 不生成独立 `src/index.scss` | 生成 |
| `--no-composables` | 不生成 `use<Pascal>.ts` | 生成 |
| `--dry-run` | 只列文件，不写盘 | — |
| `-y, --yes` | 跳过所有确认 | — |

> 组件有任何面向用户的文案时**务必加 `--i18n`**。事后补 locale 比一开始就带上贵得多。

### 步骤 4: 产物清单

`pnpm gen <name> --i18n -y` 实测生成 **19 个文件**（不带 `--i18n` 则 15 个）：

```
packages/<name>/
├── src/
│   ├── <Pascal>.vue          # 组件主文件（注意：不是 index.vue）
│   ├── index.ts              # 导出入口（具名导出 + default install 插件）
│   ├── types.ts              # Props/Emits 接口，带 @default JSDoc
│   ├── use<Pascal>.ts        # composable（--no-composables 可关）
│   ├── index.scss            # 组件样式（--no-scss 可关）
│   └── locale/               # 仅 --i18n：index.ts / types.ts / zh-CN.ts / en-US.ts
├── __test__/<Pascal>.test.ts
├── stories/<Pascal>.stories.ts
├── package.json
├── tsconfig.json             # noEmit 检查配置，include stories/ 与 __test__/
├── tsconfig.build.json       # 声明产出，只 include src/
├── rollup.config.js
├── vitest.config.ts          # 必需：根 vitest projects 按此文件发现包
├── eslint.config.ts
├── stylelint.config.ts
└── README.md
```

### 步骤 5: 收尾（`pnpm gen` 不做的事）

```bash
pnpm install                    # 让 workspace 识别新包并链接依赖
pnpm build:filter @aix/<name>   # 注意是 build:filter，不是 build --filter
pnpm lint:publish               # 发布形态体检（新包最容易在这里暴露问题）
```

还需要人工决定的：

- [ ] 该包是否要进 `docs/components/`（组件文档站）
- [ ] 首次发布前 `pnpm changeset`
- [ ] 若依赖了生成时没勾的包，用 `pnpm add @aix/<dep> --filter @aix/<name>`

---

## 改模板前必读：package.json 关键字段为什么长这样

以下约束**已编码在 `scripts/gen/templates/package.json.eta` 里**，改模板或手工调整新包的
package.json 时别踩：

- **双格式输出**：`main` → `lib/`（CJS），`module` → `es/`（ESM），与 `rollup.config.js` 一致
- **`types`** 指向 `es/` 下由 `vue-tsc` 生成的 `.d.ts`
- **`sideEffects`** 必须列出样式文件，否则 Tree-shaking 会错误移除
- **`exports` 只暴露主入口与 `./style`**，不要加 `./es/*` / `./lib/*` 通配。
  通配会把 `vue-tsc` 逐模块产出的 `.d.ts` 一并暴露，它们带无扩展名相对引用，
  在 `moduleResolution: node16` 下报 TS2834；且 attw 对通配 entrypoint 整段跳过，
  发布门禁看不见这类破损
- **`exports` 必须用嵌套双包形式**：`import.types` → `es/index.d.ts`，
  `require.types` → `lib/index.d.cts`。写成扁平的 `{types, import, require}` 会让 CJS
  消费方拿到 ESM 的 `.d.ts`（masquerading）
- **`./style` 必须带 `types` 条件**指向 `es/style.d.ts`（构建期由 `emitStyleDts` 生成），
  否则消费方开启 `noUncheckedSideEffectImports` 时 `import '@aix/<name>/style'` 无法解析
- **build 顺序必须是 `build:types` → `build:js`**：`build:js` 的 dts bundle 段依赖
  `es/*.d.ts` 已存在，顺序颠倒会导致类型产物缺失
- **不要加 `publishConfig`**：registry 由仓库根 `.npmrc` 的 scoped 配置解析（私有仓库），
  `access` 对私有 registry 无意义

`tsconfig.json` 与 `tsconfig.build.json` 分开的原因：前者 `noEmit`，必须 include
`stories/` 与 `__test__/`，否则这两处代码不被 `type-check` 覆盖；后者只 include `src/`，
保证声明产物干净。

---

## 与 component-generator 的分工

| 场景 | 用哪个 |
|------|--------|
| 新建 `packages/<name>/` 顶层包 | **本 Skill**（→ `pnpm gen`）|
| 往已有包里加一个子组件 | [component-generator](../component-generator/SKILL.md) |

`pnpm gen` **只能创建新包**，不能往已有包里塞组件——包名已存在时它会直接报错退出。

---

## 相关文档

- `scripts/gen/` - 生成器实现与 `.eta` 模板（本 Skill 的事实来源）
- [project-structure.md](../../agents/project-structure.md) - Monorepo 结构
- [npm-publishing.md](../../agents/npm-publishing.md) - 发布流程与私有 registry
- `docs/guide/development-standards.md` - 全库开发规范
