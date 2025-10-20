# Base Node Server API

> 配置管理服务 API 文档

## 版本

- API 版本: 1.0.0
- 生成时间: 2025/10/20 16:58:45

## 文档说明

### 在线查看

可以使用以下工具预览 `openapi.yaml` 文件：

- [Swagger Editor](https://editor.swagger.io/) - 在线编辑器，支持实时预览
- [Redoc](https://redocly.github.io/redoc/) - 美观的文档展示
- VS Code + OpenAPI 扩展

### 文件说明

- **openapi.yaml** - OpenAPI 3.0 规范文件（YAML格式）
- **README.md** - 本说明文档

### 使用方法

1. **在线预览**
   ```bash
   # 访问 Swagger Editor
   # 1. 打开 https://editor.swagger.io/
   # 2. File -> Import File -> 选择 openapi.yaml

   # 或者使用 Redoc CLI 本地预览
   npm install -g redoc-cli
   redoc-cli serve docs/openapi.yaml
   ```

2. **本地开发工具**

   推荐 VS Code 扩展：
   - **Swagger Viewer** - 预览 OpenAPI 文档
   - **OpenAPI (Swagger) Editor** - 编辑和验证
   - **YAML** - YAML 语法高亮

3. **API 测试**

   可以使用以下工具测试 API：
   - **Postman** - 导入 OpenAPI 文件创建集合
   - **Insomnia** - 支持 OpenAPI 导入
   - **curl** - 命令行测试
   - **Thunder Client** (VS Code 扩展)

4. **认证授权**

   大部分 API 需要 JWT 认证：
   - 先调用 `POST /auth/login` 获取 token
   - 在后续请求头中添加: `Authorization: Bearer <token>`
   - Token 默认有效期 24 小时

## API 服务器地址

- 本地开发服务器: http://localhost:3001/local/v1
- 本地网络服务器: http://0.0.0.0:3001/local/v1

## API 标签

- **Auth**: 认证授权 - 用户登录、注册、token管理
- **Config**: 配置管理 - 提供配置的增删改查操作

## 联系方式

- 团队: Node Team
- 邮箱: support@example.com

## 许可证

[MIT](https://opensource.org/licenses/MIT)

---

*此文档由 `pnpm run docs:generate` 自动生成*
