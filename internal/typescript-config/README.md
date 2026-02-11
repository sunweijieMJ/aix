# @kit/typescript-config

内部共享的 TypeScript 配置包，为项目提供统一的 TypeScript 编译选项和类型检查规则。

## 📦 安装

```json
{
  "devDependencies": {
    "@kit/typescript-config": "^1.0.0"
  }
}
```

## 🚀 使用

### 基础配置 (base.json)

适用于库和包开发，包含严格的类型检查和声明文件生成配置。

```json
{
  "extends": "@kit/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 应用配置 (base-app.json)

适用于应用程序开发，移除了库相关的编译选项。

```json
{
  "extends": "@kit/typescript-config/base-app.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

## ⚙️ 配置说明

### base.json 特性

**严格模式**

| 选项 | 值 | 说明 |
|------|------|------|
| `strict` | true | 启用所有严格类型检查选项 |
| `noUnusedLocals` | true | 检查未使用的局部变量 |
| `noUnusedParameters` | true | 检查未使用的函数参数 |
| `noFallthroughCasesInSwitch` | true | 防止 switch 语句贯穿 |
| `noUncheckedIndexedAccess` | true | 索引访问返回 undefined 类型 |

**模块系统**

| 选项 | 值 | 说明 |
|------|------|------|
| `module` | ESNext | 支持最新的 ES 模块特性 |
| `moduleResolution` | Node | Node.js 模块解析 |
| `moduleDetection` | force | 强制模块检测 |
| `resolveJsonModule` | true | 支持导入 JSON 文件 |
| `verbatimModuleSyntax` | true | 精确的模块语法 |
| `isolatedModules` | true | 每个文件作为独立模块 |

**声明文件生成**

| 选项 | 值 | 说明 |
|------|------|------|
| `declaration` | true | 生成 .d.ts 声明文件 |
| `declarationMap` | true | 生成声明文件映射 |
| `sourceMap` | true | 生成源码映射文件 |
| `inlineSources` | true | 将源码内联到 source map |
| `composite` | true | 启用项目引用支持 |

**目标和库**

| 选项 | 值 | 说明 |
|------|------|------|
| `target` | ES2015 | 兼容现代浏览器 |
| `lib` | ES2023, DOM, DOM.Iterable, WebWorker | 类型定义库 |
| `jsx` | preserve | 保留 JSX 语法，由后续工具处理 |

**其他特性**

| 选项 | 值 | 说明 |
|------|------|------|
| `experimentalDecorators` | true | 支持装饰器语法 |
| `removeComments` | true | 移除注释以减小产物体积 |
| `skipLibCheck` | true | 跳过库文件类型检查以提升性能 |

### base-app.json 差异

| 选项 | base.json | base-app.json | 原因 |
|------|-----------|---------------|------|
| `sourceMap` | true | false | 生产环境不需要 source map |
| `inlineSources` | true | false | 减小构建产物体积 |
| `composite` | true | false | 应用不需要项目引用 |

## 🎯 使用场景

### 1. 组件库开发（使用 base.json）

```
packages/
  └── my-component/
      ├── tsconfig.json  # extends base.json
      └── src/
```

### 2. 应用开发（使用 base-app.json）

```
apps/
  └── my-app/
      ├── tsconfig.json  # extends base-app.json
      └── src/
```

### 3. 自定义扩展

```json
{
  "extends": "@kit/typescript-config/base.json",
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM"],
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## 🔧 开发工具集成

### VS Code

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

### package.json 脚本

```json
{
  "scripts": {
    "type-check": "tsc --noEmit",
    "type-check:watch": "tsc --noEmit --watch"
  }
}
```

## 🆚 配置对比

| 特性 | base | base-app |
|------|------|----------|
| 严格类型检查 | ✅ | ✅ |
| 声明文件生成 | ✅ | ✅ |
| Source Map | ✅ | ❌ |
| 项目引用 (composite) | ✅ | ❌ |
| 适用场景 | 组件库/工具库 | 应用程序 |
