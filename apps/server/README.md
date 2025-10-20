# Base Node Server

一个基于 Koa.js + TypeScript 的现代化后端服务，提供配置管理、JWT 认证、双缓存支持（Memory/Redis）和完整的监控系统。

[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## ✨ 核心特性

- 🚀 **高性能**: Koa.js + TypeScript，极速响应
- 🔐 **JWT 认证**: 完整的用户认证和授权系统
- 📝 **配置管理**: 灵活的 JSON 配置存储和检索
- 💾 **双缓存支持**: Memory/Redis 灵活切换
- 📊 **PostgreSQL**: 可靠的关系型数据库
- 📈 **Prometheus 监控**: 完整的性能指标采集
- 📚 **Swagger 文档**: 标准 OpenAPI 3.0 规范
- 🧪 **完整测试**: 121 个单元测试全覆盖
- 🐳 **Docker 就绪**: 一键容器化部署

## 🚀 快速开始

### 安装并启动

```bash
# 1. 安装依赖
pnpm install

# 2. 启动服务
pnpm start

# 3. 查看 API 文档
# 使用 Swagger Editor 预览 YAML 文档：
# 打开 https://editor.swagger.io/ 并导入 docs/openapi.yaml
```

### 运行测试

```bash
pnpm test
```

**详细步骤**: 查看 [快速开始指南](./docs/QUICKSTART.md)

## 📚 文档导航

### API 文档
- 📋 [OpenAPI 规范](./docs/openapi.yaml) - OpenAPI 3.0 YAML 格式（可用 Swagger Editor 预览）
- 📖 [API 文档编写规范](./docs/API_DOCUMENTATION_GUIDE.md) - Swagger 注释规范和文档化原则

### 入门文档
- 📖 [快速开始](./docs/QUICKSTART.md) - 5分钟快速上手
- 🗄️ [数据库配置](./docs/DATABASE.md) - 数据库设置指南
- 🏗️ [架构设计](./docs/ARCHITECTURE.md) - 系统架构详解

### 进阶配置
- 🔐 [认证配置](./docs/AUTH.md) - JWT 认证详解
- 💾 [Redis 缓存](./docs/REDIS.md) - 分布式缓存配置
- 📊 [监控配置](./docs/MONITORING.md) - Prometheus + Grafana

### 开发指南
- 🧪 [测试指南](./docs/TESTING.md) - 单元测试和集成测试
- 🔧 [故障排查](./docs/TROUBLESHOOTING.md) - 常见问题解决
- 📊 [项目常量](./docs/PROJECT_CONSTANTS.md) - 错误码和常量定义

## 🛠️ 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| **运行时** | Node.js 22+ | JavaScript 运行环境 |
| **语言** | TypeScript 5.7 | 类型安全的 JavaScript |
| **框架** | Koa.js 2.16 | 轻量级 Web 框架 |
| **数据库** | PostgreSQL | 关系型数据库 |
| **缓存** | Memory / Redis | 双缓存支持 |
| **认证** | JWT | JSON Web Token |
| **测试** | Vitest | 现代测试框架 |
| **文档** | Swagger | OpenAPI 3.0 |
| **监控** | Prometheus | 指标采集 |

## 📊 项目状态

```
✅ 测试通过: 121/121 (100%)
✅ 测试文件: 8/8
✅ 代码覆盖: 核心模块全覆盖
✅ 类型检查: 严格模式
✅ ESM 支持: 完全兼容
```

## 🔧 环境变量

### 核心配置

```bash
  NODE_ENV=development          # 环境：development/test/production
  PORT=3001                     # 服务端口
  DB_NAME=base_node_dev         # 数据库名称（base_node_{dev|test|prod}）
  CACHE_TYPE=memory             # 缓存类型：memory/redis
  JWT_SECRET=your-secret-key    # JWT 密钥（生产必改）
```

### 完整配置

查看各环境的详细配置：
- 开发环境: `.env.development`
- 测试环境: `.env.test`
- 生产环境: `.env.production`

**配置说明**: 查看 [快速开始 - 环境变量](./docs/QUICKSTART.md#⚙️-环境变量配置)

## 📂 项目结构

```
server/
├── src/                    # 源代码
│   ├── auth/              # 认证模块
│   ├── cache/             # 缓存模块
│   ├── config/            # 配置管理
│   ├── database/          # 数据库层
│   ├── middleware/        # 中间件
│   ├── monitoring/        # 监控模块
│   ├── routes/            # 路由定义
│   ├── services/          # 业务逻辑
│   ├── types/             # 类型定义
│   └── utils/             # 工具函数
├── tests/                 # 测试文件
├── docs/                  # 文档目录
│   ├── openapi.yaml       # OpenAPI 3.0 规范（YAML格式）
│   ├── README.md          # 文档说明
│   ├── API_DOCUMENTATION_GUIDE.md  # API 文档编写规范
│   ├── QUICKSTART.md      # 快速开始
│   ├── ARCHITECTURE.md    # 架构设计
│   ├── AUTH.md            # 认证授权
│   ├── DATABASE.md        # 数据库配置
│   ├── REDIS.md           # Redis 配置
│   ├── MONITORING.md      # 监控配置
│   ├── TESTING.md         # 测试指南
│   ├── PROJECT_CONSTANTS.md  # 项目常量
│   └── TROUBLESHOOTING.md # 故障排查
└── README.md              # 项目说明（本文件）
```

## 🐳 Docker 部署

### 快速启动

```bash
# 使用 Docker Compose（包含 PostgreSQL 和 Redis）
docker-compose up -d

# 单独构建
docker build -t base-node-server .
docker run -d -p 3001:3001 base-node-server
```

### Kubernetes

```bash
# 部署到 K8s
kubectl apply -f deploy/k8s/
```

**详细说明**: 查看 [快速开始 - Docker 部署](./docs/QUICKSTART.md#🐳-docker-快速启动)

## 📈 API 示例

### 用户认证

```bash
# 注册
curl -X POST http://localhost:3001/local/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@example.com","password":"Admin123!"}'

# 登录
curl -X POST http://localhost:3001/local/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123!"}'
```

### 配置管理

```bash
# 创建配置（需要 token）
curl -X PUT http://localhost:3001/local/v1/config/app.theme \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value":{"color":"blue","mode":"dark"}}'

# 获取配置
curl http://localhost:3001/local/v1/config/app.theme \
  -H "Authorization: Bearer <token>"
```

**更多示例**: 使用 [Swagger Editor](https://editor.swagger.io/) 导入 `./docs/openapi.yaml` 查看完整 API 文档

## 🎯 使用场景

- ✅ 微服务配置中心
- ✅ 多租户 SaaS 配置管理
- ✅ 低代码平台后端服务
- ✅ 移动应用配置服务
- ✅ IoT 设备配置管理

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 代码规范

- 遵循 TypeScript 严格模式
- 使用 ESLint + Prettier
- 编写单元测试
- 更新相关文档

## 📄 License

本项目采用 [MIT](LICENSE) 许可证。

## 🔗 相关链接

- [OpenAPI 规范](./docs/openapi.yaml) - OpenAPI 3.0 YAML 规范文件
- [架构图](./docs/ARCHITECTURE.md) - 系统架构

## 💬 获取帮助

- 📖 查看 [文档](./docs/)
- 🐛 提交 [Issue](../../issues)
- 💡 查看 [FAQ](./docs/TROUBLESHOOTING.md)

---

**快速链接**: [快速开始](./docs/QUICKSTART.md) | [OpenAPI 规范](./docs/openapi.yaml) | [架构设计](./docs/ARCHITECTURE.md) | [Redis 配置](./docs/REDIS.md)
