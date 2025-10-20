# 测试指南

本文档介绍如何运行和编写测试。

## 测试框架

项目使用 **Vitest** 作为测试框架，它是一个基于 Vite 的快速单元测试框架。

## 运行测试

### 基本命令

```bash
# 运行所有测试
pnpm test

# 监视模式（自动重新运行测试）
pnpm test:watch

# 生成测试覆盖率报告
pnpm test:coverage
```

### 测试覆盖率

运行 `pnpm test:coverage` 后，会在 `coverage/` 目录生成报告：

- `coverage/index.html` - HTML 格式的覆盖率报告
- `coverage/coverage-final.json` - JSON 格式的覆盖率数据

## 测试结构

```
tests/
├── cache/
│   └── cacheManager.test.ts       # 缓存管理器测试
├── database/
│   └── pgConnection.test.ts       # 数据库连接测试
├── services/
│   └── localConfigService.test.ts # 配置服务测试
└── utils/
    └── errors.test.ts             # 错误处理测试
```

## 测试示例

### 1. 基本单元测试

```typescript
import { describe, it, expect } from 'vitest';

describe('MyFunction', () => {
  it('should return correct result', () => {
    const result = myFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### 2. 异步测试

```typescript
import { describe, it, expect } from 'vitest';

describe('AsyncFunction', () => {
  it('should handle async operations', async () => {
    const result = await asyncFunction();
    expect(result).toBeDefined();
  });
});
```

### 3. Mock 测试

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock 模块
vi.mock('../database', () => ({
  getPostgresAdapter: vi.fn(() => mockAdapter),
}));

describe('ServiceWithDependencies', () => {
  it('should use mocked dependencies', async () => {
    mockAdapter.getData.mockResolvedValue(testData);
    
    const result = await service.fetchData();
    
    expect(mockAdapter.getData).toHaveBeenCalled();
    expect(result).toEqual(testData);
  });
});
```

### 4. 测试生命周期

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('ServiceWithSetup', () => {
  let service: MyService;

  beforeEach(() => {
    // 每个测试前执行
    service = new MyService();
  });

  afterEach(() => {
    // 每个测试后执行
    service.cleanup();
  });

  it('should work correctly', () => {
    expect(service).toBeDefined();
  });
});
```

## 测试覆盖率目标

| 类型 | 目标覆盖率 |
|------|-----------|
| 语句覆盖率 (Statements) | > 80% |
| 分支覆盖率 (Branches) | > 75% |
| 函数覆盖率 (Functions) | > 80% |
| 行覆盖率 (Lines) | > 80% |

## 当前测试覆盖情况

### ConfigService 测试

✅ **已覆盖的功能:**
- `getAll()` - 获取所有配置（含缓存测试）
- `getByPath()` - 根据路径获取配置（含缓存测试）
- `upsert()` - 创建/更新配置（含缓存失效测试）
- `delete()` - 删除配置（含缓存失效测试）
- `update()` - 更新配置
- `clear()` - 清空所有配置

### 数据库层测试

✅ **已覆盖的功能:**
- `initDatabase()` - 数据库初始化
- `transaction()` - 事务处理（成功/失败）
- `checkDatabaseHealth()` - 健康检查
- `closeDatabase()` - 关闭连接

### 缓存测试

✅ **已覆盖的功能:**
- `set()` / `get()` - 基本读写
- `del()` - 删除键
- `has()` - 检查键存在性
- `clear()` - 清空缓存
- `getStats()` - 获取统计信息
- `mset()` / `mget()` / `mdel()` - 批量操作
- TTL 过期测试

## 编写新测试

### 1. 为新服务添加测试

创建 `tests/services/yourService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { YourService } from '../../src/services/yourService';

// Mock dependencies
vi.mock('../../src/database', () => ({
  // ... mock setup
}));

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    service = new YourService();
    vi.clearAllMocks();
  });

  describe('yourMethod', () => {
    it('should do something', async () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = await service.yourMethod(input);
      
      // Assert
      expect(result).toBeDefined();
    });
  });
});
```

### 2. 测试最佳实践

#### AAA 模式（Arrange-Act-Assert）

```typescript
it('should process data correctly', async () => {
  // Arrange - 准备测试数据和mock
  const testData = { id: 1, value: 'test' };
  mockAdapter.getData.mockResolvedValue(testData);
  
  // Act - 执行被测试的功能
  const result = await service.processData(1);
  
  // Assert - 验证结果
  expect(result).toEqual(expectedResult);
  expect(mockAdapter.getData).toHaveBeenCalledWith(1);
});
```

#### 测试边界情况

```typescript
describe('边界情况测试', () => {
  it('should handle empty input', async () => {
    const result = await service.process('');
    expect(result).toBeNull();
  });

  it('should handle null input', async () => {
    const result = await service.process(null);
    expect(result).toBeNull();
  });

  it('should handle large input', async () => {
    const largeInput = 'x'.repeat(10000);
    const result = await service.process(largeInput);
    expect(result).toBeDefined();
  });
});
```

#### 测试错误处理

```typescript
describe('错误处理', () => {
  it('should throw error on invalid input', async () => {
    await expect(service.process('invalid')).rejects.toThrow('Invalid input');
  });

  it('should handle database errors gracefully', async () => {
    mockAdapter.getData.mockRejectedValue(new Error('DB Error'));
    
    await expect(service.getData()).rejects.toThrow('DB Error');
  });
});
```

### 3. Mock 技巧

#### 部分 Mock

```typescript
// 只 mock 特定的方法
vi.spyOn(service, 'internalMethod').mockReturnValue('mocked');
```

#### Mock 实现

```typescript
// 提供完整的 mock 实现
mockAdapter.getData.mockImplementation(async (id) => {
  if (id === 1) return { id: 1, value: 'one' };
  if (id === 2) return { id: 2, value: 'two' };
  return null;
});
```

#### Mock 时间

```typescript
import { vi } from 'vitest';

// 使用假时间
vi.useFakeTimers();
vi.setSystemTime(new Date('2024-01-01'));

// 测试后恢复
vi.useRealTimers();
```

## 持续集成

### GitHub Actions 配置

创建 `.github/workflows/test.yml`:

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'
          
      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
          
      - name: Install dependencies
        run: pnpm install
        
      - name: Run tests
        run: pnpm test:coverage
        
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

## 调试测试

### 1. 使用 VS Code 调试

添加 `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Vitest Tests",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["test"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### 2. 只运行特定测试

```typescript
// 只运行这个测试
it.only('should test this specific case', () => {
  // ...
});

// 跳过这个测试
it.skip('should skip this test', () => {
  // ...
});
```

### 3. 查看详细输出

```bash
# 显示每个测试的详细信息
pnpm test -- --reporter=verbose

# 显示失败测试的详细堆栈
pnpm test -- --reporter=verbose --no-coverage
```

## 性能测试

虽然我们主要关注单元测试，但也可以添加简单的性能测试：

```typescript
import { describe, it, expect } from 'vitest';

describe('Performance Tests', () => {
  it('should complete within reasonable time', async () => {
    const startTime = Date.now();
    
    await heavyOperation();
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // 应该在1秒内完成
  });
});
```

## 常见问题

### Q: 测试运行很慢怎么办？

A: 
1. 使用 `pnpm test -- --run` 而不是 watch 模式
2. 确保正确清理资源（关闭数据库连接等）
3. 使用 mock 代替真实的外部服务调用

### Q: Mock 没有生效？

A: 
1. 确保 mock 在导入被测试模块之前
2. 检查 mock 的路径是否正确
3. 使用 `vi.clearAllMocks()` 清理之前的 mock

### Q: 如何测试私有方法？

A: 
1. 不要直接测试私有方法
2. 通过公共方法间接测试私有方法
3. 如果必须测试，可以考虑将其设为 protected 或提取到单独的工具函数

## 参考资源

- [Vitest 文档](https://vitest.dev/)
- [测试驱动开发 (TDD)](https://en.wikipedia.org/wiki/Test-driven_development)
- [单元测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
