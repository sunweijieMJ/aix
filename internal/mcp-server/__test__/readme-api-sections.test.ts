import { describe, expect, it } from 'vitest';
import { ReadmeExtractor } from '../src/extractors/readme-extractor';

describe('ReadmeExtractor.extractApiSections', () => {
  const extractor = new ReadmeExtractor();

  it('应该从 markdown 中提取 API 段落', () => {
    const content = `# @kit/tracker

描述文字

## 特性

- 特性1

## API

### createTrackerPlugin

创建 Vue 插件。

| 参数 | 类型 | 说明 |
|------|------|------|
| options | object | 配置 |

### useTracker

获取 Tracker 实例。

## 其他

不相关内容
`;

    const sections = extractor.extractApiSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.title).toBe('API');
    expect(sections[0]!.content).toContain('createTrackerPlugin');
    expect(sections[0]!.content).toContain('useTracker');
    expect(sections[0]!.content).not.toContain('不相关内容');
  });

  it('应该匹配多种关键词段落', () => {
    const content = `# @kit/sentinel

描述

## 特性

- 特性1

## CLI 命令

### sentinel install

安装命令

## 配置说明

### base 配置

配置内容

## 许可证

MIT
`;

    const sections = extractor.extractApiSections(content);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toContain('CLI 命令');
    expect(sections.map((s) => s.title)).toContain('配置说明');
  });

  it('应该匹配使用段落', () => {
    const content = `# @kit/eslint-config

描述

## 使用

### 基础配置

代码示例

## 配置说明

表格内容
`;

    const sections = extractor.extractApiSections(content);
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.title)).toContain('使用');
    expect(sections.map((s) => s.title)).toContain('配置说明');
  });

  it('空内容应返回空数组', () => {
    const sections = extractor.extractApiSections('# 标题\n\n描述');
    expect(sections).toEqual([]);
  });
});
