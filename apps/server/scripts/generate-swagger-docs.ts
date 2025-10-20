#!/usr/bin/env tsx
/**
 * 生成 OpenAPI YAML 文档
 *
 * 功能：
 * 1. 生成 OpenAPI 3.0 规范 YAML 文件
 * 2. 输出到 docs 目录
 *
 * 使用方法：
 * pnpm run docs:generate
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dump as yamlDump } from 'js-yaml';
import { generateSwaggerSpec } from '../src/config/swagger';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 项目根目录
const projectRoot = path.resolve(__dirname, '..');
const docsDir = path.join(projectRoot, 'docs');

/**
 * 确保目录存在
 */
function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ 创建目录: ${dir}`);
  }
}

/**
 * 生成 OpenAPI 规范文件
 */
function generateOpenAPISpec() {
  console.log('📝 生成 OpenAPI 规范...');
  const spec = generateSwaggerSpec();
  const specPath = path.join(docsDir, 'openapi.yaml');

  // 生成 YAML 格式的文档
  const yamlContent = yamlDump(spec, {
    indent: 2,
    lineWidth: -1, // 不自动换行
    sortKeys: false, // 保持原始顺序
  });

  fs.writeFileSync(specPath, yamlContent, 'utf-8');
  console.log(`✓ OpenAPI 规范已生成: ${specPath}`);

  return spec;
}

/**
 * 生成简单的 README 文档
 */
function generateReadme(spec: any) {
  console.log('📄 生成 README...');

  const readmeContent = `# ${spec.info.title}

> ${spec.info.description.split('\n')[0]}

## 版本

- API 版本: ${spec.info.version}
- 生成时间: ${new Date().toLocaleString('zh-CN')}

## 文档说明

### 在线查看

可以使用以下工具预览 \`openapi.yaml\` 文件：

- [Swagger Editor](https://editor.swagger.io/) - 在线编辑器，支持实时预览
- [Redoc](https://redocly.github.io/redoc/) - 美观的文档展示
- VS Code + OpenAPI 扩展

### 文件说明

- **openapi.yaml** - OpenAPI 3.0 规范文件（YAML格式）
- **README.md** - 本说明文档

### 使用方法

1. **在线预览**
   \`\`\`bash
   # 访问 Swagger Editor
   # 1. 打开 https://editor.swagger.io/
   # 2. File -> Import File -> 选择 openapi.yaml

   # 或者使用 Redoc CLI 本地预览
   npm install -g redoc-cli
   redoc-cli serve docs/openapi.yaml
   \`\`\`

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
   - 先调用 \`POST /auth/login\` 获取 token
   - 在后续请求头中添加: \`Authorization: Bearer <token>\`
   - Token 默认有效期 24 小时

## API 服务器地址

${spec.servers.map((server: any) => `- ${server.description}: ${server.url}`).join('\n')}

## API 标签

${spec.tags.map((tag: any) => `- **${tag.name}**: ${tag.description}`).join('\n')}

## 联系方式

${spec.info.contact ? `- 团队: ${spec.info.contact.name}\n- 邮箱: ${spec.info.contact.email}` : ''}

## 许可证

${spec.info.license ? `[${spec.info.license.name}](${spec.info.license.url})` : 'MIT'}

---

*此文档由 \`pnpm run docs:generate\` 自动生成*
`;

  const readmePath = path.join(docsDir, 'README.md');
  fs.writeFileSync(readmePath, readmeContent, 'utf-8');
  console.log(`✓ README 已生成: ${readmePath}`);
}

/**
 * 主函数
 */
function main() {
  console.log('🚀 开始生成 OpenAPI 文档...\n');

  try {
    // 1. 确保 docs 目录存在
    ensureDir(docsDir);

    // 2. 生成 OpenAPI 规范
    const spec = generateOpenAPISpec();

    // 3. 生成 README
    generateReadme(spec);

    console.log('\n✅ 文档生成完成！');
    console.log('\n📖 查看文档:');
    console.log(`   - OpenAPI 规范: ${path.join(docsDir, 'openapi.yaml')}`);
    console.log(`   - 说明文档: ${path.join(docsDir, 'README.md')}`);
    console.log('\n💡 提示: 可以使用 Swagger Editor (https://editor.swagger.io/) 在线预览文档');
  } catch (error) {
    console.error('❌ 生成文档失败:', error);
    process.exit(1);
  }
}

// 执行
main();
