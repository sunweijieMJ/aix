# Example 项目脚本工具

本目录包含示例项目的辅助脚本。

## 📁 脚本说明

### add-yalc.ts - 智能添加 Yalc 链接

交互式添加 yalc 链接，自动保存原始依赖版本。

**功能：**
- 自动保存 package.json 中的 @aix/* 依赖版本到 `.yalc.backup.json`
- 交互式选择要添加的组件包（支持多选 + 全选）
- 执行 `yalc add` 添加依赖（yalc 自动处理依赖链接）
- 检测已有链接并提示

**使用：**
```bash
# 在 example 项目中执行
pnpm add:yalc

# 或直接执行
tsx scripts/add-yalc.ts
```

**工作流程：**
1. 检查是否已有 yalc 链接（`.yalc` 目录）
2. 保存当前依赖版本到 `.yalc.backup.json`（如果存在）
3. 交互式选择要添加的包（全部/单个/多个）
4. 执行 `yalc add @aix/xxx`（yalc 自动处理依赖链接）
5. 显示下一步提示

**注意：** yalc add 会自动处理依赖链接，通常不需要额外的 `pnpm install`。如果是外部项目且遇到依赖问题，可手动执行 `pnpm install`。

**适用场景：**
- 从源码模式切换到 Yalc 模式
- 测试打包产物
- 外部业务项目联调

---

### remove-yalc.ts - 智能移除 Yalc 链接

移除 yalc 链接，自动恢复原始依赖版本。

**功能：**
- 检查并读取 `.yalc.backup.json` 备份文件
- 移除所有 `.yalc` 相关文件
- 恢复 package.json 中的原始 npm 包版本
- 清理备份文件

**使用：**
```bash
# 在 example 项目中执行
pnpm remove:yalc

# 或直接执行
tsx scripts/remove-yalc.ts
```

**工作流程：**
1. 检查 `.yalc` 目录是否存在
2. 读取 `.yalc.backup.json`（如果存在）
3. 执行 `yalc remove --all`
4. 恢复 package.json 中保存的版本号
5. 删除备份文件

**注意：** 如果是外部项目且恢复了 npm 包版本，可能需要手动执行 `pnpm install` 重新安装依赖。

**适用场景：**
- 从 Yalc 模式切换回源码模式
- 外部业务项目从 yalc 切换回 npm 包

---

## 🔄 完整使用流程

### Example 项目（简化流程）

Example 项目不需要预先保存版本，`add:yalc` 会自动处理：

```bash
# 1. 添加 Yalc（自动保存备份）
pnpm add:yalc
# 选择要添加的包

# 2. 启动 Yalc 模式
pnpm dev:yalc

# 3. 清理（切换回源码模式）
pnpm remove:yalc
pnpm dev
```

### 外部业务项目（完整流程）

外部项目需要先复制脚本：

```bash
# 1. 复制脚本到业务项目
mkdir -p /path/to/your-project/scripts
cp add-yalc.ts /path/to/your-project/scripts/
cp remove-yalc.ts /path/to/your-project/scripts/

# 2. 添加到 package.json
{
  "scripts": {
    "add:yalc": "tsx scripts/add-yalc.ts",
    "remove:yalc": "tsx scripts/remove-yalc.ts"
  },
  "devDependencies": {
    "tsx": "latest",
    "chalk": "^5.3.0",
    "inquirer": "^10.2.0"
  }
}

# 3. 使用 yalc（自动处理依赖）
pnpm add:yalc

# 4. 如果需要，手动安装依赖（通常不需要）
# pnpm install

# 5. 清理并恢复版本
pnpm remove:yalc
```

---

## 📝 备份文件格式

`.yalc.backup.json` 示例：

```json
{
  "timestamp": "2025-01-20T10:00:00.000Z",
  "dependencies": {
    "@aix/button": "^1.0.0",
    "@aix/theme": "^1.0.0",
    "@aix/hooks": "^1.0.0"
  }
}
```

**字段说明：**
- `timestamp`: 备份创建时间
- `dependencies`: 保存的原始依赖版本（仅保存非 `file:` 协议的版本）

**注意：** 此文件已添加到 `.gitignore`，不会被提交到版本控制。

---

## 💡 最佳实践

### 1. 何时需要备份

**自动备份：**
- `add:yalc` 脚本会自动保存当前依赖版本
- 无需手动执行备份操作

**备份对象：**
- 外部业务项目（有固定的 npm 包版本）
- package.json 中声明了 @aix/* 依赖

**不需要备份：**
- example 项目（不在 package.json 声明依赖）
- 使用源码模式（通过 vite alias）

### 2. 多次切换场景

```bash
# 可以多次切换，不会丢失版本
pnpm add:yalc     # 添加 yalc（自动保存）
pnpm remove:yalc  # 恢复 npm
pnpm add:yalc     # 再次添加 yalc
pnpm remove:yalc  # 再次恢复
```

### 3. 交互式选择技巧

```bash
pnpm add:yalc

# 使用方向键移动
# 使用空格键选择/取消
# 选择"全部"会添加所有可用的包
# 可以选择多个单独的包
```

### 4. 团队协作

建议在项目 README 中说明：

```markdown
## 联调说明

使用 yalc 联调时：

1. 执行 `pnpm add:yalc` 添加依赖（自动保存版本）
2. 完成联调后执行 `pnpm remove:yalc` 清理（自动恢复版本）
3. 不要提交 `.yalc/`、`yalc.lock` 和 `.yalc.backup.json`
```

---

## 🐛 故障排查

### 问题 1: inquirer 报错

**错误：**
```
Cannot find module 'inquirer'
```

**解决：**
```bash
# 确保已安装依赖
pnpm install
```

### 问题 2: 未找到 packages 目录

**错误：**
```
✗ 未找到 packages 目录
```

**原因：** 脚本假设项目在 `apps/example` 目录下，通过 `../..` 访问组件库根目录。

**解决：**
- 外部项目需要修改 `add-yalc.ts` 中的 `AIX_ROOT` 路径
- 或确保组件库在正确的相对位置

### 问题 3: yalc add 失败

**错误：**
```
✗ @aix/button 添加失败
```

**解决：**
```bash
# 确保组件库已发布到 yalc
cd /path/to/aix
pnpm link:publish

# 检查 yalc 存储
yalc installations show
```

---

## 🔗 相关文档

- [Example 项目文档](../README.md)
- [联调工具文档](../../../scripts/link/README.md)

---

**愉快地使用联调工具！** 🎉
