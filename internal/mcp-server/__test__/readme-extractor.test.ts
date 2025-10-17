import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ReadmeExtractor } from '../src/extractors/readme-extractor';

describe('ReadmeExtractor', () => {
  const extractor = new ReadmeExtractor();

  it('应该能够从Button组件README中提取信息', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result).toBeTruthy();
    expect(result?.title).toContain('button');
    expect(result?.description).toBeTruthy();
    expect(result?.features.length).toBeGreaterThan(0);
    expect(result?.examples.length).toBeGreaterThan(0);
    expect(result?.props.length).toBeGreaterThan(0);
    expect(result?.category).toBe('通用');
    expect(result?.tags).toContain('@aix/button');
  });

  it('应该能够从Button组件README中提取完整信息', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result).toBeTruthy();
    expect(result?.title).toContain('button');
    expect(result?.description).toBeTruthy();
    expect(result?.features.length).toBeGreaterThan(0);
    expect(result?.category).toBe('通用');
  });

  it('应该正确提取Props定义', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result?.props).toBeTruthy();
    expect(result?.props.length).toBeGreaterThan(0);

    // 检查是否包含button的基本props
    const typeProps = result?.props.find((p) => p.name === 'type');
    expect(typeProps).toBeTruthy();
    expect(typeProps?.type).toContain('primary'); // 检查type包含字面量类型
  });

  it('应该正确提取代码示例', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result?.examples).toBeTruthy();
    expect(result?.examples.length).toBeGreaterThan(0);

    const firstExample = result?.examples[0];
    expect(firstExample?.code).toContain('Button');
    expect(firstExample?.language).toBe('vue');
  });

  it('应该正确提取特性列表', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result?.features).toBeTruthy();
    expect(result?.features.length).toBeGreaterThan(0);

    // 检查特性是否正确去除了emoji
    const features = result?.features || [];
    features.forEach((feature) => {
      expect(feature).not.toMatch(/^[\u{1F300}-\u{1F9FF}]/u);
      expect(feature.length).toBeGreaterThan(5); // 应该有实际的描述内容
    });
  });

  it('应该正确推断组件分类', async () => {
    const readmePath = join(process.cwd(), '../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result).toBeTruthy();
    expect(result?.category).toBe('通用');
  });

  it('应该处理不存在的文件', async () => {
    const result = await extractor.extractFromReadme('/non/existent/file.md');
    expect(result).toBeNull();
  });
});
