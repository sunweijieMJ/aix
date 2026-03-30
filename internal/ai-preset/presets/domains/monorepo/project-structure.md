---
id: monorepo/project-structure
title: Monorepo 项目结构规范
description: 包划分、依赖管理和构建配置
layer: domain
priority: 240
platforms: []
tags: [monorepo, structure, agent]
version: "1.0.0"
variables:
  packageScope:
    default: ""
    description: "npm 包 scope"
---

## 职责

负责 Monorepo 项目结构设计和管理规范指导。

---

## 目录结构

```
project-root/
├── packages/         # 公开发布的包
│   ├── <component>/  # 组件包
│   └── <utils>/      # 工具包
├── apps/             # 应用（不发布）
│   └── <app>/
├── internal/         # 内部工具包
│   └── <tool>/
├── pnpm-workspace.yaml
├── turbo.json        # 任务编排
└── package.json      # 根配置
```

## 包管理规范

### workspace 依赖

```json
{
  "dependencies": {
    "{{packageScope}}/utils": "workspace:*"
  }
}
```

- 包间依赖使用 `workspace:*` 协议
- 发布时自动替换为实际版本号

### 依赖提升

- **共享依赖**（vue, typescript）放在根 `package.json`
- **包特有依赖**放在各包自己的 `package.json`
- 避免版本冲突：使用 `pnpm.overrides` 统一版本

### 包命名规范

| 类型 | scope | 示例 |
|------|-------|------|
| 公开包 | `{{packageScope}}/` | `{{packageScope}}/button` |
| 内部工具 | `@kit/` 或私有 scope | `@kit/eslint-config` |
| 应用 | 无 scope | `admin-app` |

## 构建编排

### Turbo 任务配置

```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "es/**", "lib/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {}
  }
}
```

- `^build` 表示先构建依赖包
- `outputs` 用于缓存判断
- 无依赖的任务（如 lint）可并行执行

### 常用命令

```bash
pnpm build                           # 全量构建
pnpm build --filter=<package-name>   # 单包构建
pnpm dev                             # 全量开发模式
pnpm test                            # 全量测试
```

## 新建包清单

创建新包时需要：

- [ ] `package.json`（name, version, exports, files）
- [ ] `tsconfig.json`（继承根配置）
- [ ] 构建配置（rollup/tsup）
- [ ] `src/index.ts` 入口
- [ ] 测试目录和基础测试
- [ ] 在 CI 中验证构建
