# 项目常量管理

## 📋 概述

为了避免项目名称、数据库前缀等信息散落在多个文件中，项目采用集中管理的方式，所有相关常量统一定义在 `src/constants/project.ts` 文件中。

## 📝 常量定义

```typescript
// src/constants/project.ts
export const PROJECT = {
  // 项目名称
  NAME: 'Base Node Server',           // 显示名称
  NAME_EN: 'base-node-server',        // 英文标识（用于服务名等）
  
  // 数据库名称前缀
  DB_PREFIX: 'base_node',             // 数据库前缀
  
  // 团队信息
  TEAM: {
    NAME: 'Node Team',                // 团队名称
    EMAIL: 'support@example.com',     // 联系邮箱
  },
  
  // API 相关
  API: {
    TITLE: 'Base Node Server API',                    // API 标题
    DESCRIPTION: '配置管理服务 API 文档',              // API 描述
  },
  
  // 文档链接
  DOCS: {
    PORT: 3001,                        // 文档服务端口
    PREFIX: '/local/v1',               // API 前缀
  },
} as const;
```

## 🎯 辅助函数

### getDbName()

生成不同环境的数据库名称：

```typescript
import { getDbName } from './constants/project';

// 开发环境
const devDb = getDbName('dev');      // 'base_node_dev'

// 测试环境
const testDb = getDbName('test');    // 'base_node_test'

// 生产环境
const prodDb = getDbName('prod');    // 'base_node_prod'
```

### getDocsUrl()

生成文档 URL：

```typescript
import { getDocsUrl } from './constants/project';

// Swagger UI
const swaggerUrl = getDocsUrl('/docs');       // 'http://localhost:3001/local/v1/docs'

// ReDoc
const redocUrl = getDocsUrl('/redoc');        // 'http://localhost:3001/local/v1/redoc'
```

## 💡 使用示例

### 在 Swagger 配置中使用

```typescript
// src/config/swagger.ts
import { PROJECT } from '../constants/project';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: PROJECT.API.TITLE,                    // ✅ 使用常量
    version: '1.0.0',
    description: `# ${PROJECT.API.DESCRIPTION}`, // ✅ 使用常量
    contact: {
      name: PROJECT.TEAM.NAME,                   // ✅ 使用常量
      email: PROJECT.TEAM.EMAIL,                 // ✅ 使用常量
    },
  },
};
```

### 在 Logger 中使用

```typescript
// src/utils/logger.ts
import { PROJECT } from '../constants/project';

const winstonLogger = winston.createLogger({
  defaultMeta: {
    service: PROJECT.NAME_EN,  // ✅ 使用常量
    environment: process.env.NODE_ENV || 'development',
  },
});
```

### 在 Docker Compose 中使用

```yaml
# docker-compose.yml
services:
  base-node-server:  # 对应 PROJECT.NAME_EN
    container_name: base-node-server
    # ...
```

## 🔧 修改项目名称

如需修改项目名称，只需在一个地方修改：

### 步骤 1: 更新常量文件

```typescript
// src/constants/project.ts
export const PROJECT = {
  NAME: 'My Awesome Server',        // ✅ 修改这里
  NAME_EN: 'my-awesome-server',     // ✅ 修改这里
  DB_PREFIX: 'my_awesome',          // ✅ 修改这里（如需修改数据库前缀）
  
  TEAM: {
    NAME: 'My Team',                // ✅ 修改这里
    EMAIL: 'support@myteam.com',    // ✅ 修改这里
  },
  
  API: {
    TITLE: 'My Awesome Server API', // ✅ 修改这里
    DESCRIPTION: 'My API Docs',     // ✅ 修改这里
  },
};
```

### 步骤 2: 同步更新相关文件

虽然代码中已使用常量，但部分配置文件仍需手动更新：

1. **`package.json`**:
   ```json
   {
     "name": "my-awesome-server",
     "description": "My Awesome Server"
   }
   ```

2. **`.env` 文件** (如修改了 DB_PREFIX):
   ```bash
   DB_NAME=my_awesome_dev
   ```

3. **`docker-compose.yml`**:
   ```yaml
   services:
     my-awesome-server:
       container_name: my-awesome-server
   ```

4. **文档文件** (`docs/*.md`, `README.md`):
   - 使用全局搜索替换更新所有文档中的项目名称

### 步骤 3: 重新创建数据库

```bash
# 删除旧数据库（谨慎操作！）
psql -U postgres -c "DROP DATABASE base_node_dev;"
psql -U postgres -c "DROP DATABASE base_node_test;"

# 创建新数据库
psql -U postgres -c "CREATE DATABASE my_awesome_dev;"
psql -U postgres -c "CREATE DATABASE my_awesome_test;"
```

## 📊 使用常量的好处

### ✅ 优点

1. **集中管理**: 所有项目相关信息在一个文件中维护
2. **类型安全**: TypeScript 类型检查，避免拼写错误
3. **易于重构**: 修改一处，自动更新所有引用
4. **代码可读性**: 代码中使用语义化的常量名
5. **避免硬编码**: 减少魔法字符串

### ⚠️ 注意事项

1. **环境变量优先**: 运行时配置应优先使用环境变量
2. **文档同步**: 修改常量后记得更新相关文档
3. **数据库迁移**: 修改 DB_PREFIX 需要迁移现有数据
4. **容器名称**: Docker 相关配置需要手动同步

## 📚 相关文件

### 使用了 PROJECT 常量的文件

- `src/config/swagger.ts` - Swagger 配置
- `src/utils/logger.ts` - 日志配置
- `docker-compose.yml` - Docker 配置 (手动同步)
- `package.json` - 项目配置 (手动同步)

### 相关文档

- [数据库配置](./DATABASE.md) - 数据库名称规范
- [快速开始](./QUICKSTART.md) - 环境配置说明
- [架构设计](./ARCHITECTURE.md) - 项目结构说明

## 🔍 查找使用

查找项目中所有使用 PROJECT 常量的地方：

```bash
# 查找所有引用
cd server
grep -r "PROJECT\." --include="*.ts" --include="*.js" src/

# 查找特定常量
grep -r "PROJECT.NAME" --include="*.ts" src/
grep -r "PROJECT.DB_PREFIX" --include="*.ts" src/
```

## 💡 最佳实践

1. **新增配置**: 优先考虑是否应该加入 PROJECT 常量
2. **代码审查**: 确保新代码使用常量而非硬编码
3. **文档更新**: 修改常量后同步更新文档
4. **测试验证**: 修改后运行测试确保无影响

---

**提示**: 这种集中管理模式适用于项目级别的静态配置，运行时配置仍应使用环境变量。
