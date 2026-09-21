# 组件库联调工具脚本

本目录包含用于**外部业务项目**联调的自动化脚本，基于 Yalc 实现。

**适用场景：** 当你的业务项目在外部仓库（不在此 monorepo 内）时，使用这些工具进行组件库联调。

**注意：** 如果你的项目在 monorepo 内（如 `apps/example`），推荐使用源码模式（Vite alias），无需 yalc。详见 [示例项目文档](../../apps/example/README.md)。

---

## 🔧 环境要求

在使用这些工具前，请确保满足以下版本要求：

| 工具 | 最低版本 | 推荐版本 | 说明 |
|------|---------|---------|------|
| **Node.js** | >= 22.0.0 | 22.x LTS | 必需 |
| **pnpm** | >= 10.0.0 | 10.x | 必需 |
| **yalc** | latest | latest | 自动安装 |

**检查环境：**
```bash
pnpm link:setup  # 自动检查版本并安装 yalc
```

---

## 📁 文件说明

### setup.ts - 环境检查工具

检查并安装 Yalc 环境，显示使用指南。

**用途**：
- 检测 Yalc 是否已安装
- 自动安装 Yalc（如未安装）
- 显示联调使用指南

**使用**：
```bash
pnpm link:setup
```

**功能**：
- ✅ 检测 `yalc --version`
- ✅ 未安装时执行 `npm install -g yalc`
- ✅ 显示两种联调模式的使用说明

---

### publish.ts - Yalc 发布工具

交互式发布组件包到 Yalc 本地仓库。

**用途**：
- 选择要发布的组件包
- 自动构建（如未构建）
- 发布到 Yalc 本地仓库

**使用**：
```bash
pnpm link:publish
```

**工作流程**：
1. 扫描 `packages/` 目录下的所有包
2. 显示可选择的包列表（支持多选 + 全选）
3. 检查包是否已构建（检查 `es/` 或 `lib/` 目录）
4. 未构建的包自动执行 `pnpm build`
5. 对每个包执行 `yalc publish`
6. 显示下一步操作提示

**示例输出**：
```
🚀 Yalc 发布工具

请选择要发布的包:
  ◉ 全部
  ◯ @aix/button
  ◯ @aix/theme
  ◯ @aix/hooks

📦 发布 button...
✓ button 发布成功

📖 下一步:
  在业务项目中执行:
    yalc add @aix/button
```

**技术实现**：
- 使用 `@inquirer/prompts` 提供交互式选择
- 使用 `chalk` 美化输出
- 自动检测构建状态
- 错误处理和友好提示

---

### push.ts - Yalc 推送工具

推送更新到已链接的业务项目。

**用途**：
- 选择要更新的组件包
- 自动重新构建
- 推送到所有已链接的项目

**使用**：
```bash
pnpm link:push
```

**工作流程**：
1. 扫描 `packages/` 目录下的所有包
2. 显示可选择的包列表（支持多选 + 全选）
3. 对每个包：
   - 执行 `pnpm build` 重新构建
   - 执行 `yalc push` 推送到所有链接的项目
4. 显示完成提示

**适用场景**：
- 修改组件库代码后快速更新业务项目
- 测试打包产物是否正常
- 多个业务项目同时联调

---

---

## 🔄 完整工作流程（外部业务项目）

### 准备工作（一次性）

```bash
# 1. 在组件库根目录检查环境
cd /path/to/aix
pnpm link:setup

# 2. 复制脚本到业务项目
mkdir -p /path/to/your-business-project/scripts
cp apps/example/scripts/add-yalc.ts /path/to/your-business-project/scripts/
cp apps/example/scripts/remove-yalc.ts /path/to/your-business-project/scripts/

# 3. 在业务项目添加 scripts 和依赖
cd /path/to/your-business-project
# 编辑 package.json 添加：
{
  "scripts": {
    "add:yalc": "tsx scripts/add-yalc.ts",
    "remove:yalc": "tsx scripts/remove-yalc.ts"
  },
  "devDependencies": {
    "tsx": "latest",
    "chalk": "^5.3.0",
    "@inquirer/prompts": "^8.7.2"
  }
}
```

### 首次联调

```bash
# 1. 发布组件库到 Yalc（在组件库根目录）
cd /path/to/aix
pnpm link:publish
# 选择要发布的包

# 2. 在业务项目中添加（自动保存版本）
cd /path/to/your-business-project
pnpm add:yalc
# 交互式选择要添加的包
```

### 日常开发

```bash
# 1. 在组件库修改代码
cd /path/to/aix
# 编辑 packages/button/src/Button.vue

# 2. 推送更新到业务项目
pnpm link:push
# 选择要推送的包

# 3. 业务项目会自动更新依赖
# 切换到业务项目，刷新浏览器查看效果
```

### 完成联调后清理

```bash
cd /path/to/your-business-project
pnpm remove:yalc  # 自动恢复原始版本
```

**工作原理：**
- `add:yalc` - 自动保存当前 npm 包版本，交互式选择要添加的包
- `remove:yalc` - 移除 yalc 链接并自动恢复原始版本
- `.yalc.backup.json` - 自动管理，不要提交到版本控制

**详细文档：** 查看 [apps/example/scripts/README.md](../../apps/example/scripts/README.md) 了解脚本详细使用说明

---

## 🛠️ 技术细节

### 依赖

所有脚本依赖以下 npm 包（已在根 package.json 中）：

- `chalk` - 终端颜色输出
- `@inquirer/prompts` - 交互式命令行界面
- `tsx` - TypeScript 执行器

### 错误处理

所有脚本都包含完善的错误处理：

- ✅ 检测命令执行失败
- ✅ 显示友好的错误提示
- ✅ 提供解决方案建议
- ✅ 非零退出码（便于 CI/CD）

### 目录扫描

脚本自动扫描 `packages/` 目录：

```typescript
const PACKAGES_DIR = join(process.cwd(), 'packages');

function getPackages(): string[] {
  return readdirSync(PACKAGES_DIR).filter((name) => {
    const pkgPath = join(PACKAGES_DIR, name);
    return statSync(pkgPath).isDirectory() &&
           existsSync(join(pkgPath, 'package.json'));
  });
}
```

### 构建检测

检查 `es/` 或 `lib/` 目录是否存在：

```typescript
function isPackageBuilt(pkgName: string): boolean {
  const pkgPath = join(PACKAGES_DIR, pkgName);
  return existsSync(join(pkgPath, 'es')) ||
         existsSync(join(pkgPath, 'lib'));
}
```

---

## 📚 相关文档

- [示例项目文档](../../apps/example/README.md) - monorepo 内部项目联调
- 外部业务项目请参考本文档的 Yalc 使用说明

---

## 🔧 自定义配置

### 修改 packages 目录

如果你的包不在 `packages/` 目录下，修改常量：

```typescript
const PACKAGES_DIR = join(process.cwd(), 'your-packages-dir');
```

### 添加构建钩子

在发布前执行额外操作，修改 `publish.ts`：

```typescript
function publishPackage(pkgName: string): void {
  const pkgPath = join(PACKAGES_DIR, pkgName);

  // 添加自定义逻辑
  execSync(`cd ${pkgPath} && pnpm lint`, { stdio: 'inherit' });

  // 原有逻辑...
}
```

### 修改输出样式

使用 `chalk` 自定义颜色：

```typescript
import chalk from 'chalk';

console.log(chalk.green('✓ 成功'));
console.log(chalk.red('✗ 失败'));
console.log(chalk.cyan('🔗 提示'));
console.log(chalk.yellow('⚠ 警告'));
```

---

## 🐛 故障排查

### 问题 1: yalc 命令未找到

**错误**：
```
yalc: command not found
```

**解决**：
```bash
npm install -g yalc
# 或
pnpm link:setup
```

---

### 问题 2: 构建失败

**错误**：
```
✗ button 构建失败
```

**解决**：
```bash
# 手动构建检查错误
cd packages/button
pnpm build

# 检查日志
```

---

### 问题 3: 推送后业务项目未更新

**可能原因**：
1. 业务项目未使用 yalc link
2. 需要重启 dev 服务器

**解决**：
```bash
# 在业务项目
yalc check  # 检查链接状态
yalc update # 手动更新

# 重启开发服务器
pnpm dev
```

---

## 💡 最佳实践

### 1. 分包发布

不要总是选择"全部"，只发布修改的包：

```bash
pnpm link:publish
# 只选择 @aix/button
```

### 2. 观察构建输出

如果构建失败，仔细查看错误信息：

```bash
# 手动构建查看详细日志
cd packages/button
pnpm build
```

### 3. 定期清理 Yalc 缓存

```bash
# 清理所有 Yalc 缓存
yalc installations clean
```

---

## 🚀 高级用法

### 批处理脚本

创建自定义批处理脚本：

```bash
#!/bin/bash
# scripts/link/publish-all.sh

echo "构建所有包..."
pnpm build

echo "发布所有包到 Yalc..."
pnpm link:publish

echo "完成！"
```

### CI/CD 集成

在 CI 中使用这些脚本：

```yaml
# .gitlab-ci.yml
test-linking:
  script:
    - pnpm link:setup
    - pnpm link:publish
    - cd test-project
    - yalc add @aix/button
    - pnpm test
```

---

## 📊 脚本对比

| 脚本 | 用途 | 频率 | 构建 | 推送 |
|-----|------|------|------|------|
| **setup.ts** | 环境检查 | 一次 | ❌ | ❌ |
| **publish.ts** | 首次发布 | 低 | ✅ | ✅ |
| **push.ts** | 快速更新 | 高 | ✅ | ✅ |

---

## 更新日志

- **2025-01-XX**: 初始版本
  - ✅ setup.ts - 环境检查
  - ✅ publish.ts - 交互式发布
  - ✅ push.ts - 快速推送
- **2025-01-XX**: 优化目录结构
  - ✅ 统一放入 scripts/link/ 目录
  - ✅ 添加完整文档

---

## 贡献指南

如需改进这些脚本：

1. 在 `scripts/link/` 目录下修改
2. 测试所有场景（首次发布、更新、错误处理）
3. 更新本 README
4. 提交 PR

---

愉快地使用联调工具！🎉
