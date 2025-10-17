---
name: deployment
description: 组件库 npm 包发布、版本管理、CI/CD 自动化的完整指导
---

# 部署指导 Agent

专门负责组件库 npm 包的发布、版本管理和 CI/CD 自动化，为 AI 提供完整的包发布和版本管理解决方案指导。

> ⚠️ **重要区别**: 组件库的"部署"是指**发布 npm 包**，而不是部署 Web 应用。用户通过 `pnpm add @aix/button` 安装使用。

---

## 🎯 当前项目发布配置

### 核心工具链

| 工具 | 版本 | 用途 |
|------|------|------|
| **Changesets** | ^2.29.7 | 版本管理、CHANGELOG 生成 |
| **Rollup** | ^4.52.4 | 打包 ESM/CJS/UMD 产物 |
| **TypeScript** | 5.9.3 | 生成类型声明文件 |
| **Turbo** | ^2.5.8 | Monorepo 增量构建 |
| **changesets-gitlab** | ^0.13.4 | GitLab CI/CD 集成 |

### 包管理配置

**package.json 关键字段**:
```json
{
  "name": "@aix/button",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs.js",
  "module": "./dist/index.esm.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.esm.js",
      "require": "./dist/index.cjs.js",
      "types": "./dist/index.d.ts"
    },
    "./style.css": "./dist/style.css"
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

### 发布流程目录

```
.changeset/              # Changeset 配置目录
├── config.json         # Changesets 配置
├── pre.json           # 预发布模式状态（自动生成）
└── *.md               # 变更集文件（开发者创建）

packages/button/
├── dist/              # 构建产物（发布到 npm）
│   ├── index.cjs.js   # CommonJS 格式
│   ├── index.esm.js   # ESM 格式
│   ├── index.d.ts     # TypeScript 类型声明
│   └── style.css      # 样式文件
├── package.json       # 版本号在这里更新
└── CHANGELOG.md       # 自动生成的变更日志
```

---

## 📝 Changesets 工作流

### 什么是 Changesets

Changesets 是 Monorepo 版本管理工具，核心概念：

1. **Changeset（变更集）**: 描述一个包的变更类型（major/minor/patch）和说明的 Markdown 文件
2. **Version**: 根据 changeset 文件自动更新 package.json 版本号和生成 CHANGELOG
3. **Publish**: 发布所有版本号变更的包到 npm

### 基本工作流程

```bash
# 1. 开发功能后创建 changeset
pnpm changeset

# 2. 选择变更类型
? Which packages would you like to include? › @aix/button
? What kind of change is this for @aix/button? ›
  ❯ patch   # 1.0.0 → 1.0.1 (bug修复)
    minor   # 1.0.0 → 1.1.0 (新功能)
    major   # 1.0.0 → 2.0.0 (破坏性变更)

# 3. 编写变更说明
? Please enter a summary for this change (this will be in the changelogs).
  Add loading state support for button

# 生成 .changeset/random-id.md 文件
---
'@aix/button': minor
---

Add loading state support for button

# 4. 提交 changeset 文件
git add .changeset/random-id.md
git commit -m "chore: add changeset for button loading state"
git push

# 5. 更新版本号（本地或 CI/CD）
pnpm changeset version
# 效果：
# - 更新 packages/button/package.json 版本号
# - 生成/更新 packages/button/CHANGELOG.md
# - 删除 .changeset/random-id.md

# 6. 构建包
pnpm build

# 7. 发布到 npm（本地或 CI/CD）
pnpm changeset publish
# 效果：发布新版本到 npm，并打上 Git Tag
```

### Changeset 文件结构

创建的 `.changeset/cool-panda-123.md`:

```markdown
---
'@aix/button': minor
'@aix/icon': patch
---

Add loading state to button component and fix icon color issue
```

---

## 🔨 本地发布流程

### 准备工作

**1. 配置 npm 认证**:

```bash
# 编辑 .npmrc（项目根目录）
registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}

# 或配置私有源
registry=https://it-artifactory.yitu-inc.com/api/npm/npm/
//it-artifactory.yitu-inc.com/api/npm/npm/:_auth="${AUTH_TOKEN}"
email=${AUTH_EMAIL}
always-auth=true
```

**2. 获取 npm token**:

```bash
# 公共 npm
npm login
npm token create

# 或从 GitLab CI/CD 变量获取（用于私有源）
# $NPM_AUTH_TOKEN 和 $NPM_AUTH_EMAIL
```

### 完整发布步骤

**步骤 1: 创建 Changeset**

```bash
# 开发完成后运行
pnpm changeset

# 交互式选择包和变更类型
✔ Which packages would you like to include? · @aix/button
✔ What kind of change is this for @aix/button? · minor
✔ Please enter a summary for this change
  Add size prop with small/medium/large options
```

**步骤 2: 提交 Changeset**

```bash
git add .changeset/*.md
git commit -m "chore: add changeset for button size prop"
git push origin feature/button-size
```

**步骤 3: 合并到主分支**

```bash
# 创建 MR/PR，代码审查后合并
# 合并后 .changeset 文件进入主分支
```

**步骤 4: 更新版本号**

```bash
# 在主分支执行
pnpm changeset version

# 查看变更
git diff packages/button/package.json
git diff packages/button/CHANGELOG.md

# 提交版本更新
git add .
git commit -m "chore: version packages"
git push
```

**步骤 5: 构建包**

```bash
# 使用 Turbo 构建所有变更包
pnpm build

# 或只构建特定包
pnpm build:filter @aix/button

# 验证产物
ls -la packages/button/dist/
# 应包含: index.cjs.js, index.esm.js, index.d.ts, style.css
```

**步骤 6: 发布到 npm**

```bash
# 发布所有版本变更的包
pnpm changeset publish

# 输出示例：
# 🦋  info npm info @aix/button
# 🦋  info npm publish --access public
# + @aix/button@1.1.0

# 推送 Git Tags
git push --follow-tags
```

---

## 🚀 CI/CD 自动化发布

### GitLab CI/CD 流程

当前项目使用 `.gitlab-ci.yml` 实现自动化发布，包含 6 个阶段：

```yaml
stages:
  - install           # 安装依赖
  - deploy_storybook  # 部署 Storybook 文档
  - check_changeset   # MR 中注释 changeset 信息
  - update_version    # 更新版本号（手动触发）
  - build_package     # 构建包
  - publish_package   # 发布包（手动触发）
```

### 触发条件

| 阶段 | 触发条件 | 说明 |
|------|---------|------|
| `install` | 推送到 master/release/feature 分支 | 自动执行 |
| `deploy_storybook` | 推送到 master/release 分支 | 自动执行 |
| `check_changeset` | 创建 MR 时 | 自动在 MR 中添加变更预览 |
| `update_version` | master/release/feature 分支 | **手动触发** |
| `build_package` | 合并 changeset-release 分支后 | 自动执行 |
| `publish_package` | 合并 changeset-release 分支后 | **手动触发** |

### 使用流程

**场景 1: 正式版本发布（stable）**

```bash
# 1. 开发功能并创建 changeset
pnpm changeset
git add .changeset/*.md
git commit -m "chore: add changeset"
git push origin feature/new-feature

# 2. 创建 MR 到 master
# GitLab 会自动运行 check_changeset，在 MR 中显示版本变更预览

# 3. 合并 MR 到 master

# 4. 在 GitLab CI/CD Pipeline 中手动触发 update_version
# 作用：
# - 执行 pnpm changeset version
# - 创建 changeset-release/master 分支
# - 提交版本更新并推送

# 5. GitLab 自动创建从 changeset-release/master 到 master 的 MR

# 6. 审查版本号和 CHANGELOG，合并 MR
# 触发 build_package 自动构建

# 7. 在 GitLab CI/CD Pipeline 中手动触发 publish_package
# 作用：执行 pnpm changeset publish，发布到 npm
```

**场景 2: 预发布版本（alpha/beta）**

```bash
# 1. 创建预发布分支
git checkout -b release/v2.0.0-beta master

# 2. 开发并创建 changeset
pnpm changeset
git add .changeset/*.md
git commit -m "chore: add changeset for beta"
git push origin release/v2.0.0-beta

# 3. 在 GitLab 手动触发 update_version
# 由于分支名包含 "beta"，自动执行:
# pnpm changeset pre enter beta

# 4. 合并 changeset-release MR

# 5. 手动触发 publish_package
# 发布版本格式: 2.0.0-beta.0, 2.0.0-beta.1, ...

# 6. 退出预发布模式（发布正式版前）
git checkout master
# 在 GitLab 手动触发 update_version
# 由于分支名不包含 alpha/beta，自动执行:
# pnpm changeset pre exit
```

### CI/CD 环境变量

需在 GitLab Settings → CI/CD → Variables 中配置：

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `NPM_AUTH_TOKEN` | npm 认证 token（Base64 编码） | `dXNlcjpwYXNzd29yZA==` |
| `NPM_AUTH_EMAIL` | npm 账号邮箱 | `npm@example.com` |
| `GITLAB_ACCESS_TOKEN` | GitLab API token（用于创建 MR） | `glpat-xxxx` |

**生成 NPM_AUTH_TOKEN**:

```bash
# 方法 1: 使用 npm token
npm token create
# 复制 token，然后 Base64 编码：
echo -n "npm_xxxx" | base64

# 方法 2: 使用用户名密码（私有源）
echo -n "username:password" | base64
```

---

## 📊 版本管理策略

### 语义化版本规范

遵循 [Semantic Versioning 2.0.0](https://semver.org/):

```
版本格式: MAJOR.MINOR.PATCH

1.2.3 → 1.2.4   PATCH: 向后兼容的bug修复
1.2.3 → 1.3.0   MINOR: 向后兼容的新功能
1.2.3 → 2.0.0   MAJOR: 不兼容的API变更
```

### 变更类型选择指南

| 变更类型 | 选择场景 | 示例 |
|---------|---------|------|
| `patch` | 修复 bug，不影响 API | 修复按钮禁用状态样式 |
| `minor` | 新增功能，保持向后兼容 | 新增 `size` prop |
| `major` | 破坏性变更，不兼容旧版本 | 删除 `deprecated` prop，重命名 API |

**破坏性变更检查清单**:
- [ ] 删除或重命名 Props
- [ ] 删除或重命名 Events
- [ ] 删除或重命名 Slots
- [ ] 修改 Props 默认值导致行为改变
- [ ] 修改导出方式（如从默认导出改为命名导出）

### 预发布版本

支持 `alpha` 和 `beta` 标签：

```bash
# 进入预发布模式
pnpm changeset pre enter beta

# 创建 changeset
pnpm changeset
# 选择 minor

# 更新版本
pnpm changeset version
# 生成版本: 1.0.0 → 1.1.0-beta.0

# 再次创建 changeset 并更新
pnpm changeset
pnpm changeset version
# 生成版本: 1.1.0-beta.0 → 1.1.0-beta.1

# 退出预发布模式
pnpm changeset pre exit

# 下次 version 将生成正式版
pnpm changeset version
# 生成版本: 1.1.0-beta.1 → 1.1.0
```

**alpha vs beta**:
- `alpha`: 内部测试版本，可能不稳定
- `beta`: 公开测试版本，功能基本完成

**用户安装预发布版本**:

```bash
# 安装 beta 版本
pnpm add @aix/button@beta

# 安装特定预发布版本
pnpm add @aix/button@1.1.0-beta.1
```

---

## 🔍 发布前检查清单

### 代码质量检查

```bash
# 1. TypeScript 类型检查
pnpm type-check
# 预期：No errors found

# 2. ESLint 检查
pnpm lint
# 预期：所有文件通过检查

# 3. 单元测试
pnpm test
# 预期：所有测试通过

# 4. 构建测试
pnpm build
# 预期：dist/ 目录生成完整产物
```

### 包元数据检查

**检查 package.json**:

```json
{
  "name": "@aix/button",               // ✅ 正确的 scope
  "version": "1.1.0",                 // ✅ 版本号已更新
  "description": "Aix Button component", // ✅ 有描述
  "keywords": ["vue", "button", "component"], // ✅ 有关键词
  "license": "MIT",                   // ✅ 有许可证
  "repository": {                      // ✅ 有仓库地址
    "type": "git",
    "url": "https://gitlab.com/..."
  },
  "main": "./dist/index.cjs.js",      // ✅ CJS 入口
  "module": "./dist/index.esm.js",    // ✅ ESM 入口
  "types": "./dist/index.d.ts",       // ✅ 类型声明
  "exports": { ... },                 // ✅ 现代导出配置
  "files": ["dist", "README.md"],     // ✅ 明确发布文件
  "peerDependencies": {               // ✅ Vue 声明为 peer
    "vue": "^3.5.22"
  }
}
```

### README 完整性检查

参考 [component-development.md](./component-development.md#readme-文档模板)：

- [ ] 组件描述和预览图
- [ ] 安装说明
- [ ] 基础用法代码示例
- [ ] Props API 表格
- [ ] Events 说明
- [ ] Slots 说明
- [ ] 主题定制说明
- [ ] TypeScript 类型导出说明

### 构建产物检查

```bash
# 查看产物文件
ls -lh packages/button/dist/
# 应包含:
# - index.cjs.js     (CommonJS)
# - index.esm.js     (ES Module)
# - index.d.ts       (TypeScript 类型)
# - style.css        (样式文件)

# 检查类型声明完整性
cat packages/button/dist/index.d.ts
# 应导出: ButtonProps, ButtonEmits, Button 组件, install 方法

# 检查包大小
du -sh packages/button/dist/
# 预期: < 50KB (未压缩)
```

### Storybook 文档检查

```bash
# 启动 Storybook
pnpm preview

# 检查项：
# - [ ] 所有 Stories 正常渲染
# - [ ] Props 控制器工作正常
# - [ ] Autodocs 生成完整
# - [ ] 代码示例可复制
# - [ ] 无控制台错误
```

---

## ✅ 发布后验证

### npm 包验证

```bash
# 1. 检查包是否发布成功
npm view @aix/button

# 输出示例:
# @aix/button@1.1.0 | MIT | deps: 0 | versions: 5
# Aix Button component
# https://gitlab.com/...

# 2. 检查最新版本
npm view @aix/button version
# 1.1.0

# 3. 检查包文件列表
npm view @aix/button files
# [ 'dist', 'README.md' ]

# 4. 查看版本历史
npm view @aix/button versions
# [ '1.0.0', '1.0.1', '1.1.0-beta.0', '1.1.0-beta.1', '1.1.0' ]

# 5. 查看 dist-tags
npm view @aix/button dist-tags
# { latest: '1.1.0', beta: '1.1.0-beta.1' }
```

### 本地安装测试

```bash
# 创建测试项目
mkdir test-button && cd test-button
pnpm init

# 安装最新版本
pnpm add vue @aix/button

# 创建测试文件
cat > test.vue << 'EOF'
<script setup>
import { Button } from '@aix/button';
import '@aix/button/style.css';
</script>

<template>
  <Button type="primary" size="medium">Test Button</Button>
</template>
EOF

# 检查类型提示是否正常
npx vue-tsc --noEmit test.vue
```

### Git Tag 验证

```bash
# 查看远程 tags
git fetch --tags
git tag -l

# 应包含新发布的版本 tag
# @aix/button@1.1.0

# 查看 tag 详情
git show @aix/button@1.1.0
```

### Storybook 文档验证

```bash
# 访问 GitLab Pages（如果已配置）
# https://your-project.gitlab.io/

# 检查：
# - [ ] Storybook 已更新到最新版本
# - [ ] 新功能的 Story 已展示
# - [ ] CHANGELOG 已更新
```

---

## 🔄 版本回滚

### 场景 1: 发布后发现严重 bug，需要回滚

**方案 A: 发布修复版本（推荐）**

```bash
# 1. 修复 bug
# 2. 创建 patch changeset
pnpm changeset
# 选择 patch

# 3. 发布新版本
pnpm changeset version  # 1.1.0 → 1.1.1
pnpm build
pnpm changeset publish
```

**方案 B: 废弃有问题的版本**

```bash
# 标记版本为 deprecated
npm deprecate @aix/button@1.1.0 "Critical bug, please use 1.1.1"

# 用户安装时会看到警告
# npm WARN deprecated @aix/button@1.1.0: Critical bug, please use 1.1.1
```

### 场景 2: 误发布，需要撤回

**注意**: npm 只允许在发布后 **72 小时内** 且 **无下载记录** 时撤回。

```bash
# 撤回版本（慎用！）
npm unpublish @aix/button@1.1.0

# 如果超过 72 小时或有下载，只能 deprecate
npm deprecate @aix/button@1.1.0 "Accidental release"
```

### 场景 3: 回滚 Git 代码和版本号

```bash
# 1. 查找发布版本的 commit
git log --oneline --grep="chore: version packages"

# 2. 回滚到上一个版本
git revert <commit-hash>

# 3. 推送回滚 commit
git push

# 注意：Git 回滚不会影响已发布到 npm 的包
# 仍需发布新版本覆盖
```

---

## 📋 常见问题

### 1. changeset 文件冲突

**问题**: 多个 MR 同时修改 `.changeset/` 导致冲突

**解决**:
```bash
# changeset 文件名是随机的，可以都保留
git checkout --theirs .changeset/*.md
git add .changeset/
git commit -m "chore: keep all changesets"
```

### 2. 版本号不递增

**问题**: 执行 `pnpm changeset version` 后版本号没变

**原因**: 没有 changeset 文件

**解决**:
```bash
# 检查是否有 changeset 文件
ls .changeset/*.md

# 如果没有，创建一个
pnpm changeset
```

### 3. 发布失败：401 Unauthorized

**问题**: `pnpm changeset publish` 失败

**解决**:
```bash
# 检查 .npmrc 配置
cat .npmrc

# 重新登录
npm login

# 或手动设置 token
echo "//registry.npmjs.org/:_authToken=npm_xxxx" >> .npmrc
```

### 4. TypeScript 类型丢失

**问题**: 用户安装后 import 没有类型提示

**原因**: 缺少 `types` 字段或类型文件未生成

**解决**:
```bash
# 检查 package.json
grep '"types"' packages/button/package.json
# 应输出: "types": "./dist/index.d.ts",

# 检查类型文件是否存在
ls packages/button/dist/index.d.ts

# 如果缺失，确保 tsconfig.json 配置正确
# "declaration": true,
# "declarationDir": "./dist"
```

### 5. 样式未生效

**问题**: 用户安装后组件无样式

**原因**: 未导入 CSS 文件

**解决**: 在 README 中明确说明

```typescript
// 用户需要手动导入样式
import '@aix/button/style.css';
```

或在 `package.json` 配置自动导入（Vite 环境）:

```json
{
  "exports": {
    ".": {
      "import": {
        "types": "./dist/index.d.ts",
        "default": "./dist/index.esm.js"
      },
      "style": "./dist/style.css"
    },
    "./style.css": "./dist/style.css"
  }
}
```

---

## 💡 最佳实践

### 1. Changeset 编写规范

**Bad**:
```markdown
---
'@aix/button': minor
---

update
```

**Good**:
```markdown
---
'@aix/button': minor
---

Add `size` prop with small/medium/large options

- Add ButtonProps.size type definition
- Add size-specific styles using CSS variables
- Add Storybook story for size variants
```

**原则**:
- 使用祈使句（Add/Fix/Update/Remove）
- 说明用户影响，不是实现细节
- 多个变更用列表展开

### 2. 版本发布节奏

**推荐策略**:
- **每周发布**: 积累一周的 changeset，统一发布
- **紧急修复**: bug 修复立即发布 patch 版本
- **大版本预发布**: 先发布 beta 版本测试 2-4 周

### 3. CHANGELOG 维护

Changesets 自动生成 CHANGELOG，但需人工审查：

```bash
# version 后检查 CHANGELOG
git diff packages/button/CHANGELOG.md

# 必要时手动调整格式，然后 amend commit
git add packages/button/CHANGELOG.md
git commit --amend --no-edit
```

### 4. 多包依赖管理

当 `@aix/icon` 被 `@aix/button` 依赖时：

```bash
# 1. 先发布 icon
cd packages/icon
pnpm changeset publish

# 2. 更新 button 的 peerDependencies
cd ../button
# 修改 package.json:
# "peerDependencies": {
#   "@aix/icon": "^1.2.0"  // 更新到新版本
# }

# 3. 创建 button 的 changeset
pnpm changeset  # 选择 patch（依赖更新）

# 4. 发布 button
pnpm changeset version
pnpm changeset publish
```

### 5. CI/CD 最佳实践

- ✅ **使用保护分支**: master/release 分支开启保护，需要 MR 合并
- ✅ **必须代码审查**: MR 合并前至少 1 人审查
- ✅ **手动触发发布**: publish 阶段使用 `when: manual`，避免误发布
- ✅ **保留构建产物**: artifacts 保留 1 周，便于问题排查
- ✅ **环境变量加密**: 使用 GitLab CI/CD Variables，开启 Protected 和 Masked

---

## 📚 相关文档

- [Changesets 官方文档](https://github.com/changesets/changesets)
- [Semantic Versioning 规范](https://semver.org/)
- [npm publish 命令文档](https://docs.npmjs.com/cli/v10/commands/npm-publish)
- [GitLab CI/CD 配置](./.gitlab-ci.yml) - 项目 CI/CD 配置文件
- [Rollup 构建配置](../../rollup.config.js) - 项目统一构建配置

**项目内部文档**:
- [component-development.md](./component-development.md) - 组件开发流程（包含 README 模板）
- [testing.md](./testing.md) - 测试规范（发布前测试检查）
- [code-review.md](./code-review.md) - 代码审查规范（MR 审查要点）

---

## 🎯 快速参考

### 常用命令速查

```bash
# Changeset 工作流
pnpm changeset              # 创建 changeset
pnpm changeset version      # 更新版本号
pnpm changeset publish      # 发布到 npm
pnpm changeset status       # 查看待发布的包

# 预发布模式
pnpm changeset pre enter beta   # 进入 beta 模式
pnpm changeset pre exit         # 退出预发布模式

# 构建和测试
pnpm build                  # 构建所有包
pnpm build:filter @aix/button # 构建特定包
pnpm test                   # 运行测试
pnpm type-check              # TypeScript 检查

# npm 验证
npm view @aix/button         # 查看包信息
npm view @aix/button version # 查看最新版本
npm deprecate @aix/button@1.0.0 "message" # 废弃版本
```

### 发布检查清单（简化版）

**发布前**:
- [ ] 所有测试通过 (`pnpm test`)
- [ ] 类型检查通过 (`pnpm type-check`)
- [ ] Changeset 已创建且描述清晰
- [ ] README 完整（安装、用法、API）
- [ ] Storybook 文档完善

**发布后**:
- [ ] npm 包可搜索 (`npm view @aix/button`)
- [ ] 本地安装测试通过
- [ ] Git Tag 已推送
- [ ] Storybook 文档已更新
