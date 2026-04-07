import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const assetsDir = path.join(__dirname, '../assets');
const srcDir = path.join(__dirname, '../src');

// 确保 src 目录存在
if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir, { recursive: true });
}

// HTML/Vue 保留的组件名列表
const RESERVED_NAMES = new Set([
  'Input',
  'Label',
  'Link',
  'Menu',
  'Search',
  'Style',
  'Filter',
  'Frame',
  'Polygon',
  'Map',
  'Mask',
  'Path',
]);

// 将文件名转换为 PascalCase 组件名
function toPascalCase(filename: string): string {
  // 移除 .svg 扩展名
  const name = filename.replace(/\.svg$/, '');
  // 将 kebab-case 或 snake_case 转换为 PascalCase
  const pascalName = name
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');

  // 如果是保留名称，添加 Icon 前缀
  return RESERVED_NAMES.has(pascalName) ? `Icon${pascalName}` : pascalName;
}

// 处理 SVG 内容
function processSvgContent(svgContent: string): string {
  // 移除 XML 声明
  let content = svgContent.replace(/<\?xml[^>]*\?>/g, '').trim();

  // 移除固定的 width 和 height，保留 viewBox
  content = content.replace(/\s*width="[^"]*"/g, '');
  content = content.replace(/\s*height="[^"]*"/g, '');

  // 移除 SVG 标签上的 fill 属性
  content = content.replace(/<svg([^>]*?)\s*fill="[^"]*"/g, '<svg$1');

  // 替换内部路径的固定颜色为 currentColor
  content = content
    .replace(/fill="black"/g, 'fill="currentColor"')
    .replace(/fill="#000"/g, 'fill="currentColor"')
    .replace(/fill="#000000"/g, 'fill="currentColor"')
    .replace(/stroke="black"/g, 'stroke="currentColor"')
    .replace(/stroke="#000"/g, 'stroke="currentColor"')
    .replace(/stroke="#000000"/g, 'stroke="currentColor"');

  // 移除 fill-opacity
  content = content.replace(/\s*fill-opacity="[^"]*"/g, '');

  // 提取 SVG 标签和内容
  const svgMatch = content.match(/<svg([^>]*)>([\s\S]*)<\/svg>/);
  if (!svgMatch || !svgMatch[1] || !svgMatch[2]) {
    throw new Error('Invalid SVG content');
  }

  const svgAttrs = svgMatch[1];
  const svgInner = svgMatch[2];

  // 格式化 SVG 属性 - 确保每个属性单独一行
  // 使用正则匹配属性名="属性值" 的模式
  const attrMatches = svgAttrs.matchAll(/(\w+(?:-\w+)*)="([^"]*)"/g);
  const formattedAttrs = Array.from(attrMatches)
    .map(([, name, value]) => `    ${name}="${value}"`)
    .join('\n');

  // 修复自闭合标签的空格问题
  const fixedInner = svgInner.trim().replace(/\/>/g, ' />');

  // 构建格式化的 SVG
  const formattedSvg = `<svg
    :width="width"
    :height="height"
    :style="{ color: color }"
${formattedAttrs}
    v-bind="$attrs"
  >
    ${fixedInner}
  </svg>`;

  return formattedSvg;
}

// 将 SVG 转换为 Vue 组件
function transformToVueComponent(svgPath: string, componentName: string): string {
  const svgContent = fs.readFileSync(svgPath, 'utf-8');
  const processedSvg = processSvgContent(svgContent);

  return `<template>
  ${processedSvg}
</template>

<script setup lang="ts">
interface Props {
  width?: string | number
  height?: string | number
  color?: string
}

withDefaults(defineProps<Props>(), {
  width: '1em',
  height: '1em',
  color: 'currentColor'
})

defineOptions({
  name: '${componentName}'
})
</script>
`;
}

// 生成所有图标组件
function generateIcons() {
  console.log('🔍 扫描 SVG 文件...');

  // 使用 glob 查找所有 SVG 文件
  const svgFiles = globSync('**/*.svg', {
    cwd: assetsDir,
    absolute: true,
  });

  console.log(`📦 找到 ${svgFiles.length} 个 SVG 文件`);

  let successCount = 0;
  const componentNames: Array<{ name: string; path: string }> = [];

  for (const svgPath of svgFiles) {
    try {
      // 获取相对于 assets 的路径
      const relativePath = path.relative(assetsDir, svgPath);
      const filename = path.basename(svgPath);
      const componentName = toPascalCase(filename);

      // 保持目录结构
      const dir = path.dirname(relativePath);
      const targetDir = path.join(srcDir, dir);

      // 确保目标目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      // 生成 Vue 组件
      const vueContent = transformToVueComponent(svgPath, componentName);
      const outputPath = path.join(targetDir, filename.replace('.svg', '.vue'));

      fs.writeFileSync(outputPath, vueContent, 'utf-8');

      // 记录组件信息用于生成入口文件
      const relativeVuePath = path.relative(srcDir, outputPath).replace(/\\/g, '/');
      componentNames.push({
        name: componentName,
        path: './' + relativeVuePath, // 保留 .vue 扩展名
      });

      successCount++;
    } catch (error) {
      console.error(`❌ 处理文件失败: ${svgPath}`, error);
    }
  }

  console.log(`✅ 成功生成 ${successCount} 个 Vue 组件`);

  return componentNames;
}

// 生成入口文件
function generateEntry(componentNames: Array<{ name: string; path: string }>) {
  console.log('📝 生成入口文件...');

  // 按名称排序
  componentNames.sort((a, b) => a.name.localeCompare(b.name));

  // 生成导出语句
  const exports = componentNames
    .map(({ name, path }) => {
      return `export { default as ${name} } from '${path}';`;
    })
    .join('\n');

  const indexContent = `// 此文件由脚本自动生成，请勿手动修改
// Generated by scripts/generate.ts

${exports}
`;

  const indexPath = path.join(srcDir, 'index.ts');
  fs.writeFileSync(indexPath, indexContent, 'utf-8');

  console.log(`✅ 入口文件已生成: ${indexPath}`);
  console.log(`📊 导出 ${componentNames.length} 个组件`);
}

// 主函数
function main() {
  console.log('🚀 开始生成 Vue 图标组件...\n');

  try {
    const componentNames = generateIcons();
    generateEntry(componentNames);

    console.log('\n✨ 所有图标组件生成完成！');
  } catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  }
}

main();
