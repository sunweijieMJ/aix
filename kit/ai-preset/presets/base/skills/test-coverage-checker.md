---
id: skills/test-coverage-checker
title: test-coverage-checker
description: 自动检查测试覆盖率是否达标,列出覆盖率不足的文件,并可选自动生成测试模板
resourceType: skill
layer: base
priority: 300
platforms: [claude]
tags: [skill, testing, quality]
version: "1.0.0"
skillMeta:
  license: MIT
  compatibility: "Requires Vitest, Vue Test Utils"
  author: vue-h5-template
  category: quality
---

# 测试覆盖率检查 Skill

## 功能概述

自动运行测试覆盖率检查,对比项目 80% 覆盖率目标,列出覆盖率不足的文件,并可选自动生成测试模板。

## 使用方式

### 基本用法

```bash
# 方式 1: 检查全局覆盖率
/test-coverage-checker

# 方式 2: 检查指定目录
/test-coverage-checker src/components/

# 方式 3: 检查指定文件
/test-coverage-checker src/components/UserCard/index.vue
```

### 高级用法

```bash
# 自动生成缺失的测试
/test-coverage-checker --auto-generate

# 只显示覆盖率不足的文件
/test-coverage-checker --only-insufficient

# 生成详细报告
/test-coverage-checker --detailed-report

# 设置自定义阈值
/test-coverage-checker --threshold 85
```

## 执行流程

### 步骤 1: 运行测试覆盖率

运行 Vitest 测试覆盖率:

```
🧪 运行测试覆盖率检查...

   ⏳ 执行 pnpm test:coverage...

   ✓ 测试完成!

   📊 总体覆盖率:
   - Statements: 78.5% (目标: 80%)
   - Branches: 75.2% (目标: 80%)
   - Functions: 82.1% (目标: 80%)
   - Lines: 79.3% (目标: 80%)

   ⚠️ 警告: 部分指标未达到 80% 目标
```

### 步骤 2: 分析覆盖率不足的文件

```
🔍 分析覆盖率不足的文件...

   📂 覆盖率不足的文件 (12 个):

   ❌ 严重不足 (< 50%):
      src/components/ProductCard/index.vue
         - Statements: 35.2%
         - Branches: 28.5%
         - Functions: 40.0%
         - Lines: 36.8%
         📝 缺少测试: Props 验证、事件触发、快照测试

      src/views/order/detail.vue
         - Statements: 42.1%
         - Branches: 38.9%
         - Functions: 45.2%
         - Lines: 43.5%
         📝 缺少测试: 页面加载、API 调用、错误处理

   ⚠️ 需要改进 (50-80%):
      src/components/UserForm/index.vue
         - Statements: 68.5%
         - Branches: 62.3%
         - Functions: 72.1%
         - Lines: 69.8%
         📝 缺少测试: 表单验证、边界情况

      src/store/modules/product.ts
         - Statements: 72.3%
         - Branches: 68.5%
         - Functions: 75.0%
         - Lines: 73.2%
         📝 缺少测试: 错误处理、状态重置

      ... (其他 8 个文件)

   ✅ 已达标但可优化 (80-90%):
      src/utils/format.ts
         - Statements: 85.2%
         - Branches: 82.1%
         - Functions: 88.5%
         - Lines: 86.3%
         💡 建议: 增加边界情况测试
```

### 步骤 3: 生成测试建议

```
💡 测试改进建议:

   优先级 1 - 高 (严重不足):
      1. src/components/ProductCard/index.vue
         建议添加:
         - Props 默认值测试
         - 事件触发测试 (click, hover)
         - 快照测试
         - 条件渲染测试 (v-if, v-show)

      2. src/views/order/detail.vue
         建议添加:
         - 页面初始化测试
         - API 调用 Mock 测试
         - Loading 状态测试
         - 错误处理测试

   优先级 2 - 中 (需要改进):
      3. src/components/UserForm/index.vue
         建议添加:
         - 表单验证规则测试
         - 边界情况测试 (空值、特殊字符)
         - 提交成功/失败场景测试

      4. src/store/modules/product.ts
         建议添加:
         - Action 错误处理测试
         - State 重置测试
         - 并发请求测试

   优先级 3 - 低 (优化):
      5-12. ... (其他文件)
```

### 步骤 4: 自动生成测试 (使用 --auto-generate)

**重要**: 使用 `--auto-generate` 选项时，会自动为覆盖率不足的文件生成测试模板。

```
🎨 生成测试文件...

   ⏳ 分析覆盖率不足的文件...
   ✓ 找到 12 个需要生成测试的文件

   📂 生成测试模板:

   tests/components/ProductCard.test.ts (新增)
   ├─ ✓ Props 测试 (3 个用例)
   ├─ ✓ 事件测试 (2 个用例)
   ├─ ✓ 快照测试 (1 个用例)
   └─ ✓ 条件渲染测试 (2 个用例)

   tests/views/order/detail.test.ts (新增)
   ├─ ✓ 页面初始化测试 (2 个用例)
   ├─ ✓ API 调用 Mock 测试 (3 个用例)
   ├─ ✓ Loading 状态测试 (2 个用例)
   └─ ✓ 错误处理测试 (2 个用例)

   tests/components/UserForm.test.ts (扩展现有测试)
   ├─ ✓ 表单验证测试 (4 个用例)
   └─ ✓ 边界情况测试 (3 个用例)

   tests/store/modules/product.test.ts (扩展现有测试)
   ├─ ✓ Action 错误处理测试 (3 个用例)
   ├─ ✓ State 重置测试 (2 个用例)
   └─ ✓ 并发请求测试 (2 个用例)

   ... (其他 8 个文件)

   📊 统计:
   - 新增测试文件: 2 个
   - 扩展现有测试: 10 个
   - 生成测试用例: 48 个
   - 预计覆盖率提升: +12.5%
```

#### 生成的测试模板示例

**Vue 组件测试** (tests/components/ProductCard.test.ts):

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ProductCard from '@/components/ProductCard/index.vue';
import type { ProductCardProps } from '@/components/ProductCard/types';

describe('ProductCard', () => {
  // Props 测试
  describe('Props', () => {
    it('should render with default props', () => {
      const wrapper = mount(ProductCard);
      expect(wrapper.exists()).toBe(true);
    });

    it('should render title prop correctly', () => {
      const wrapper = mount(ProductCard, {
        props: { title: 'Test Product' } as ProductCardProps,
      });
      expect(wrapper.text()).toContain('Test Product');
    });

    it('should handle disabled prop', () => {
      const wrapper = mount(ProductCard, {
        props: { disabled: true } as ProductCardProps,
      });
      expect(wrapper.classes()).toContain('product-card--disabled');
    });
  });

  // 事件测试
  describe('Events', () => {
    it('should emit click event', async () => {
      const wrapper = mount(ProductCard);
      await wrapper.trigger('click');
      expect(wrapper.emitted('click')).toBeTruthy();
    });

    it('should not emit click when disabled', async () => {
      const wrapper = mount(ProductCard, {
        props: { disabled: true } as ProductCardProps,
      });
      await wrapper.trigger('click');
      expect(wrapper.emitted('click')).toBeFalsy();
    });
  });

  // 快照测试
  describe('Snapshot', () => {
    it('should match snapshot', () => {
      const wrapper = mount(ProductCard, {
        props: {
          title: 'Test Product',
          showActions: true,
        } as ProductCardProps,
      });
      expect(wrapper.html()).toMatchSnapshot();
    });
  });

  // 条件渲染测试
  describe('Conditional Rendering', () => {
    it('should show actions when showActions is true', () => {
      const wrapper = mount(ProductCard, {
        props: { showActions: true } as ProductCardProps,
      });
      expect(wrapper.find('.product-card__actions').exists()).toBe(true);
    });

    it('should hide actions when showActions is false', () => {
      const wrapper = mount(ProductCard, {
        props: { showActions: false } as ProductCardProps,
      });
      expect(wrapper.find('.product-card__actions').exists()).toBe(false);
    });
  });
});
```

**Store 测试** (tests/store/modules/product.test.ts):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useProductStore } from '@/store/modules/product';
import * as api from '@/api';

vi.mock('@/api');

describe('useProductStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  // Action 错误处理测试
  describe('Error Handling', () => {
    it('should handle fetchProductList error', async () => {
      const store = useProductStore();
      const error = new Error('Network error');

      vi.mocked(api.getProductList).mockRejectedValueOnce(error);

      await expect(store.fetchProductList()).rejects.toThrow('Network error');
      expect(store.error).toBe(error);
      expect(store.loading).toBe(false);
    });

    it('should handle fetchProductById error', async () => {
      const store = useProductStore();
      const error = new Error('Product not found');

      vi.mocked(api.getProductById).mockRejectedValueOnce(error);

      await expect(store.fetchProductById('123')).rejects.toThrow(
        'Product not found'
      );
      expect(store.error).toBe(error);
    });
  });

  // State 重置测试
  describe('State Reset', () => {
    it('should reset state to initial values', async () => {
      const store = useProductStore();

      // 设置一些数据
      store.productList = [{ id: '1', name: 'Product 1' }];
      store.total = 10;
      store.loading = true;

      // 重置
      store.$reset();

      // 验证
      expect(store.productList).toEqual([]);
      expect(store.total).toBe(0);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });
  });

  // 并发请求测试
  describe('Concurrent Requests', () => {
    it('should handle multiple concurrent requests', async () => {
      const store = useProductStore();

      vi.mocked(api.getProductList).mockResolvedValue({
        data: [{ id: '1', name: 'Product 1' }],
        total: 1,
      });

      // 发起多个并发请求
      const promises = [
        store.fetchProductList(),
        store.fetchProductList(),
        store.fetchProductList(),
      ];

      await Promise.all(promises);

      // 验证最终状态
      expect(store.productList).toHaveLength(1);
      expect(store.loading).toBe(false);
    });
  });
});
```

### 步骤 5: 生成详细报告

```
✅ 测试覆盖率检查完成!
─────────────────────────────────────────

📄 详细报告 (2025-11-16 15:30:00)

1️⃣ 总体覆盖率
   - Statements: 78.5% ⚠️ (目标 80%)
   - Branches: 75.2% ❌ (目标 80%)
   - Functions: 82.1% ✅ (目标 80%)
   - Lines: 79.3% ⚠️ (目标 80%)

   📈 与上次对比:
   - Statements: +2.3%
   - Branches: +1.8%
   - Functions: +3.5%
   - Lines: +2.6%

2️⃣ 文件分类统计
   - ✅ 达标 (≥80%): 123 个文件 (82.5%)
   - ⚠️ 需改进 (50-80%): 10 个文件 (6.7%)
   - ❌ 严重不足 (<50%): 2 个文件 (1.3%)
   - 🚫 未测试: 14 个文件 (9.4%)

3️⃣ 模块覆盖率
   | 模块 | 覆盖率 | 状态 |
   |------|--------|------|
   | src/components/ | 75.2% | ⚠️ 需改进 |
   | src/views/ | 72.8% | ⚠️ 需改进 |
   | src/store/ | 85.3% | ✅ 达标 |
   | src/utils/ | 92.1% | ✅ 优秀 |
   | src/api/ | 88.5% | ✅ 达标 |
   | src/router/ | 90.2% | ✅ 优秀 |

4️⃣ 优先级任务
   - 高优先级: 2 个文件 (严重不足)
   - 中优先级: 10 个文件 (需改进)
   - 低优先级: 14 个文件 (未测试)

─────────────────────────────────────────

💡 下一步建议:
   1. 优先修复严重不足的文件 (< 50%)
   2. 运行 /test-coverage-checker --auto-generate 生成测试模板
   3. 手动补充复杂场景测试
   4. 定期检查覆盖率趋势

🔗 相关文档:
   - tests/README.md
   - @testing 测试策略和规范
   - vitest.config.ts 测试配置
```

## 覆盖率阈值配置

### vitest.config.ts

项目默认配置 80% 覆盖率阈值:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### 自定义阈值

```bash
# 使用更严格的阈值
/test-coverage-checker --threshold 85

# 使用更宽松的阈值 (不推荐)
/test-coverage-checker --threshold 70
```

## 工作流程图

```
┌─────────────────────────────────────────┐
│ 1. 运行 pnpm test:coverage              │
│    - 执行所有测试                        │
│    - 生成覆盖率报告                      │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│ 2. 分析覆盖率数据                        │
│    - 对比 80% 阈值                       │
│    - 分类文件 (达标/需改进/严重不足)     │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│ 3. 生成测试建议                          │
│    - 分析缺失的测试类型                  │
│    - 按优先级排序                        │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│ 4. 自动生成测试 (--auto-generate)       │
│    - 分析覆盖率不足的文件                │
│    - 生成测试模板                        │
└────────────┬────────────────────────────┘
             ▼
┌─────────────────────────────────────────┐
│ 5. 生成详细报告                          │
│    - 总体覆盖率                          │
│    - 文件分类统计                        │
│    - 模块覆盖率                          │
└─────────────────────────────────────────┘
```

## 覆盖率分析算法

### 文件分类标准

```typescript
interface CoverageLevel {
  严重不足: '< 50%',
  需要改进: '50% - 80%',
  已达标: '80% - 90%',
  优秀: '≥ 90%',
}

// 综合评分算法
function calculateScore(coverage: Coverage): number {
  const weights = {
    statements: 0.3,
    branches: 0.3,
    functions: 0.2,
    lines: 0.2,
  };

  return (
    coverage.statements * weights.statements +
    coverage.branches * weights.branches +
    coverage.functions * weights.functions +
    coverage.lines * weights.lines
  );
}
```

### 测试建议生成

基于覆盖率数据分析缺失的测试类型:

| 覆盖率指标 | 缺失测试类型 |
|-----------|-------------|
| **Statements 低** | 未执行的代码路径、条件分支 |
| **Branches 低** | if/else 分支、三元表达式、逻辑运算 |
| **Functions 低** | 未调用的函数、方法 |
| **Lines 低** | 未覆盖的代码行 |

## 与其他 Skills 配合

### 1. 覆盖率检查 + 测试生成

```bash
# 步骤 1: 检查覆盖率
/test-coverage-checker

# 步骤 2: 自动生成测试
/test-coverage-checker --auto-generate

# 步骤 3: 手动补充复杂测试
# 编辑生成的测试文件

# 步骤 4: 再次检查
/test-coverage-checker
```

### 2. 提交前检查

```bash
# 完整的代码质量检查流程
pnpm type-check              # TypeScript 类型检查
pnpm lint                    # ESLint 代码检查
/test-coverage-checker         # 测试覆盖率检查
pnpm test                    # 运行测试
pnpm commit                  # 提交代码
```

### 3. CI/CD 集成建议

```yaml
# .github/workflows/test.yml
name: Test Coverage

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: pnpm install
      - name: Run tests with coverage
        run: pnpm test:coverage
      - name: Check coverage threshold
        run: |
          # 检查是否达到 80% 阈值
          # 如果不达标,CI 失败
```

## 最佳实践

### 1. 定期检查覆盖率

```bash
# 每周运行一次
/test-coverage-checker --detailed-report

# 每次提交前
/test-coverage-checker --only-insufficient
```

### 2. 优先修复严重不足的文件

```bash
# 步骤 1: 找出严重不足的文件
/test-coverage-checker --only-insufficient

# 步骤 2: 自动生成测试模板
/test-coverage-checker --auto-generate

# 步骤 3: 手动补充复杂测试
# 编辑生成的测试文件，添加业务逻辑测试

# 步骤 4: 验证改进
/test-coverage-checker
```

### 3. 追踪覆盖率趋势

```bash
# 定期保存覆盖率报告
/test-coverage-checker --detailed-report > coverage-reports/$(date +%Y-%m-%d).txt

# 对比历史数据
diff coverage-reports/2025-11-01.txt coverage-reports/2025-11-16.txt
```

## 错误处理

### 场景 1: 测试运行失败

```
❌ 错误: 测试运行失败
   失败的测试: 5 个

💡 解决方案:
   1. 先修复失败的测试: pnpm test
   2. 再检查覆盖率: /test-coverage-checker
```

### 场景 2: 覆盖率数据不准确

```
⚠️ 警告: 覆盖率数据可能不准确
   原因: 部分文件未被测试框架识别

💡 解决方案:
   1. 检查 vitest.config.ts 配置
   2. 确保测试文件命名正确 (*.test.ts)
   3. 清除缓存: pnpm test --clearCache
```

## 常见问题

### Q1: 为什么我的覆盖率一直上不去？

**A:** 常见原因:
1. 缺少边界情况测试
2. 缺少错误处理测试
3. 缺少条件分支测试 (if/else)
4. 未测试组件的所有状态

**解决方案**:
```bash
/test-coverage-checker --detailed-report
# 查看详细报告,找出缺失的测试类型
```

### Q2: 80% 覆盖率是强制的吗？

**A:**
- **项目配置**: vitest.config.ts 中设置为 80%
- **CI/CD**: 如果配置了 CI,未达标会导致构建失败
- **建议**: 保持 80% 以上,确保代码质量

### Q3: 如何提高分支覆盖率 (Branches)?

**A:** 分支覆盖率关注条件语句:
```typescript
// 示例: 测试所有分支
function getUserStatus(user: User) {
  if (user.isActive) {  // 需要测试 true 和 false
    return 'active';
  } else {
    return 'inactive';
  }
}

// 测试
it('should return active for active user', () => {
  expect(getUserStatus({ isActive: true })).toBe('active');
});

it('should return inactive for inactive user', () => {
  expect(getUserStatus({ isActive: false })).toBe('inactive');
});
```

### Q4: 自动生成的测试质量如何？

**A:**
- 自动生成的测试是**模板**,覆盖基础场景
- 需要**手动补充**复杂场景、业务逻辑测试
- 可以作为起点,快速提升覆盖率

## 相关文档

- [testing.md](../../agents/testing.md) - 测试策略和规范
- [coding-standards.md](../../agents/coding-standards.md) - 编码规范 (测试代码)
- [component-development.md](../../agents/component-development.md) - 组件开发规范 (组件测试)
- [tests/README.md](../../../tests/README.md) - 测试框架配置
- [vitest.config.ts](../../../vitest.config.ts) - Vitest 配置文件

## 示例工作流

### 场景: 提升项目测试覆盖率到 80%

```bash
# 步骤 1: 检查当前覆盖率
/test-coverage-checker

# 输出:
# 总体覆盖率: 72.5% (未达标)
# 覆盖率不足的文件: 18 个

# 步骤 2: 自动生成测试模板
/test-coverage-checker --auto-generate

# 输出:
# 已生成 18 个测试文件

# 步骤 3: 手动补充复杂测试
# 编辑 tests/components/ProductCard.test.ts
# 添加业务逻辑测试、边界情况测试

# 步骤 4: 运行测试
pnpm test

# 步骤 5: 再次检查覆盖率
/test-coverage-checker

# 输出:
# 总体覆盖率: 82.3% ✅ (达标)
# 覆盖率不足的文件: 5 个

# 步骤 6: 提交代码
git add tests/
git commit -m "test: improve test coverage to 82.3%"
```

---

**提示**: 这个 Skill 是项目质量保障的重要工具,建议定期使用,确保测试覆盖率始终达标！
