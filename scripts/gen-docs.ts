import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parse } from 'vue-docgen-api';

/**
 * 生成组件 API 文档
 */
async function generateDocs() {
  console.log('🚀 开始生成组件文档...\n');

  // 查找所有组件包
  const packages = await glob('packages/*/src/*.vue', {
    ignore: ['**/node_modules/**', '**/dist/**'],
  });

  for (const componentPath of packages) {
    try {
      // 解析组件
      const componentInfo = await parse(componentPath);
      const componentName =
        componentInfo.displayName || path.basename(componentPath, '.vue');
      const packageName = path.basename(
        path.dirname(path.dirname(componentPath)),
      );

      console.log(`📝 生成 ${componentName} 文档...`);

      // 生成 Markdown 文档
      const markdown = generateMarkdown(
        componentInfo,
        componentName,
        packageName,
      );

      // 写入 API.md
      const docPath = path.join(
        path.dirname(path.dirname(componentPath)),
        'docs',
        'API.md',
      );

      // 确保目录存在
      fs.mkdirSync(path.dirname(docPath), { recursive: true });

      // 写入文件
      fs.writeFileSync(docPath, markdown, 'utf-8');

      console.log(`✅ ${componentName} 文档已生成: ${docPath}\n`);
    } catch (error) {
      console.error(`❌ 解析 ${componentPath} 失败:`, error);
    }
  }

  console.log('✨ 文档生成完成！');
}

/**
 * 生成 Markdown 格式的文档
 */
function generateMarkdown(
  componentInfo: any,
  componentName: string,
  packageName: string,
): string {
  let markdown = `# ${componentName} API\n\n`;

  // 组件描述
  if (componentInfo.description) {
    markdown += `${componentInfo.description}\n\n`;
  }

  // 安装和使用
  markdown += `## 安装\n\n`;
  markdown += '```bash\n';
  markdown += `pnpm add @aix/${packageName}\n`;
  markdown += '```\n\n';

  markdown += `## 基础使用\n\n`;
  markdown += '```vue\n';
  markdown += '<script setup>\n';
  markdown += `import { ${componentName} } from '@aix/${packageName}';\n`;
  markdown += '</script>\n\n';
  markdown += '<template>\n';
  markdown += `  <${componentName} />\n`;
  markdown += '</template>\n';
  markdown += '```\n\n';

  // Props
  if (componentInfo.props && componentInfo.props.length > 0) {
    markdown += `## Props\n\n`;
    markdown += '| 属性名 | 类型 | 默认值 | 必填 | 说明 |\n';
    markdown += '|--------|------|--------|------|------|\n';

    componentInfo.props.forEach((prop: any) => {
      const name = prop.name;
      const type = prop.type?.name || 'any';
      const defaultValue = prop.defaultValue?.value
        ? `\`${prop.defaultValue.value}\``
        : '-';
      const required = prop.required ? '是' : '否';
      const description = prop.description || '-';

      markdown += `| ${name} | \`${type}\` | ${defaultValue} | ${required} | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Events
  if (componentInfo.events && componentInfo.events.length > 0) {
    markdown += `## Events\n\n`;
    markdown += '| 事件名 | 参数 | 说明 |\n';
    markdown += '|--------|------|------|\n';

    componentInfo.events.forEach((event: any) => {
      const name = event.name;
      const type = event.type?.names?.join(', ') || '-';
      const description = event.description || '-';

      markdown += `| ${name} | \`${type}\` | ${description} |\n`;
    });

    markdown += '\n';
  }

  // Slots
  if (componentInfo.slots && componentInfo.slots.length > 0) {
    markdown += `## Slots\n\n`;
    markdown += '| 插槽名 | 说明 |\n';
    markdown += '|--------|------|\n';

    componentInfo.slots.forEach((slot: any) => {
      const name = slot.name;
      const description = slot.description || '-';

      markdown += `| ${name} | ${description} |\n`;
    });

    markdown += '\n';
  }

  // 示例
  if (componentInfo.examples && componentInfo.examples.length > 0) {
    markdown += `## 示例\n\n`;

    componentInfo.examples.forEach((example: any) => {
      if (example.title) {
        markdown += `### ${example.title}\n\n`;
      }
      if (example.description) {
        markdown += `${example.description}\n\n`;
      }
      markdown += '```vue\n';
      markdown += example.code || example;
      markdown += '\n```\n\n';
    });
  }

  return markdown;
}

// 执行
generateDocs().catch(console.error);
