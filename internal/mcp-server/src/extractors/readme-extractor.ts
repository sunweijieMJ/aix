import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type {
  ComponentExample,
  EmitDefinition,
  PropDefinition,
  SlotDefinition,
} from '../types/index';
import { log } from '../utils/logger';

/**
 * 一张 markdown 表格
 */
interface MarkdownTable {
  /** 表头单元格 */
  header: string[];
  /** 数据行 */
  rows: string[][];
  /** 所属章节（最近的一个标题），用于标注 props 归属哪个子组件 */
  section: string;
}

/** 列名同义词，用于按列名而非列序定位数据 */
const COLUMN_ALIASES = {
  propName: ['属性名', '属性', '参数名', '参数', '配置项', '配置', '选项', 'prop', 'props'],
  eventName: ['事件名', '事件', 'event', 'events'],
  slotName: ['插槽名', '插槽', 'slot', 'slots'],
  type: ['类型', 'type'],
  defaultValue: ['默认值', '默认', 'default'],
  required: ['必填', '必须', '是否必填', 'required'],
  description: ['说明', '描述', '含义', 'description', '典型用途'],
  enum: ['可选值', '取值', '枚举值'],
  params: ['参数', '回调参数', '参数类型', '返回值'],
  scope: ['作用域', '作用域字段', '插槽参数'],
} as const;

/** 表示"是"的单元格取值 */
const TRUTHY_CELL = ['✅', '✓', '是', 'true', 'yes', 'y'];

/**
 * README.md 文档提取器
 *
 * 从 README.md 文档中提取组件信息，包括：
 * - 基本信息（标题、描述、特性）
 * - Props 定义（从 API 参考表格中提取）
 * - 代码示例（从代码块中提取）
 * - 标签和分类信息
 */
export class ReadmeExtractor {
  /**
   * 从 README 文件中提取完整的组件信息
   */
  async extractFromReadme(filePath: string): Promise<{
    title: string;
    description: string;
    features: string[];
    props: PropDefinition[];
    emits: EmitDefinition[];
    slots: SlotDefinition[];
    examples: ComponentExample[];
    tags: string[];
    category: string;
    content: string;
    metadata: Record<string, unknown>;
  } | null> {
    try {
      const content = await readFile(filePath, 'utf8');
      // Normalize line endings to \n (handle Windows \r\n)
      const normalizedContent = content.replace(/\r\n/g, '\n');
      const { data, content: markdownContent } = matter(normalizedContent);

      // 提取基本信息
      const title = this.extractTitle(markdownContent);
      const description = this.extractDescription(markdownContent);
      const features = this.extractFeatures(markdownContent);

      // 提取 API 定义（Props / Emits / Slots）
      const { props, emits, slots } = this.extractApiTables(markdownContent);

      // 提取代码示例
      const examples = this.extractCodeExamples(markdownContent);

      // 提取标签和分类
      const tags = this.extractTags(markdownContent, title);
      const category = this.extractCategory(title, filePath);

      return {
        title,
        description,
        features,
        props,
        emits,
        slots,
        examples,
        tags,
        category,
        content: markdownContent,
        metadata: data,
      };
    } catch (error) {
      log.warn(`Failed to extract from README ${filePath}:`, error);
      return null;
    }
  }

  /**
   * 提取标题（第一个 # 标题）
   */
  private extractTitle(content: string): string {
    const titleMatch = content.match(/^#\s+(.+?)(?:\s+使用文档)?$/m);
    return titleMatch?.[1]?.trim() || '';
  }

  /**
   * 提取描述（标题后的第一段文字）
   */
  private extractDescription(content: string): string {
    // 匹配标题后的第一段非空文字，但要排除特性列表
    const descMatch = content.match(/^#\s+.+?\n\n(.+?)(?:\n\n##|\n\n-|$)/s);
    if (descMatch?.[1]) {
      const desc = descMatch[1].trim();
      // 确保不是特性列表的开始
      if (!desc.startsWith('-') && !desc.startsWith('##')) {
        return desc;
      }
    }
    return '';
  }

  /**
   * 提取特性列表（## 特性 部分）
   */
  private extractFeatures(content: string): string[] {
    // 支持带emoji的标题，如 "## ✨ 特性"
    // 更灵活的正则：匹配 "## " 后可能有任意字符（包括emoji）然后是 "特性"
    const featuresMatch = content.match(/^##\s+.*?特性.*?\n\n((?:- .+\n?)+)/m);
    if (!featuresMatch?.[1]) return [];

    return featuresMatch[1]
      .split('\n')
      .map((line) => line.replace(/^-\s*/, '').trim())
      .filter(Boolean)
      .map((feature) => {
        // 移除开头的 emoji 和格式化符号，只保留文本描述
        // 匹配更广泛的 emoji 和特殊字符
        return feature
          .replace(
            /^[\u{1F000}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][\u{FE00}-\u{FE0F}]?\s*/u,
            '',
          )
          .replace(/^\*\*(.+?)\*\*[：:]\s*/, '$1：')
          .trim();
      });
  }

  /**
   * 提取 Props / Emits / Slots 定义
   *
   * 按列名而非列序定位数据：仓库里同一类表格存在 7 种以上的列序变体
   * （`属性名|类型|默认值|必填|说明`、`属性名|说明|类型|可选值|默认值`、
   * `属性|类型|描述` 等），硬编码几种格式一定会漏。
   *
   * 同样不再要求表格必须挂在 `## API` 标题下——audio / hooks / ai-chat
   * 的属性表分别挂在 `## UI 组件`、`## 国际化 API` 等标题下，
   * 卡标题会让这些包一个 prop 都提不到。
   */
  private extractApiTables(content: string): {
    props: PropDefinition[];
    emits: EmitDefinition[];
    slots: SlotDefinition[];
  } {
    const props = new Map<string, PropDefinition>();
    const emits = new Map<string, EmitDefinition>();
    const slots = new Map<string, SlotDefinition>();

    for (const table of this.extractTables(content)) {
      const columns = table.header.map((h) => this.normalizeHeader(h));
      const at = (aliases: readonly string[]) => columns.findIndex((c) => aliases.includes(c));

      const nameIndex = {
        prop: at(COLUMN_ALIASES.propName),
        event: at(COLUMN_ALIASES.eventName),
        slot: at(COLUMN_ALIASES.slotName),
      };
      const typeIndex = at(COLUMN_ALIASES.type);
      const descriptionIndex = at(COLUMN_ALIASES.description);

      // 事件表：首列是事件名
      if (nameIndex.event === 0) {
        const paramsIndex = at(COLUMN_ALIASES.params);
        for (const row of table.rows) {
          const name = this.cleanCell(row[0]);
          if (!name) continue;
          if (!emits.has(name)) {
            emits.set(name, {
              name,
              params: this.cleanCell(row[paramsIndex]) || undefined,
              description: this.cleanCell(row[descriptionIndex]) || undefined,
              group: table.section || undefined,
            });
          }
        }
        continue;
      }

      // 插槽表：首列是插槽名
      if (nameIndex.slot === 0) {
        const scopeIndex = at(COLUMN_ALIASES.scope);
        for (const row of table.rows) {
          const name = this.cleanCell(row[0]);
          if (!name) continue;
          if (!slots.has(name)) {
            slots.set(name, {
              name,
              description: this.cleanCell(row[descriptionIndex]) || undefined,
              scope: this.cleanCell(row[scopeIndex]) || undefined,
              group: table.section || undefined,
            });
          }
        }
        continue;
      }

      const defaultIndex = at(COLUMN_ALIASES.defaultValue);
      const requiredIndex = at(COLUMN_ALIASES.required);
      const enumIndex = at(COLUMN_ALIASES.enum);

      // 属性表：首列是属性名，且至少要有类型/默认值/可选值之一。
      // 只有名字和说明两列的表大多是说明性表格（`键|作用`、`配置|求值时机`），
      // 收进来只会往 props 里灌噪声
      const looksLikeProps =
        nameIndex.prop === 0 && (typeIndex !== -1 || defaultIndex !== -1 || enumIndex !== -1);
      if (!looksLikeProps) continue;

      for (const row of table.rows) {
        const name = this.cleanCell(row[0]);
        if (!name || props.has(name)) continue;

        const defaultValue = this.cleanCell(row[defaultIndex]);
        const enumValues = this.cleanCell(row[enumIndex]);
        // 没有类型列时用可选值兜底，`'small' | 'large'` 本身就是类型
        const type = this.cleanCell(row[typeIndex]) || enumValues;
        if (!type) continue;

        props.set(name, {
          name,
          type,
          // 只认显式的必填列。用"没有默认值"反推必填是错的：
          // Vue 里绝大多数 prop 不写默认值也是可选的
          required:
            requiredIndex === -1 ? false : this.parseRequired(this.cleanCell(row[requiredIndex])),
          description: this.cleanCell(row[descriptionIndex]) || '',
          defaultValue: defaultValue && defaultValue !== '-' ? defaultValue : undefined,
          enum: enumValues && enumValues !== '-' ? this.splitEnum(enumValues) : undefined,
          group: table.section || undefined,
        });
      }
    }

    return {
      props: [...props.values()],
      emits: [...emits.values()],
      slots: [...slots.values()],
    };
  }

  /**
   * 扫描全文，切出所有 markdown 表格
   *
   * 表格的判定条件是「表头行 + 分隔行」，同时记录它所属的最近一个标题，
   * 用于标注这批 props 属于哪个子组件（一个 README 里往往有多个组件的表）。
   */
  private extractTables(content: string): MarkdownTable[] {
    const lines = content.split('\n');
    const tables: MarkdownTable[] = [];
    let section = '';
    let inCodeFence = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';

      // 围栏代码块里的表格是文档示例，不是真的 API 定义
      if (line.startsWith('```') || line.startsWith('~~~')) {
        inCodeFence = !inCodeFence;
        continue;
      }
      if (inCodeFence) continue;

      const heading = line.match(/^#{2,4}\s+(.+)$/);
      if (heading?.[1]) {
        section = heading[1].replace(/[`*]/g, '').trim();
        continue;
      }

      const separator = lines[i + 1]?.trim() ?? '';
      const isTableHead = line.startsWith('|') && /^\|[\s:|-]+\|$/.test(separator);
      if (!isTableHead) continue;

      const header = this.parseTableRow(line);
      const rows: string[][] = [];

      let j = i + 2;
      for (; j < lines.length; j++) {
        const rowLine = lines[j]?.trim() ?? '';
        if (!rowLine.startsWith('|')) break;
        rows.push(this.parseTableRow(rowLine));
      }
      i = j - 1;

      if (rows.length > 0) {
        tables.push({ header, rows, section });
      }
    }

    return tables;
  }

  /**
   * 归一化表头单元格，便于按别名匹配
   */
  private normalizeHeader(cell: string): string {
    return cell
      .replace(/[`*]/g, '')
      .replace(/\s+/g, '')
      .replace(/[（(].*?[）)]/g, '')
      .toLowerCase();
  }

  /**
   * 清洗单元格：去反引号、去首尾空白
   */
  private cleanCell(cell: string | undefined): string {
    if (!cell) return '';
    return cell.trim().replace(/^`|`$/g, '').trim();
  }

  /**
   * 解析必填列
   */
  private parseRequired(cell: string): boolean {
    const normalized = cell.trim().toLowerCase();
    return TRUTHY_CELL.some((t) => normalized.includes(t));
  }

  /**
   * 拆分可选值列，如 `'small' \| 'large'`
   */
  private splitEnum(cell: string): string[] {
    return cell
      .split(/\\?\||、|,|，/)
      .map((v) => v.trim().replace(/^`|`$/g, '').trim())
      .filter(Boolean);
  }

  /**
   * 解析表格行
   *
   * 保留空单元格：列的定位完全依赖下标，一旦把空单元格过滤掉，
   * 后面所有列都会左移，轻则字段错位，重则整行因列数不足被丢弃。
   */
  private parseTableRow(row: string): string[] {
    const cleanRow = row.trim().replace(/^\|/, '').replace(/\|$/, '');

    const cells: string[] = [];
    let currentCell = '';
    let inCode = false;
    let escapeNext = false;

    for (let i = 0; i < cleanRow.length; i++) {
      const char = cleanRow[i];

      if (escapeNext) {
        currentCell += char;
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        currentCell += char;
        continue;
      }

      if (char === '`') {
        inCode = !inCode;
        currentCell += char;
        continue;
      }

      if (char === '|' && !inCode) {
        cells.push(currentCell.trim());
        currentCell = '';
        continue;
      }

      currentCell += char;
    }

    cells.push(currentCell.trim());

    return cells;
  }

  /**
   * 提取代码示例
   */
  private extractCodeExamples(content: string): ComponentExample[] {
    const examples: ComponentExample[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
    let match;

    // 用于跟踪当前所在的章节
    let currentSection = '';
    const lines = content.split('\n');
    const sectionMap: { [lineIndex: number]: string } = {};

    // 构建行号到章节的映射
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const sectionMatch = line.match(/^###?\s+(.+)$/);
      if (sectionMatch && sectionMatch[1]) {
        currentSection = sectionMatch[1].trim();
      }
      sectionMap[i] = currentSection;
    }

    while ((match = codeBlockRegex.exec(content)) !== null) {
      const language = match[1] || 'text';
      const code = match[2]?.trim() ?? '';

      // 处理 TypeScript/JavaScript/Vue 代码
      if (
        !['tsx', 'jsx', 'ts', 'js', 'typescript', 'javascript', 'vue'].includes(
          language.toLowerCase(),
        )
      ) {
        continue;
      }

      // 找到代码块所在的行号
      const matchIndex = match.index || 0;
      const codeBlockStart = content.substring(0, matchIndex).split('\n').length - 1;
      const section = sectionMap[codeBlockStart] || '';

      // 尝试找到代码块前的描述
      const beforeCode = content.substring(0, matchIndex);
      const beforeLines = beforeCode.split('\n');
      let description = section;

      // 查找最近的小标题或描述
      for (let i = beforeLines.length - 1; i >= 0; i--) {
        const line = beforeLines[i]?.trim();
        if (!line) continue;

        if (line.startsWith('###')) {
          description = line.replace(/^#+\s*/, '');
          break;
        } else if (line && !line.startsWith('```') && !line.startsWith('|') && line.length > 10) {
          description = line;
          break;
        }
      }

      examples.push({
        title: description || `示例 ${examples.length + 1}`,
        description: description,
        code,
        language: this.normalizeLanguage(language),
      });
    }

    return examples;
  }

  /**
   * 标准化语言标识
   */
  private normalizeLanguage(lang: string): 'tsx' | 'jsx' | 'ts' | 'js' | 'vue' {
    const normalized = lang.toLowerCase();
    switch (normalized) {
      case 'vue':
        return 'vue';
      case 'tsx':
      case 'typescript':
        return 'tsx';
      case 'jsx':
        return 'jsx';
      case 'ts':
        return 'ts';
      case 'js':
      case 'javascript':
      default:
        return 'js';
    }
  }

  /**
   * 从内容中提取标签
   */
  private extractTags(content: string, title: string): string[] {
    const tags = new Set<string>();

    // 从标题中提取标签
    const titleWords = title
      .replace(/组件|使用文档/g, '')
      .split(/\s+/)
      .filter((word) => word.length > 1);
    titleWords.forEach((word) => tags.add(word.toLowerCase()));

    // 从特性中提取关键词
    const featuresMatch = content.match(/^##\s+特性\s*\n\n((?:- .+\n?)+)/m);
    if (featuresMatch?.[1]) {
      const featureText = featuresMatch[1];
      const keywords = featureText.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
      keywords.forEach((keyword) => {
        if (keyword.length > 1 && !['支持', '提供', '完整', '自定义', '灵活'].includes(keyword)) {
          tags.add(keyword.toLowerCase());
        }
      });
    }

    // 从描述中提取关键词
    const descMatch = content.match(/^#\s+.+\n\n(.+?)(?:\n\n|$)/s);
    if (descMatch?.[1]) {
      const description = descMatch[1];
      const keywords = description.match(/[\u4e00-\u9fa5a-zA-Z]{2,}/g) || [];
      keywords.forEach((keyword) => {
        if (keyword && keyword.length > 1 && !['基于', '支持', '提供'].includes(keyword)) {
          tags.add(keyword.toLowerCase());
        }
      });
    }

    // 从依赖中提取标签（如果在内容中提到）
    if (content.includes('vue') || content.includes('Vue')) tags.add('vue');
    if (content.includes('typescript') || content.includes('TypeScript')) tags.add('typescript');
    if (content.includes('videojs') || content.includes('video.js')) tags.add('videojs');
    if (content.includes('leaflet') || content.includes('Leaflet')) tags.add('leaflet');
    if (content.includes('moho') || content.includes('Moho')) tags.add('moho');

    return Array.from(tags).filter((tag) => tag.length > 1);
  }

  /**
   * 推断组件分类
   *
   * 只看标题和包目录名。早先的实现拿整篇 README 做关键词匹配，
   * 而正文里出现一次"按钮"就足以把 Popper、RichTextEditor、CodeEditor
   * 统统判成"通用"——12 个组件错了 7 个，category 过滤形同虚设。
   */
  private extractCategory(title: string, filePath: string): string {
    // packages/pdf-viewer/README.md -> pdf-viewer
    const packageDir = filePath.split(/[/\\]/).slice(-2, -1)[0] ?? '';
    const subject = `${title} ${packageDir}`.toLowerCase();

    const RULES: Array<[string, string[]]> = [
      ['主题', ['theme', '主题', 'token', '设计令牌']],
      ['编辑器', ['editor', '编辑器']],
      ['媒体', ['video', '视频', 'audio', '音频', '播放器', 'player', 'image', '图片', 'pdf']],
      ['图标', ['icon', '图标']],
      ['浮层', ['popper', 'popover', 'tooltip', 'modal', 'dialog', '弹窗', '浮层', '对话框']],
      ['表单', ['input', '输入框', '表单', 'form', 'picker', '选择器', 'select', 'upload', '上传']],
      ['数据展示', ['table', '表格', 'list', '列表', 'tree', '流程图', 'graph', 'chart']],
      ['导航', ['menu', '菜单', 'nav', '导航', 'tabs', '标签页']],
      ['反馈', ['message', '消息', 'notification', '通知', 'toast', 'alert']],
      ['文本', ['subtitle', '字幕', 'text', '文本', 'highlight', '高亮', 'markdown']],
      ['通用', ['button', '按钮', 'link', '链接']],
      ['布局', ['layout', '布局', 'container', '容器', 'grid', '栅格']],
      ['工具', ['hooks', 'utils', '工具', 'composable']],
    ];

    for (const [category, keywords] of RULES) {
      if (keywords.some((k) => subject.includes(k))) {
        return category;
      }
    }

    return '其他';
  }

  /**
   * 从 markdown 内容中提取 API 相关段落
   *
   * 按 ## 标题切分章节，匹配关键词的章节保留为 ApiSection。
   * 每个章节包含完整的 markdown 内容（含子标题、表格、代码块）。
   */
  extractApiSections(content: string): Array<{ title: string; content: string }> {
    const API_SECTION_KEYWORDS = [
      'API',
      '使用',
      '用法',
      'Usage',
      '配置',
      '配置说明',
      'Configuration',
      '命令',
      'CLI',
      'CLI 命令',
      'Commands',
      '快速开始',
      'Quick Start',
      '接口',
      'Interface',
    ];

    const sections: Array<{ title: string; content: string }> = [];
    const sectionRegex = /^## (.+)$/gm;
    const matches: Array<{ title: string; index: number }> = [];
    let match;

    while ((match = sectionRegex.exec(content)) !== null) {
      if (match[1]) {
        matches.push({ title: match[1].trim(), index: match.index });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i]!;
      const title = current.title;

      const isApiSection = API_SECTION_KEYWORDS.some(
        (keyword) => title === keyword || title.includes(keyword),
      );

      if (!isApiSection) continue;

      const startIndex = current.index;
      const nextMatch = matches[i + 1];
      const endIndex = nextMatch ? nextMatch.index : content.length;
      const sectionContent = content.substring(startIndex, endIndex).trim();

      const contentWithoutTitle = sectionContent.replace(/^## .+\n+/, '').trim();

      if (contentWithoutTitle) {
        sections.push({ title, content: contentWithoutTitle });
      }
    }

    return sections;
  }

  /**
   * 提取组件的导出名称（从代码示例中推断）
   */
  extractComponentNames(content: string): string[] {
    const names = new Set<string>();

    // 从 import 语句中提取
    const importMatches = content.matchAll(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g);
    for (const match of importMatches) {
      const imports = match[1]?.split(',').map((imp) => imp.trim()) || [];
      imports.forEach((imp) => {
        const cleanName = imp.replace(/\s+as\s+\w+/, '').trim();
        if (cleanName && /^[A-Z]/.test(cleanName)) {
          names.add(cleanName);
        }
      });
    }

    // 从 JSX 标签中提取
    const jsxMatches = content.matchAll(/<([A-Z][A-Za-z0-9]*)/g);
    for (const match of jsxMatches) {
      const componentName = match[1];
      if (componentName) {
        names.add(componentName);
      }
    }

    return Array.from(names);
  }

  /**
   * 提取版本信息（如果在文档中有提及）
   */
  extractVersionInfo(content: string): string | undefined {
    const versionMatch = content.match(/版本[:：]\s*([0-9.]+)/);
    return versionMatch?.[1];
  }

  /**
   * 提取依赖信息（从文档内容中推断）
   */
  extractDependencies(content: string): string[] {
    const dependencies = new Set<string>();

    // 从 import 语句中提取包名
    const importMatches = content.matchAll(/from\s+['"]([^'"]+)['"]/g);
    for (const match of importMatches) {
      const packageName = match[1];
      if (packageName && (packageName.startsWith('@') || !packageName.startsWith('.'))) {
        dependencies.add(packageName);
      }
    }

    return Array.from(dependencies);
  }
}
