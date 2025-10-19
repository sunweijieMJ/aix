# AIX 组件库示例项目

这是一个用于演示和测试 AIX Vue 组件库的示例项目，支持源码映射和 Yalc 两种联调模式。

## 🚀 快速开始

```bash
# 安装依赖（在项目根目录）
pnpm install

# 启动示例项目
cd apps/example
pnpm dev
```

访问 http://localhost:5173 查看组件演示

---

## 📦 联调模式

### 模式一：源码映射（默认，推荐开发使用）

**特点：**
- ✅ 支持热更新 (HMR)
- ✅ 修改组件库源码立即生效
- ✅ 无需构建，启动快速
- ✅ 适合日常开发调试

**启动方式：**
```bash
# 方式一：使用默认模式
pnpm dev

# 方式二：显式指定
VITE_LINK_MODE=source pnpm dev

# 或使用快捷脚本
pnpm dev:source
```

**工作原理：**
```typescript
// vite.config.ts 通过 alias 映射到源码目录
alias: {
  '@aix/button': '../../packages/button/src',
  '@aix/theme': '../../packages/theme/src',
  '@aix/hooks': '../../packages/hooks/src',
}
```

**验证热更新：**
1. 保持开发服务器运行
2. 修改 `../../packages/button/src/Button.vue`
3. 观察浏览器自动刷新 ✨

---

### 模式二：Yalc（测试打包产物）

**特点：**
- ✅ 测试真实的打包产物
- ✅ 模拟生产环境
- ✅ 验证发布前的代码
- ⚠️ 修改后需重新构建和推送

**使用步骤：**

**1. 在组件库项目发布到 Yalc**
```bash
# 在项目根目录
cd ../..
pnpm link:publish
# 选择要发布的包（如 @aix/button）
```

**2. 在示例项目添加 Yalc 包**
```bash
cd apps/example
yalc add @aix/button @aix/theme @aix/hooks
pnpm install
```

**3. 启动 Yalc 模式**
```bash
VITE_LINK_MODE=yalc pnpm dev
# 或
pnpm dev:yalc
```

**4. 更新组件库**
```bash
# 在项目根目录
pnpm link:push
# 选择要推送的包
```

**5. 移除 Yalc（切换回源码模式）**
```bash
yalc remove --all
pnpm install
pnpm dev
```

---

## 📂 项目结构

```
apps/example/
├── src/
│   ├── App.vue          # 示例应用主组件
│   └── main.ts          # 应用入口（主题初始化）
├── index.html           # HTML 模板
├── vite.config.ts       # Vite 配置（联调核心）
├── tsconfig.json        # TypeScript 配置
├── package.json         # 项目配置
└── README.md            # 本文档
```

---

## 🎨 示例功能

当前演示页面包含以下内容：

### Button 组件演示
- ✅ 基础按钮（5种类型）
- ✅ 禁用状态
- ✅ 加载状态
- ✅ 不同尺寸（small/medium/large）

### 主题系统
- ✅ 亮色/暗色主题切换
- ✅ 响应式 CSS 变量
- ✅ localStorage 持久化
- ✅ 跟随系统主题

### 联调模式显示
- ✅ 实时显示当前联调模式
- ✅ 使用说明卡片

---

## 🔧 配置说明

### vite.config.ts 核心配置

```typescript
// 联调模式配置
const VITE_LINK_MODE = (process.env.VITE_LINK_MODE || 'source') as 'source' | 'yalc';

// 源码模式：alias 映射
const getAlias = () => {
  if (VITE_LINK_MODE === 'source') {
    return {
      '@aix/button': path.resolve(AIX_ROOT, 'packages/button/src'),
      '@aix/theme': path.resolve(AIX_ROOT, 'packages/theme/src'),
      '@aix/hooks': path.resolve(AIX_ROOT, 'packages/hooks/src'),
    };
  }
  // Yalc 模式：使用 node_modules
  return {};
};

export default defineConfig({
  resolve: { alias: getAlias() },
  optimizeDeps: {
    // 源码模式排除预构建
    exclude: VITE_LINK_MODE === 'source' ? ['@aix/button', '@aix/theme', '@aix/hooks'] : [],
  },
});
```

### package.json 脚本

```json
{
  "scripts": {
    "dev": "vite",                    // 源码模式（默认）
    "dev:source": "VITE_LINK_MODE=source vite",  // 源码模式（显式）
    "dev:yalc": "VITE_LINK_MODE=yalc vite",      // Yalc 模式
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview"
  }
}
```

---

## 🐛 故障排查

### 问题 1: 端口被占用

**现象：**
```
Port 5173 is in use, trying another one...
```

**说明：** 正常现象，Vite 会自动尝试下一个可用端口（5174, 5175...）

---

### 问题 2: 修改组件库代码后页面没有更新

**解决方案：**

1. **确认使用源码模式**
   ```bash
   # 检查控制台输出
   # 应显示：🔗 联调模式: 源码映射 (支持热更新)
   ```

2. **清除 Vite 缓存**
   ```bash
   rm -rf node_modules/.vite
   pnpm dev
   ```

3. **检查 alias 配置**
   ```bash
   # 查看 vite.config.ts 中的 AIX_ROOT 路径是否正确
   ```

---

### 问题 3: Yalc 模式下报错找不到模块

**解决方案：**

1. **确保已发布到 Yalc**
   ```bash
   cd ../..
   pnpm link:publish
   ```

2. **确保已添加依赖**
   ```bash
   yalc add @aix/button @aix/theme @aix/hooks
   pnpm install
   ```

3. **检查 package.json**
   ```json
   {
     "dependencies": {
       "@aix/button": "file:.yalc/@aix+button",
       "@aix/theme": "file:.yalc/@aix+theme"
     }
   }
   ```

---

### 问题 4: TypeScript 报错

**解决方案：**

1. **重启 TypeScript 服务**
   - VSCode: `Cmd/Ctrl + Shift + P` → `Restart TS Server`

2. **检查 tsconfig.json**
   ```json
   {
     "extends": "@kit/typescript-config/base-app.json",
     "include": ["src/**/*", "src/**/*.vue"]
   }
   ```

3. **确保依赖已安装**
   ```bash
   pnpm install
   ```

---

### 问题 5: 样式没有生效

**解决方案：**

1. **检查主题初始化**
   ```typescript
   // src/main.ts 应该有：
   import { createTheme } from '@aix/theme';
   const theme = createTheme();
   app.use(theme.install);
   ```

2. **检查 CSS 变量**
   - 打开浏览器开发者工具
   - 检查 `<html>` 元素的 CSS 变量（--colorPrimary 等）

3. **清除缓存**
   ```bash
   rm -rf node_modules/.vite
   pnpm dev
   ```

---

## 💡 开发技巧

### 1. 快速切换模式

创建 `.env.local` 文件（已在 .gitignore 中）：
```bash
# .env.local
VITE_LINK_MODE=source  # 或 yalc
```

### 2. 调试组件样式

使用浏览器开发者工具：
1. 右键组件 → 检查元素
2. 查看应用的 CSS 变量
3. 实时修改样式测试效果

### 3. 添加新组件示例

编辑 `src/App.vue`：
```vue
<script setup lang="ts">
import { Button, NewComponent } from '@aix/button';
</script>

<template>
  <NewComponent />
</template>
```

### 4. 性能分析

```bash
# 构建分析
pnpm build
pnpm storybook:dev

# 查看构建产物大小
ls -lh dist/assets/
```

---

## 📚 相关文档

- [组件库主 README](../../README.md)
- [联调工具文档](../../scripts/link/README.md)
- [全面评估报告](../../REVIEW_LINKING_SOLUTION.md)

---

## 🎯 下一步

### 开发新组件
1. 在 `packages/` 创建新组件
2. 在本示例项目中引入测试
3. 验证热更新和样式

### 测试打包
1. 切换到 Yalc 模式
2. 验证打包产物功能
3. 检查类型声明文件

### 在业务项目中使用
1. 复制 `vite.config.ts` 配置
2. 根据实际情况修改 AIX_ROOT 路径
3. 享受便捷的联调体验

---

## 🤝 贡献

如需改进示例项目：
1. 添加更多组件演示
2. 优化页面设计
3. 添加交互功能
4. 提交 PR

---

**愉快地开发和测试组件库！** 🎉
