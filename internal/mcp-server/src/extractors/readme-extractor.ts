import { readFile } from 'node:fs/promises';
import matter from 'gray-matter';
import type { ComponentExample, PropDefinition } from '../types/index';
import { log } from '../utils/logger';

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

      // 提取 Props 定义
      const props = this.extractPropsFromApiReference(markdownContent);

      // 提取代码示例
      const examples = this.extractCodeExamples(markdownContent);

      // 提取标签和分类
      const tags = this.extractTags(markdownContent, title);
      const category = this.extractCategory(markdownContent, title);

      return {
        title,
        description,
        features,
        props,
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
   * 从 API 参考部分提取 Props 定义
   */
  private extractPropsFromApiReference(content: string): PropDefinition[] {
    const props: PropDefinition[] = [];

    // 简单有效的API参考部分匹配 - 支持多种格式
    // 匹配 "## API 参考" 或 "## API"
    const apiMatch = content.match(/##\s+API(?:\s+参考)?[\s\S]*$/m);
    if (!apiMatch) return props;

    const apiSection = apiMatch[0];

    // 查找标准表格格式 - 支持多种格式
    // 使用更简单的方法：找到表头，然后逐行提取直到遇到非表格行

    let tableFormat: 'vue3' | 'new' | 'old' | null = null;
    let tableStartIndex = -1;

    // 格式1: 属性名 | 说明 | 类型 | 可选值 | 默认值 (Vue 3 格式)
    const vue3Header = apiSection.match(
      /\|\s*属性名\s*\|\s*说明\s*\|\s*类型\s*\|\s*可选值\s*\|\s*默认值\s*\|/,
    );
    if (vue3Header) {
      tableFormat = 'vue3';
      tableStartIndex = vue3Header.index || 0;
    }

    // 格式2: 属性(名) | 类型 | 默认值 | 必填 | 描述(说明) (5列格式)
    if (!tableFormat) {
      const newHeader = apiSection.match(
        /\|\s*属性(?:名)?\s*\|\s*类型\s*\|\s*默认值\s*\|\s*必填\s*\|\s*(?:描述|说明)\s*\|/,
      );
      if (newHeader) {
        tableFormat = 'new';
        tableStartIndex = newHeader.index || 0;
      }
    }

    // 格式3: 属性 | 类型 | 默认值 | 描述 (4列格式)
    if (!tableFormat) {
      const oldHeader = apiSection.match(
        /\|\s*属性\s*\|\s*类型\s*\|\s*默认值\s*\|\s*描述\s*\|/,
      );
      if (oldHeader) {
        tableFormat = 'old';
        tableStartIndex = oldHeader.index || 0;
      }
    }

    if (!tableFormat || tableStartIndex === -1) return props;

    // 从表头位置开始提取表格行
    const lines = apiSection.substring(tableStartIndex).split('\n');
    const rows: string[] = [];

    // 跳过表头和分隔线，提取数据行
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i]?.trim() || '';

      // 如果遇到空行或不是表格行（不包含|），停止
      if (!line || !line.includes('|')) {
        break;
      }

      // 如果是分隔线，跳过
      if (/^[\s|:-]+$/.test(line)) {
        continue;
      }

      rows.push(line);
    }

    for (const row of rows) {
      // 更智能的表格解析，处理类型中的 | 字符
      const cells = this.parseTableRow(row);

      const minCells = tableFormat === 'old' ? 4 : 5;
      if (cells.length >= minCells) {
        let name: string,
          type: string,
          defaultValue: string,
          description: string,
          optionalValues: string = '';

        if (tableFormat === 'vue3') {
          // Vue 3 格式：属性名 | 说明 | 类型 | 可选值 | 默认值
          [name, description, type, optionalValues, defaultValue] = [
            cells[0] || '',
            cells[1] || '',
            cells[2] || '',
            cells[3] || '',
            cells[4] || '',
          ];
        } else if (tableFormat === 'new') {
          // 新格式：属性 | 类型 | 默认值 | 必填 | 描述
          const requiredCell = cells[3] || '';
          [name, type, defaultValue, description] = [
            cells[0] || '',
            cells[1] || '',
            cells[2] || '',
            cells[4] || '',
          ];
          // 暂存必填信息，后面判断required时会用到
          optionalValues = requiredCell;
        } else {
          // 旧格式：属性 | 类型 | 默认值 | 描述
          [name, type, defaultValue, description] = [
            cells[0] || '',
            cells[1] || '',
            cells[2] || '',
            cells[3] || '',
          ];
        }

        // 跳过无效行
        if (
          !name ||
          !type ||
          name === '属性' ||
          name === '属性名' ||
          name === 'Property'
        ) {
          continue;
        }

        // 判断是否必需
        let isRequired: boolean;
        if (tableFormat === 'new' && optionalValues) {
          // 新格式：根据必填列判断（✅表示必填，❌表示可选）
          isRequired =
            optionalValues.includes('✅') ||
            optionalValues.toLowerCase().includes('是') ||
            optionalValues.toLowerCase().includes('true');
        } else {
          // Vue3 和旧格式：根据默认值判断（有默认值表示非必需）
          isRequired = !defaultValue || defaultValue === '-';
        }

        props.push({
          name: name.trim().replace(/^`|`$/g, ''), // 去除反引号
          type: type.trim().replace(/^`|`$/g, ''), // 去除反引号
          required: isRequired,
          description: description?.trim() || '',
          defaultValue:
            defaultValue && defaultValue !== '-'
              ? defaultValue.trim().replace(/^`|`$/g, '') // 去除反引号
              : undefined,
        });
      }
    }

    return props;
  }

  /**
   * 智能解析表格行，处理类型中的 | 字符
   */
  private parseTableRow(row: string): string[] {
    // 移除行首行尾的 |
    const cleanRow = row.replace(/^\|+/, '').replace(/\|+$/, '');

    // 使用正则表达式匹配表格单元格，考虑转义的 |
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

    // 添加最后一个单元格
    if (currentCell.trim()) {
      cells.push(currentCell.trim());
    }

    return cells.filter((cell) => cell.length > 0);
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
      const codeBlockStart =
        content.substring(0, matchIndex).split('\n').length - 1;
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
        } else if (
          line &&
          !line.startsWith('```') &&
          !line.startsWith('|') &&
          line.length > 10
        ) {
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
        if (
          keyword.length > 1 &&
          !['支持', '提供', '完整', '自定义', '灵活'].includes(keyword)
        ) {
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
        if (
          keyword &&
          keyword.length > 1 &&
          !['基于', '支持', '提供'].includes(keyword)
        ) {
          tags.add(keyword.toLowerCase());
        }
      });
    }

    // 从依赖中提取标签（如果在内容中提到）
    if (content.includes('vue') || content.includes('Vue')) tags.add('vue');
    if (content.includes('typescript') || content.includes('TypeScript'))
      tags.add('typescript');
    if (content.includes('videojs') || content.includes('video.js'))
      tags.add('videojs');
    if (content.includes('leaflet') || content.includes('Leaflet'))
      tags.add('leaflet');
    if (content.includes('moho') || content.includes('Moho')) tags.add('moho');

    return Array.from(tags).filter((tag) => tag.length > 1);
  }

  /**
   * 从内容中推断分类
   */
  private extractCategory(content: string, title: string): string {
    const fullText = (title + ' ' + content).toLowerCase();
    const titleLower = title.toLowerCase();

    // 基于关键词推断分类，按优先级排序 - 具体的分类优先于通用分类
    // 优先检测主题系统（必须在标题或者有明确的主题系统特征）
    if (
      titleLower.includes('theme') ||
      titleLower.includes('主题') ||
      (fullText.includes('设计系统') && fullText.includes('css variables')) ||
      (fullText.includes('主题系统') && fullText.includes('设计令牌'))
    ) {
      return '主题';
    } else if (fullText.includes('button') || fullText.includes('按钮')) {
      return '通用';
    } else if (
      // 表单输入组件检测 - 提前到布局检测之前
      fullText.includes('input') ||
      fullText.includes('输入框') ||
      fullText.includes('表单') ||
      (fullText.includes('form') && !fullText.includes('transform'))
    ) {
      return '表单';
    } else if (
      fullText.includes('video') ||
      fullText.includes('视频') ||
      fullText.includes('播放器') ||
      fullText.includes('videojs')
    ) {
      return '媒体';
    } else if (
      fullText.includes('highlight') ||
      fullText.includes('高亮') ||
      fullText.includes('标记')
    ) {
      return '文本处理';
    } else if (
      fullText.includes('overflow') ||
      fullText.includes('溢出') ||
      fullText.includes('布局') ||
      fullText.includes('容器')
    ) {
      return '布局';
    } else if (
      fullText.includes('image') ||
      fullText.includes('图片') ||
      fullText.includes('媒体')
    ) {
      return '媒体';
    } else if (
      fullText.includes('picker') ||
      fullText.includes('选择') ||
      fullText.includes('选择器')
    ) {
      return '选择器';
    } else if (
      fullText.includes('modal') ||
      fullText.includes('弹窗') ||
      fullText.includes('对话框')
    ) {
      return '弹窗';
    } else if (fullText.includes('icon') || fullText.includes('图标')) {
      return '图标';
    } else if (fullText.includes('upload') || fullText.includes('上传')) {
      return '上传';
    } else if (fullText.includes('keyboard') || fullText.includes('键盘')) {
      return '输入';
    } else if (fullText.includes('annotation') || fullText.includes('标注')) {
      return '标注';
    } else if (fullText.includes('camera') || fullText.includes('摄像头')) {
      return '设备';
    } else if (fullText.includes('archive') || fullText.includes('档案')) {
      return '数据展示';
    } else if (fullText.includes('editor') || fullText.includes('编辑器')) {
      return '编辑器';
    }

    return '其他';
  }

  /**
   * 提取组件的导出名称（从代码示例中推断）
   */
  extractComponentNames(content: string): string[] {
    const names = new Set<string>();

    // 从 import 语句中提取
    const importMatches = content.matchAll(
      /import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g,
    );
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
      if (
        packageName &&
        (packageName.startsWith('@') || !packageName.startsWith('.'))
      ) {
        dependencies.add(packageName);
      }
    }

    return Array.from(dependencies);
  }
}
