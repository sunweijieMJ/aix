# @kit/typescript-config

内部共享的 TypeScript 配置包，为项目提供统一的 TypeScript 编译选项和类型检查规则。

## 📦 安装

此包为内部包，通过 workspace 协议安装：

```json
{
  "devDependencies": {
    "@kit/typescript-config": "workspace:*"
  }
}
```

## 🚀 使用

### 基础配置 (base.json)

适用于库和包开发，包含严格的类型检查和声明文件生成配置。

在项目根目录的 `tsconfig.json` 中扩展：

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
- ✅ `strict`: 启用所有严格类型检查选项
- ✅ `noUnusedLocals`: 检查未使用的局部变量
- ✅ `noUnusedParameters`: 检查未使用的函数参数
- ✅ `noFallthroughCasesInSwitch`: 防止 switch 语句贯穿
- ✅ `noUncheckedIndexedAccess`: 索引访问返回 undefined 类型

**模块系统**
- `module`: ESNext (支持最新的 ES 模块特性)
- `moduleResolution`: Node (Node.js 模块解析)
- `moduleDetection`: force (强制模块检测)
- `resolveJsonModule`: 支持导入 JSON 文件
- `verbatimModuleSyntax`: 精确的模块语法
- `isolatedModules`: 每个文件作为独立模块

**声明文件生成**
- `declaration`: 生成 .d.ts 声明文件
- `declarationMap`: 生成声明文件映射
- `sourceMap`: 生成源码映射文件
- `inlineSources`: 将源码内联到 source map
- `composite`: 启用项目引用支持

**目标和库**
- `target`: ES2015 (兼容现代浏览器)
- `lib`: ES2023, DOM, DOM.Iterable, WebWorker
- `jsx`: preserve (保留 JSX 语法，由后续工具处理)

**其他特性**
- `experimentalDecorators`: 支持装饰器语法
- `removeComments`: 移除注释以减小产物体积
- `skipLibCheck`: 跳过库文件类型检查以提升性能

### base-app.json 差异

相比 base.json，应用配置做了以下调整：

- ❌ `sourceMap`: false (生产环境不需要 source map)
- ❌ `inlineSources`: false (减小构建产物体积)
- ❌ `composite`: false (应用不需要项目引用)

## 📋 最佳实践

### 1. 库开发使用 base.json

```bash
# 组件库、工具库等可复用包
packages/
  └── my-component/
      ├── tsconfig.json  # extends base.json
      └── src/
```

### 2. 应用开发使用 base-app.json

```bash
# Web 应用、CLI 工具等最终产物
apps/
  └── my-app/
      ├── tsconfig.json  # extends base-app.json
      └── src/
```

### 3. 覆盖特定选项

根据项目需求覆盖特定配置：

```json
{
  "extends": "@kit/typescript-config/base.json",
  "compilerOptions": {
    "target": "ES2020",           // 覆盖目标版本
    "lib": ["ES2020", "DOM"],     // 自定义库
    "paths": {                     // 添加路径映射
      "@/*": ["./src/*"]
    }
  }
}
```

## 📄 License

MIT
