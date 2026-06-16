# @kit/typescript-config

内部共享的 TypeScript 配置包，为项目提供统一的 TypeScript 编译选项和类型检查规则。

> 文档以下列三个配置源文件为准：`base.json`、`base-library.json`、`base-app.json`。如有疑义，**以实际 JSON 为准**。

## 特性

- **严格模式全开** - strict + noUnusedLocals/Parameters + noUncheckedIndexedAccess
- **三层预设** - `base`（类型检查基座）/ `base-library`（库构建，含声明产物）/ `base-app`（应用）
- **Bundler 模块解析** - 默认 ESNext 模块 + `moduleResolution: bundler`（开发期检查提速，node16 兼容性由构建管线统一处理）
- **关注点分离** - 声明文件生成等 emit 选项集中在 `base-library.json`，`base.json` 本身 **不 emit**

## 配置分层

```
base.json                 # 基座：strict + 模块/目标/库，不生成任何产物（适合 noEmit 类型检查）
├── base-library.json     # extends base：补回 declaration/composite/sourceMap 等 emit 选项（库构建用）
└── base-app.json         # extends base：显式关闭声明/sourceMap/composite（应用用）
```

实际接入约定：

| 场景 | extends | 说明 |
|------|---------|------|
| 组件库 / 工具库（packages/\*） | `base-library.json` | 类型检查用包内 `tsconfig.json` 覆写为 noEmit；构建用 `tsconfig.build.json` 保留 emit |
| 应用（apps/\*） | `base-app.json` | 不产出声明文件 |
| 纯 TS 工具包（如 theme） | `base.json` | 无需 base-library 的 emit 默认值，构建配置自行开启 declaration |

## 使用

```jsonc
// packages/<name>/tsconfig.json （库开发，类型检查）
{
  "extends": "@kit/typescript-config/base-library.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "declarationMap": false,
    "emitDeclarationOnly": false
  },
  "include": ["src/**/*"]
}
```

```jsonc
// apps/<name>/tsconfig.json （应用开发）
{
  "extends": "@kit/typescript-config/base-app.json",
  "compilerOptions": { "outDir": "./dist" },
  "include": ["src/**/*"]
}
```

## 配置说明

### base.json

**严格模式**

| 选项 | 值 | 说明 |
|------|------|------|
| `strict` | true | 启用所有严格类型检查选项 |
| `noUnusedLocals` | true | 检查未使用的局部变量 |
| `noUnusedParameters` | true | 检查未使用的函数参数 |
| `noFallthroughCasesInSwitch` | true | 防止 switch 语句贯穿 |
| `noUncheckedIndexedAccess` | true | 索引访问返回 `T \| undefined` |

**模块系统**

| 选项 | 值 | 说明 |
|------|------|------|
| `module` | ESNext | 支持最新的 ES 模块特性 |
| `moduleResolution` | bundler | 打包器风格解析（开发期检查；node16 兼容性由 rollup dts 阶段处理） |
| `moduleDetection` | force | 强制按模块解析每个文件 |
| `resolveJsonModule` | true | 支持导入 JSON 文件 |
| `verbatimModuleSyntax` | false | 不强制逐字模块语法 |
| `isolatedModules` | true | 每个文件可独立转译 |
| `esModuleInterop` | true | 兼容 CJS 默认导入互操作 |

**目标和库**

| 选项 | 值 | 说明 |
|------|------|------|
| `target` | ES2015 | 编译目标 |
| `lib` | ES2023, DOM, DOM.Iterable, WebWorker | 类型定义库 |
| `jsx` | preserve | 保留 JSX，由后续工具处理 |

**其他**

| 选项 | 值 | 说明 |
|------|------|------|
| `experimentalDecorators` | true | 支持装饰器语法 |
| `forceConsistentCasingInFileNames` | true | 强制文件名大小写一致 |
| `skipLibCheck` | true | 跳过库文件类型检查以提升性能 |
| `noErrorTruncation` | true | 不截断错误信息 |
| `preserveWatchOutput` | true | watch 模式保留历史输出 |

> 注意：`base.json` **不包含** `declaration` / `declarationMap` / `sourceMap` / `composite` / `removeComments` —— 这些 emit 相关选项在 `base-library.json` 中。

### base-library.json（extends base.json）

在 base 之上补回库构建所需的 emit 选项：

| 选项 | 值 | 说明 |
|------|------|------|
| `declaration` | true | 生成 `.d.ts` 声明文件 |
| `declarationMap` | false | 不生成声明 map |
| `emitDeclarationOnly` | true | 仅生成声明（JS 由 rollup 产出） |
| `sourceMap` | true | 生成源码映射 |
| `inlineSources` | true | 源码内联到 source map |
| `composite` | true | 启用项目引用能力 |
| `removeComments` | false | 保留注释 |

### base-app.json（extends base.json）

面向应用，显式关闭声明与项目引用：

| 选项 | base-library | base-app | 原因 |
|------|--------------|----------|------|
| `declaration` | true | false | 应用不产出声明文件 |
| `sourceMap` | true | false | 生产环境不需要 source map |
| `inlineSources` | true | false | 减小构建产物体积 |
| `composite` | true | false | 应用不需要项目引用 |

## 配置对比

| 特性 | base | base-library | base-app |
|------|------|--------------|----------|
| 严格类型检查 | ✅ | ✅（继承） | ✅（继承） |
| 声明文件生成 | ❌ | ✅ | ❌ |
| Source Map | ❌ | ✅ | ❌ |
| 项目引用 (composite) | ❌ | ✅ | ❌ |
| 适用场景 | 类型检查基座 / 纯 TS 包 | 组件库 / 工具库 | 应用程序 |
