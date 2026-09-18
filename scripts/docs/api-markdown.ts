import type { ApiComponent, ApiPackage } from './api-model';

/**
 * 表格单元格清洗：压缩换行与连续空白，转义未转义的竖线；
 * 代码段之外的 `__`（如 `__test__` 路径）转义掉，避免被当成加粗标记
 */
export function sanitizeCell(text: string): string {
  const flattened = text
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/([。；，：！？）])\s+(?=[\u4e00-\u9fa5（`])/g, '$1')
    .replace(/(?<=[\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();

  return flattened
    .split(/(`[^`]*`)/)
    .map((segment) => (segment.startsWith('`') ? segment : segment.replace(/__/g, '\\_\\_')))
    .join('');
}

function code(text: string): string {
  return `\`${sanitizeCell(text)}\``;
}

function text(value: string | undefined): string {
  return value ? sanitizeCell(value) : '-';
}

/**
 * 渲染单个组件的各张表；`prefix` 用于多组件包区分归属，如 `Tooltip Props`
 */
function renderComponent(component: ApiComponent, prefix: string): string {
  let md = '';

  if (component.props.length > 0) {
    md += `### ${prefix}Props\n\n`;
    md += '| 属性名 | 类型 | 默认值 | 必填 | 说明 |\n';
    md += '|--------|------|--------|:----:|------|\n';
    for (const prop of component.props) {
      const type = code(prop.resolvedType ?? prop.type);
      const defaultValue = prop.defaultValue ? code(prop.defaultValue) : '-';
      const required = prop.required ? '✅' : '-';
      md += `| \`${prop.name}\` | ${type} | ${defaultValue} | ${required} | ${text(prop.description)} |\n`;
    }
    md += '\n';
  }

  if (component.events.length > 0) {
    md += `### ${prefix}Events\n\n`;
    md += '| 事件名 | 参数 | 说明 |\n';
    md += '|--------|------|------|\n';
    for (const event of component.events) {
      const params = event.params ? code(event.params) : '-';
      md += `| \`${event.name}\` | ${params} | ${text(event.description)} |\n`;
    }
    md += '\n';
  }

  if (component.slots.length > 0) {
    md += `### ${prefix}Slots\n\n`;
    md += '| 插槽名 | 参数 | 说明 |\n';
    md += '|--------|------|------|\n';
    for (const slot of component.slots) {
      const params = slot.params ? code(slot.params) : '-';
      md += `| \`${slot.name}\` | ${params} | ${text(slot.description)} |\n`;
    }
    md += '\n';
  }

  if (component.expose.length > 0) {
    md += `### ${prefix}Expose\n\n`;
    md += '| 名称 | 类型 | 说明 |\n';
    md += '|------|------|------|\n';
    for (const member of component.expose) {
      const type = member.type ? code(member.type) : '-';
      md += `| \`${member.name}\` | ${type} | ${text(member.description)} |\n`;
    }
    md += '\n';
  }

  return md;
}

/**
 * `## API` 段正文（不含标题）。多组件包每个组件的表以组件名为前缀，组件之间以分隔线隔开。
 */
export function renderApiBody(pkg: ApiPackage): string {
  const multi = pkg.components.length > 1;
  const blocks = pkg.components
    .map((component) => renderComponent(component, multi ? `${component.name} ` : ''))
    .filter(Boolean);

  if (blocks.length === 0) return '暂无对外 API。\n';

  return blocks.join('---\n\n').replace(/\n+$/, '\n');
}

/**
 * 完整的 `## API` 段（含标题），以单个换行结尾
 */
export function renderApiSection(pkg: ApiPackage): string {
  return '## API\n\n' + renderApiBody(pkg);
}
