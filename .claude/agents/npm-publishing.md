---
name: npm-publishing
description: npm 包发布指南 - 发布流程、版本管理、CI/CD 自动化、发布验证、回滚策略
tools: Read, Grep, Glob
model: inherit
---

# npm 包发布指南

> **AIX 组件库 npm 发布完整指南**

## 📚 目录

- [发布前准备](#发布前准备)
- [发布流程](#发布流程)
- [版本管理](#版本管理)
- [Registry 配置](#registry-配置)
- [CI/CD 自动化发布](#cicd-自动化发布)
- [发布后验证](#发布后验证)
- [回滚策略](#回滚策略)
- [常见问题](#常见问题)

---

## 发布前准备

### 1. 检查清单

在发布前，确保完成以下检查：

| 检查项 | 命令 | 说明 |
|--------|------|------|
| **代码检查** | `pnpm lint` | ESLint 检查通过 |
| **类型检查** | `pnpm type-check` | TypeScript 类型检查通过 |
| **测试** | `pnpm test` | 所有测试通过 |
| **测试覆盖率** | `pnpm test:coverage` | 阈值见根 `vitest.config.ts`（防退化棘轮，非 80%）|
| **构建** | `pnpm build` | 构建成功，无报错 |
| **发布体检** | `pnpm lint:publish --strict` | publint + attw + 四项自检，**CI 用的就是 `--strict`** |
| **文档** | `pnpm docs:build` | 文档构建成功 |
| **Changeset** | `pnpm changeset status` | 有待发布的 changesets |
| **Git 状态** | `git status` | 工作区干净，无未提交的修改 |

> **`pnpm lint:publish` 是本仓最容易被忽略的门禁**。它校验 `exports` 双包形态、`./style` 的
> `types` 条件、`files` 声明的目录是否真实存在，并真的 `require()` / `import()` 一次入口。
> 本地不带 `--strict` 跑通 **不代表 CI 会过**——`--strict` 会把 warning 一并升级为失败。
> 实现与四项自检的来由见 `scripts/publish-lint/index.ts` 顶部注释。

**一键检查**：不需要自写脚本，`pnpm pre --with-gates` 会在发布流程内串跑
test / type-check / lint（见 `scripts/publish/gates.ts`）。

### 2. 私有 registry 登录

⚠️ **`@aix/*` 和 `@kit/*` 全部发布到公司私有 registry，不是公网 npm。** 仓库根 `.npmrc`：

```ini
registry=https://registry.npmjs.org/

# 所有 @aix/@kit 作用域包统一发布到私有仓库
@kit:registry=http://npm-registry.zhihuishu.com:4873/
@aix:registry=http://npm-registry.zhihuishu.com:4873/
```

```bash
# 登录私有仓库（必须带 --registry，否则登的是公网）
npm login --registry=http://npm-registry.zhihuishu.com:4873/

# 确认当前身份是在私有仓库上
npm whoami --registry=http://npm-registry.zhihuishu.com:4873/

# 确认 scope 解析正确
npm config get @aix:registry
```

`pnpm pre` 会自己从 `.npmrc` 解析 scoped registry 并校验登录态（见 `scripts/publish/npm.ts`
的 `getNpmRegistry` / `checkNpmLogin`），未登录会直接中止并给出上面的登录命令。

### 3. 访问权限

私有 registry（Verdaccio）走的是仓库自身的用户/权限模型，**不要执行公网 npm 的这套命令**：

| ❌ 不要用 | 原因 |
|----------|------|
| `npm publish --access public` | `--access` 是公网 npm scope 的概念；在本仓语境下容易误导人往公网发 |
| `npm access public @aix/button` | 对私有 registry 无意义 |
| `npm owner add <user> @aix/button` | 权限在私有仓库后台管理，不通过 npm CLI |

包权限问题请找私有仓库管理员，不要试图用 npm CLI 自助解决。

---

## 发布流程

### 方法 1: Changesets 工作流（推荐）

**完整流程**:

```bash
# 步骤 1: 开发完成后，添加 changeset
pnpm changeset

# 交互式选择要发布的包和变更类型
? Which packages would you like to include?
  ◉ @aix/button
  ◯ @aix/input

? What kind of change is this for @aix/button?
  ◯ major (1.0.0 -> 2.0.0) - Breaking change
  ◉ minor (1.0.0 -> 1.1.0) - New feature
  ◯ patch (1.0.0 -> 1.0.1) - Bug fix

? Please enter a summary for this change:
  Add loading state support

# 步骤 2: 提交 changeset
git add .changeset/
git commit -m "chore: add changeset for button loading state"
git push

# 步骤 3: 版本提升（通常在发布分支或主分支）
pnpm changeset version

# 这会：
# - 更新 packages/button/package.json 版本号
# - 生成 packages/button/CHANGELOG.md
# - 删除 .changeset/*.md 文件

# 步骤 4: 提交版本变更
git add .
git commit -m "chore: release @aix/button@1.1.0"
git push

# 步骤 5: 构建所有包
pnpm build

# 步骤 6: 发布到 npm
pnpm changeset publish

# 步骤 7: 推送 git tags
git push --follow-tags
```

### 方法 2: `pnpm pre` 本地发布（本仓实际使用的路径）

`scripts/publish/` 把「changeset → version → build → publish → git tag」串成一条命令，
并自带私有 registry 登录校验、pre 模式处理和失败回滚：

```bash
pnpm pre --help              # 先看选项，别凭记忆传参
pnpm pre                     # 交互式：选包、选 bump、选 dist-tag
pnpm pre --dry-run           # 只列将要发布的包，不实际发布
pnpm pre --with-gates        # 额外串跑 test / type-check / lint（默认跳过）

# 非交互（CI 或脚本化场景）
pnpm pre --mode release --action full \
  --packages @aix/button --bump patch --summary "修复 loading 态" --yes
```

- `--mode`：`release` / `beta` / `alpha` / 自定义 dist-tag（如 `oem`）
- `--action`：`full`（全流程）/ `create`（只建 changeset）/ `version` / `publish`

### 关于"手动发布"

**不要 `cd packages/<pkg> && npm publish`。** 单包手动发布会绕过版本联动、
`lint:publish` 体检和 git tag，且极易因为没带 `--registry` 而发错仓库。

需要只发某几个包时，用 changeset 的选择能力（`pnpm changeset` 交互勾选，或
`pnpm pre --packages @aix/button,@aix/popper`），而不是绕开流程。
`pnpm changeset publish` **没有 `--filter` 参数**——它发布的是所有版本已被 bump
但尚未发布的包，范围由 changeset 决定，不由命令行决定。

---

## 版本管理

### 语义化版本 (SemVer)

**格式**: `MAJOR.MINOR.PATCH` (例如: `1.2.3`)

| 版本类型 | 说明 | 示例 | 何时使用 |
|---------|------|------|---------|
| **Major** | 不兼容的 API 变更 | `1.0.0 -> 2.0.0` | 删除 API、修改 API 签名、Breaking Change |
| **Minor** | 向后兼容的新功能 | `1.0.0 -> 1.1.0` | 添加新 API、新功能、新 Props |
| **Patch** | 向后兼容的问题修复 | `1.0.0 -> 1.0.1` | Bug 修复、性能优化、文档更新 |

### Breaking Change 示例

```typescript
// ❌ Breaking Change (Major)
// v1.0.0
interface ButtonProps {
  type?: 'primary' | 'default';
}

// v2.0.0 - 删除了 'default' 类型
interface ButtonProps {
  type?: 'primary' | 'danger';  // Breaking!
}

// ✅ 非 Breaking Change (Minor)
// v1.0.0
interface ButtonProps {
  type?: 'primary' | 'default';
}

// v1.1.0 - 添加新类型
interface ButtonProps {
  type?: 'primary' | 'default' | 'danger';  // 向后兼容
}
```

### 版本发布策略

#### 1. 稳定版本 (Stable Release)

```bash
# 当前版本: 1.0.0
pnpm changeset version  # -> 1.1.0 (minor)
pnpm changeset publish
```

#### 2. 预发布版本 (Pre-release)

```bash
# 进入 pre-release 模式
pnpm changeset pre enter alpha

# 添加 changeset
pnpm changeset

# 版本提升
pnpm changeset version  # -> 1.1.0-alpha.0

# 发布预发布版本
pnpm changeset publish --tag alpha

# 退出 pre-release 模式
pnpm changeset pre exit
```

**预发布标签**:

| 标签 | 说明 | 使用场景 |
|------|------|---------|
| **alpha** | 内部测试版本 | 开发阶段，功能未完成 |
| **beta** | 公开测试版本 | 功能完成，需要广泛测试 |
| **rc** | 发布候选版本 | 准备正式发布，最后的测试 |

#### 3. 版本锁定 (Version Pinning)

```json
// 使用精确版本（不推荐，除非有特殊原因）
{
  "dependencies": {
    "@aix/button": "1.0.0"
  }
}

// 使用范围版本（推荐）
{
  "dependencies": {
    "@aix/button": "^1.0.0"  // 允许 1.x.x 的任何版本
  }
}
```

---

## Registry 配置

### 1. registry 由仓库根 `.npmrc` 决定，不要用 `npm config set` 改

仓库根 `.npmrc` 已入库，是 registry 的单一事实来源：

```ini
registry=https://registry.npmjs.org/

# 所有 @aix/@kit 作用域包统一发布到私有仓库
@kit:registry=http://npm-registry.zhihuishu.com:4873/
@aix:registry=http://npm-registry.zhihuishu.com:4873/
```

即：**公网 npm 只用于安装第三方依赖；`@aix/*` 和 `@kit/*` 的安装与发布都走私有仓库。**

⚠️ 不要执行 `npm config set registry ...` 或 `npm config set @aix:registry ...`。
那会写进用户级 `~/.npmrc` 并覆盖项目配置，最典型的后果是把内部包发到了公网 npm。
registry 需要调整时，改仓库根 `.npmrc` 并走 code review。

### 2. 认证配置

本地认证由 `npm login --registry=...` 写入用户级 `~/.npmrc`，形如：

```ini
//npm-registry.zhihuishu.com:4873/:_authToken=<token>
```

CI 侧由 `release-packages.yml` 在发布步骤前追加写入（token 取自 `secrets.NPM_TOKEN`）：

```yaml
- name: Configure npm auth for private registry
  if: github.event.inputs.action == 'Publish to npm'
  run: |
    echo "//npm-registry.zhihuishu.com:4873/:_authToken=\${NPM_TOKEN}" >> .npmrc
```

**任何情况下都不要把 token 提交进仓库根 `.npmrc`。**

### 3. 关于 `publishConfig`

本仓所有包 **都没有** `publishConfig` 字段，也不需要加——registry 已由 `.npmrc` 的
scoped 配置解析，`access` 是公网 npm scope 的概念，对私有 registry 无意义。
包的发布形态（`main` / `module` / `types` / `exports` / `files` / `sideEffects`）
以 `scripts/gen/templates/package.json.eta` 为准，并由 `pnpm lint:publish` 把关。

---

## CI/CD 自动化发布

### 真实工作流：`.github/workflows/release-packages.yml`

本仓 **只有一个** 发布工作流，且是**手动触发**的两段式流程——没有 push 到 master 自动发布，
也没有 `release.yml` / `manual-release.yml` 这类文件。改动发布行为请直接编辑该文件。

```
开发者本地 pnpm changeset 并提交
        ↓
Actions 页面 → Release Packages → Run workflow
        ↓
选 "Create Version PR"  → changesets/action 生成 "chore(release): version packages" PR
        ↓
审查并合入该 PR（版本号 + CHANGELOG 落库）
        ↓
再次 Run workflow，选 "Publish to npm" → 发布 + git push --follow-tags
```

**发布前门禁**（两个 action 都会跑，位于 install/build 之后）：

```bash
pnpm test
pnpm type-check
pnpm lint
pnpm lint:publish --strict   # ← 本地最容易漏掉的一条
```

> 该 workflow 带 `workflow_dispatch`，可以绕过 PR 门禁直接发布，
> 所以质量检查在这里**重复跑了一遍**，不能只依赖 `check-quality.yml`。

**环境事实**（与文档中常见的模板不同，改之前先看文件）：

| 项 | 值 |
|----|-----|
| 触发方式 | `workflow_dispatch`，`inputs.action` 二选一 |
| pnpm | `pnpm/action-setup@v4`，version `10.14.0` |
| Node | `actions/setup-node@v4`，node 22 |
| 并发 | `concurrency: release`，`cancel-in-progress: false` |
| registry 认证 | 发布步骤前追加写入 `.npmrc`（私有仓库，见上文「认证配置」）|

### 配置 GitHub Secrets

```
Settings → Secrets and variables → Actions → New repository secret
Name:  NPM_TOKEN
Value: <私有 registry 的发布 token>
```

⚠️ 这里要的是 **私有 registry 的 token**，不是 npmjs.com 的 token。
生成方式：`npm login --registry=http://npm-registry.zhihuishu.com:4873/` 后
从 `~/.npmrc` 中取对应行的 `_authToken`。

---

## 发布后验证

### 1. 检查 npm 包

⚠️ 下面所有命令都必须带 `--registry`，或者在仓库目录内执行（让根 `.npmrc` 的 scoped
配置生效）。在任意空目录裸跑 `npm view @aix/button` 打的是公网 npm，只会得到 404。

```bash
R=http://npm-registry.zhihuishu.com:4873/

# 查看包信息 / 全部版本 / 最新版本 / 依赖
npm view @aix/button --registry=$R
npm view @aix/button versions --registry=$R
npm view @aix/button version --registry=$R
npm view @aix/button dependencies --registry=$R

# 下载包到本地查看实际发布内容（核对 files 字段有没有漏）
npm pack @aix/button --registry=$R
tar -xzf aix-button-<version>.tgz
```

### 2. 安装验证

```bash
mkdir test-install && cd test-install
npm init -y

# 关键：新目录没有仓库的 .npmrc，必须先把 scope 指向私有仓库
npm config set @aix:registry http://npm-registry.zhihuishu.com:4873/ --location=project

npm install @aix/button

# 验证包内容
ls node_modules/@aix/button/

# 验证类型定义（ESM 入口在 es/，CJS 入口的类型是 lib/index.d.cts）
cat node_modules/@aix/button/es/index.d.ts
```

> 这里用 `--location=project` 只写入该测试目录的 `.npmrc`，不会污染用户级配置。
> 更省事的做法是直接跑 `pnpm lint:publish`——它已经在发布前把
> "CJS 能否 require / ESM 能否 import / files 目录是否非空" 都验过一遍了。

### 3. 功能验证

**创建测试项目** (test-app/):

```vue
<!-- test-app/src/App.vue -->
<template>
  <div>
    <AixButton type="primary" @click="handleClick">
      Click Me
    </AixButton>
  </div>
</template>

<script setup lang="ts">
import { AixButton } from '@aix/button';
import '@aix/button/style'; // exports 里的子路径是 ./style，不带 .css

function handleClick() {
  console.log('Button clicked!');
}
</script>
```

```bash
# 运行测试项目
cd test-app
pnpm dev
```

### 4. 文档验证

包页面在私有仓库上，不在 npmjs.com（`https://www.npmjs.com/package/@aix/button` 是 404），
CDN 类服务（unpkg / jsdelivr）同样取不到内部包。

```bash
# 私有仓库的 Web UI
open http://npm-registry.zhihuishu.com:4873/-/web/detail/@aix/button

# 验证：README 显示正常 / 版本号正确 / 依赖列表正确 / 文件列表完整
```

组件文档站另行验证：`pnpm docs:build`（VitePress）与 `pnpm storybook:build`
（产物在 `dist/storybook`），部署见 `.github/workflows/deploy-docs.yml`。

---

## 回滚策略

### 1. 撤销发布（不推荐）

**走 `pnpm pre` 提供的交互入口**，它会带上正确的 `--registry` 并让你从待选列表里确认包和版本
（实现见 `scripts/publish/npm.ts` 的 `unpublishPackageVersion`）。不要手敲裸 `npm unpublish`——
不带 `--registry` 时它打的是公网 npm，报错信息还会让人误以为是权限问题。

```bash
pnpm pre        # 在菜单中选择撤销/废弃相关操作
```

**注意事项**:
- npm 不推荐使用 unpublish
- 只能在发布后 24 小时内撤销
- 撤销后无法再发布相同版本
- 影响已经安装该版本的用户

### 2. 发布修复版本（推荐）

```bash
# 步骤 1: 修复问题
# 编辑代码，修复 bug

# 步骤 2: 添加 changeset
pnpm changeset
# 选择 patch 类型

# 步骤 3: 版本提升
pnpm changeset version  # 1.0.0 -> 1.0.1

# 步骤 4: 发布修复版本
pnpm build
pnpm changeset publish
```

### 3. 废弃版本

同样走 `pnpm pre`（实现见 `scripts/publish/npm.ts` 的 `deprecatePackageVersion`）。
若确实要手敲，**必须显式带 `--registry`**：

```bash
R=http://npm-registry.zhihuishu.com:4873/

# 标记版本为废弃（不删除）
npm deprecate @aix/button@1.0.0 "存在严重缺陷，请升级到 1.0.1" --registry=$R

# 取消废弃（传空字符串）
npm deprecate @aix/button@1.0.0 "" --registry=$R
```

### 4. 回退到上一个版本

**用户侧操作**:

```bash
# 安装上一个稳定版本
npm install @aix/button@1.0.0

# 锁定版本
{
  "dependencies": {
    "@aix/button": "1.0.0"
  }
}
```

### 5. 紧急修复流程

```bash
# 步骤 1: 创建 hotfix 分支
git checkout -b hotfix/button-critical-bug

# 步骤 2: 修复问题
# 编辑代码

# 步骤 3: 测试
pnpm test

# 步骤 4: 提交
git commit -m "fix(button): fix critical bug"

# 步骤 5: 合并到 master
git checkout master
git merge hotfix/button-critical-bug

# 步骤 6: 发布修复版本
pnpm changeset
pnpm changeset version
pnpm build
pnpm changeset publish

# 步骤 7: 通知用户
# 在 GitHub Release、社交媒体、官网发布公告
```

---

## 常见问题

### Q1: 发布失败：权限不足

**错误信息**:
```
npm ERR! code E403
npm ERR! 403 Forbidden - PUT http://npm-registry.zhihuishu.com:4873/@aix%2fbutton
```

> 如果报错里的地址是 `https://registry.npmjs.org/`，**那不是权限问题，是发错了仓库**——
> 说明 scoped registry 没生效（多半是用户级 `~/.npmrc` 里有 `npm config set` 留下的覆盖，
> 或者命令不是在仓库目录下跑的）。先解决 registry，再谈权限。

**解决方案**:

```bash
R=http://npm-registry.zhihuishu.com:4873/

# 1. 确认 scope 解析到私有仓库（应输出上面的地址）
npm config get @aix:registry

# 2. 检查在私有仓库上的登录状态
npm whoami --registry=$R

# 3. 重新登录
npm logout --registry=$R
npm login  --registry=$R
```

仍然 403 的话就是账号没有该包的发布权限——联系私有仓库管理员，
`npm access` / `npm owner` 这类公网 npm 命令在这里解决不了问题。

### Q2: 版本号已存在

**错误信息**:
```
npm ERR! code E409
npm ERR! 409 Conflict - PUT http://npm-registry.zhihuishu.com:4873/@aix%2fbutton
npm ERR! Cannot publish over existing version.
```

**解决方案**：不要用 `npm version` 手改版本号绕过——那会让 package.json 和 changeset
状态脱节。正确做法是补一个 changeset 让版本正常往前走：

```bash
# 1. 查看仓库里已发布的最新版本
npm view @aix/button version --registry=http://npm-registry.zhihuishu.com:4873/

# 2. 补 changeset 并重新走流程
pnpm changeset          # 选 patch
pnpm pre                # 或走 release-packages.yml
```

### Q3: 包含敏感信息

**问题**: 不小心发布了包含敏感信息（API key、密码）的版本。

**解决方案**:

```bash
# 1. 立即撤销发布（24 小时内），走 pnpm pre 以带上正确的 registry
pnpm pre

# 2. 轮换泄露的凭证 —— 这一步优先级最高，撤包不等于凭证安全
#    （包已被镜像/缓存/安装过，必须假定凭证已泄露）

# 3. 删除敏感信息
# 编辑代码，删除敏感信息

# 4. 更新 .gitignore（本仓不用 .npmignore，发布内容由 package.json 的 files 字段控制）
echo ".env" >> .gitignore

# 5. 发布新版本
pnpm changeset   # 选 patch
pnpm pre

# 5. 撤销 Git 历史中的敏感信息
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

### Q4: 发布后无法安装

**问题**: 发布成功，但 `npm install` 失败。

**检查清单**:

```bash
# 1. 检查包是否存在
npm view @aix/button

# 2. 检查 package.json 入口字段（产物在 es/ 与 lib/，不是 dist/）
{
  "main": "./lib/index.cjs",
  "module": "./es/index.js",
  "types": "./es/index.d.ts"
}

# 3. 检查 files 字段
{
  "files": ["es", "lib"]  // 白名单；README 由 npm 自动包含
}

# 更省事：上面三项 pnpm lint:publish 会一次性验完，还会真的 require/import 一次入口

# 4. 检查依赖是否正确
{
  "peerDependencies": {
    "vue": "^3.5.31"  // 确保版本范围合理
  }
}

# 5. 本地测试
npm pack
tar -tzf aix-button-1.0.0.tgz  # 查看打包内容
```

### Q5: Changesets 未检测到变更

**问题**: 运行 `pnpm changeset version` 没有更新版本。

**解决方案**:

```bash
# 1. 检查是否有 changeset 文件
ls .changeset/

# 2. 手动添加 changeset
pnpm changeset

# 3. 检查 changeset 状态
pnpm changeset status

# 4. 如果没有变更，确认代码已提交
git status
git add .
git commit -m "feat: add new feature"
```

### Q6: 如何发布 Monorepo 中的单个包？

**A:**

发布范围由 **changeset 勾选了哪些包** 决定，不由命令行参数决定：

```bash
# 交互式：只勾选 @aix/button
pnpm changeset
pnpm pre --action version   # 或走 release-packages.yml 的 "Create Version PR"

# 非交互等价写法
pnpm pre --action create --packages @aix/button --bump patch --summary "..." --yes
```

⚠️ 不要用 `cd packages/button && npm publish` 或
`pnpm --filter @aix/button exec npm publish`。这两种写法会跳过 `lint:publish` 体检、
跳过依赖方的版本联动（见 Q7），并且因为不带 `--registry` 而有发到公网 npm 的风险。

### Q7: 如何处理跨包依赖的发布顺序？

**A:**

Changesets 会自动处理依赖顺序：

```bash
# 假设依赖关系：
# @aix/button depends on @aix/hooks

# Changesets 会按顺序发布：
# 1. @aix/hooks@1.1.0
# 2. @aix/button@1.0.1 (自动更新依赖为 @aix/hooks@^1.1.0)

pnpm changeset publish
```

### Q8: 发布后如何生成 GitHub Release？

**A:**

```bash
# 方法 1: 使用 GitHub CLI
gh release create v1.0.0 \
  --title "Release v1.0.0" \
  --notes "$(cat CHANGELOG.md)"

# 方法 2: 使用 GitHub Actions
# .github/workflows/release.yml
- name: Create GitHub Release
  uses: actions/create-release@v1
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  with:
    tag_name: v${{ steps.changeset.outputs.publishedVersion }}
    release_name: Release v${{ steps.changeset.outputs.publishedVersion }}
    body: ${{ steps.changeset.outputs.changelog }}
```

---

## 最佳实践

### 1. 发布前检查

- ✅ **运行完整测试**: 确保所有测试通过
- ✅ **检查构建产物**: 确保构建输出正确
- ✅ **Review Changelog**: 确保 changelog 准确描述变更
- ✅ **跑发布体检**: `pnpm lint:publish --strict`（CI 用的就是 `--strict`，本地必须对齐）
- ✅ **本地安装测试**: 使用 `npm pack --registry=<私有仓库>` 本地测试

### 2. 版本管理

- ✅ **遵循 SemVer**: 严格遵循语义化版本规范
- ✅ **使用 Changesets**: 自动化版本管理和 changelog
- ✅ **预发布测试**: 重要变更先发布预发布版本
- ✅ **版本锁定**: 锁定关键依赖的版本

### 3. 安全性

- ✅ **检查敏感信息**: 确保不包含 .env、私钥等
- ✅ **用 `files` 白名单**: 本仓 **不使用 `.npmignore`**，发布内容由 package.json 的
  `files: ["es", "lib"]` 正向声明（白名单比黑名单更难漏）
- ✅ **认准私有 registry**: 任何 `npm` 写操作都确认 `--registry` 或 scope 解析正确
- ✅ **审查依赖**: 定期审查和更新依赖

### 4. 自动化

- ✅ **CI/CD 集成**: 走 `release-packages.yml`（手动两段式），不要另造发布路径
- ✅ **自动化测试**: 发布前自动运行测试
- ✅ **发布通知**: 发布成功后自动通知团队
- ✅ **文档同步**: 发布后自动更新文档网站

### 5. 回滚准备

- ✅ **保留历史版本**: 不轻易删除旧版本
- ✅ **标记废弃**: 使用 `npm deprecate` 而不是 `unpublish`
- ✅ **快速修复流程**: 建立紧急修复和发布流程
- ✅ **通知用户**: 重大问题及时通知用户

---

## 相关文档

- [npm 发布文档](https://docs.npmjs.com/cli/v9/commands/npm-publish)
- [Changesets 文档](https://github.com/changesets/changesets)
- [语义化版本规范](https://semver.org/lang/zh-CN/)
- [.claude/commands/release.md](../commands/release.md) - 发布命令
- [.claude/agents/project-structure.md](./project-structure.md) - 项目结构和 Monorepo 管理
