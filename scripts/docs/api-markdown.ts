import type { ApiComponent, ApiPackage } from './api-model';

/** 表格单元格里唯一能用的换行手段 */
const LINE_BREAK = '<br>';

/**
 * 作者显式写下的结构边界：空行分段、列表项起头。
 * 这些位置压成空格会把两句话糊成一句，先固化成 `<br>` 再走后面的空白压缩。
 */
const STRUCTURAL_BREAK_RE = /[ \t]*\n(?:[ \t]*\n\s*|[ \t]*(?=[-*+] |\d+\. ))/g;

/**
 * 表格单元格清洗：结构边界转 `<br>`，其余换行与连续空白压成空格，转义未转义的竖线；
 * 代码段之外的 `__`（如 `__test__` 路径）转义掉，避免被当成加粗标记
 */
export function sanitizeCell(text: string): string {
  const flattened = text
    .replace(STRUCTURAL_BREAK_RE, LINE_BREAK)
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

  if (component.propsNote) {
    md += `### ${prefix}Props\n\n${component.propsNote}\n\n`;
  } else if (component.props.length > 0) {
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

const EMPTY_API = '暂无对外 API。';

/**
 * 组件说明：取自源文件 setup 块顶部的块注释，原样当段落渲染（不进表格，故换行与列表都保留）。
 * 冠以组件名，多组件包里才分得清这段说明属于紧随其后的哪组表。
 */
function renderDescription(component: ApiComponent): string {
  if (!component.description) return '';
  return `**${component.name}** — ${component.description.trim()}\n\n`;
}

/**
 * `## API` 段正文（不含标题）。多组件包每个组件的表以组件名为前缀，组件之间以分隔线隔开。
 *
 * 一张表都没有的组件仍保留标题：否则它会整块从 API 段消失，
 * 读者无从分辨「这个组件确实没有对外 API」和「解析失败被跳过」。
 */
export function renderApiBody(pkg: ApiPackage): string {
  const multi = pkg.components.length > 1;
  const blocks = pkg.components.map((component) => {
    const tables = renderComponent(component, multi ? `${component.name} ` : '');
    return renderDescription(component) + (tables || `### ${component.name}\n\n${EMPTY_API}\n\n`);
  });

  if (blocks.length === 0) return `${EMPTY_API}\n`;

  return blocks.join('---\n\n').replace(/\n+$/, '\n');
}

/**
 * 完整的 `## API` 段（含标题），以单个换行结尾
 */
export function renderApiSection(pkg: ApiPackage): string {
  return '## API\n\n' + renderApiBody(pkg);
}
