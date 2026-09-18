import { describe, expect, it } from 'vitest';
import {
  API_HEADING_RE,
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
