import { describe, expect, it } from 'vitest';
import {
  API_HEADING_RE,
  TYPES_HEADING_RE,
  extractSection,
  replaceSection,
  stripHeading,
} from '../docs/markdown-sections';

describe('API_HEADING_RE', () => {
  it('匹配带后缀的二级标题', () => {
    expect(API_HEADING_RE.test('## API')).toBe(true);
    expect(API_HEADING_RE.test('## API 参考')).toBe(true);
  });

  it('不匹配别的标题', () => {
    expect(API_HEADING_RE.test('## APIs')).toBe(false);
    expect(API_HEADING_RE.test('### API')).toBe(false);
  });
});

describe('extractSection', () => {
  it('取到标题与正文，止于下一个二级标题', () => {
    const md = '# 标题\n\n## API\n\n正文\n\n## 其他\n\n别的\n';
    expect(extractSection(md, API_HEADING_RE)).toBe('## API\n\n正文');
  });

  it('没有下一个二级标题时取到文末', () => {
    expect(extractSection('## API\n\n正文\n', API_HEADING_RE)).toBe('## API\n\n正文');
  });

  it('围栏代码块里的二级标题不算边界', () => {
    const md = '## API\n\n```md\n## 这不是标题\n```\n\n正文\n\n## 其他\n';
    expect(extractSection(md, API_HEADING_RE)).toBe('## API\n\n```md\n## 这不是标题\n```\n\n正文');
  });

  it('没有收尾的围栏不当作代码块，其后的标题照常识别且替换收敛', () => {
    const content = '# T\n\n```bash\npnpm add x\n\n## API\n\n旧表\n';
    expect(extractSection(content, API_HEADING_RE)).toBe('## API\n\n旧表');
    const once = replaceSection(content, API_HEADING_RE, '## API\n\n新表\n');
    expect(replaceSection(once, API_HEADING_RE, '## API\n\n新表\n')).toBe(once);
    expect(once.match(/^## API$/gm)).toHaveLength(1);
  });

  it('段不存在时返回 null', () => {
    expect(extractSection('# 标题\n\n## 其他\n', API_HEADING_RE)).toBeNull();
  });
});

describe('replaceSection', () => {
  it('整段替换并与后一个二级标题留一个空行', () => {
    const md = '## API\n\n旧正文\n\n## 其他\n\n别的\n';
    expect(replaceSection(md, API_HEADING_RE, '## API\n\n新正文')).toBe(
      '## API\n\n新正文\n\n## 其他\n\n别的\n',
    );
  });

  it('段在文末时替换到文末', () => {
    expect(replaceSection('# 标题\n\n## API\n\n旧正文\n', API_HEADING_RE, '## API\n\n新正文')).toBe(
      '# 标题\n\n## API\n\n新正文\n',
    );
  });

  it('没有该段时追加到文末', () => {
    expect(replaceSection('# 标题\n\n正文\n', API_HEADING_RE, '## API\n\n新正文')).toBe(
      '# 标题\n\n正文\n\n## API\n\n新正文\n',
    );
  });

  it('前后调用结果一致', () => {
    const section = '## API\n\n新正文';
    const once = replaceSection('## API\n\n旧\n\n## 其他\n', API_HEADING_RE, section);
    expect(replaceSection(once, API_HEADING_RE, section)).toBe(once);
  });
});

describe('stripHeading', () => {
  it('去掉段首的二级标题', () => {
    expect(stripHeading('## API\n\n正文\n')).toBe('正文');
  });
});

describe('TYPES_HEADING_RE', () => {
  it('只匹配精确的二级标题', () => {
    expect(TYPES_HEADING_RE.test('## 类型定义')).toBe(true);
    expect(TYPES_HEADING_RE.test('## 类型定义  ')).toBe(true);
    expect(TYPES_HEADING_RE.test('## 类型定义与工具')).toBe(false);
    expect(TYPES_HEADING_RE.test('### 类型定义')).toBe(false);
  });
});
