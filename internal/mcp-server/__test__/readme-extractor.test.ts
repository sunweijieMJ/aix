import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { ReadmeExtractor } from '../src/extractors/readme-extractor';
import type { EmitDefinition, PropDefinition, SlotDefinition } from '../src/types/index';
import { toSubComponentName } from '../src/utils/sub-component';

describe('ReadmeExtractor', () => {
  const extractor = new ReadmeExtractor();

  it('应该能够从Button组件README中提取信息', async () => {
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
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
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result).toBeTruthy();
    expect(result?.title).toContain('button');
    expect(result?.description).toBeTruthy();
    expect(result?.features.length).toBeGreaterThan(0);
    expect(result?.category).toBe('通用');
  });

  it('应该正确提取Props定义', async () => {
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result?.props).toBeTruthy();
    expect(result?.props.length).toBeGreaterThan(0);

    // 检查是否包含button的基本props
    const typeProps = result?.props.find((p) => p.name === 'type');
    expect(typeProps).toBeTruthy();
    expect(typeProps?.type).toContain('primary'); // 检查type包含字面量类型
  });

  it('应该正确提取代码示例', async () => {
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result?.examples).toBeTruthy();
    expect(result?.examples.length).toBeGreaterThan(0);

    const firstExample = result?.examples[0];
    expect(firstExample?.code).toContain('Button');
    expect(firstExample?.language).toBe('vue');
  });

  it('应该正确提取特性列表', async () => {
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
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
    const readmePath = join(import.meta.dirname, '../../../packages/button/README.md');
    const result = await extractor.extractFromReadme(readmePath);

    expect(result).toBeTruthy();
    expect(result?.category).toBe('通用');
  });

  it('应该处理不存在的文件', async () => {
    const result = await extractor.extractFromReadme('/non/existent/file.md');
    expect(result).toBeNull();
  });
});

describe('ReadmeExtractor 表格解析', () => {
  const extractor = new ReadmeExtractor();
  const parse = (md: string) => (extractor as any).extractApiTables(md);

  it('应该按列名而非列序定位数据', () => {
    // 列序和主流格式完全不同：说明在第二列，默认值在最后
    const md = `## API

| 属性名 | 说明 | 类型 | 可选值 | 默认值 |
| --- | --- | --- | --- | --- |
| size | 尺寸 | \`string\` | small \\| large | medium |
`;
    const { props } = parse(md);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({
      name: 'size',
      type: 'string',
      description: '尺寸',
      defaultValue: 'medium',
      enum: ['small', 'large'],
    });
  });

  it('空单元格不应该导致后续列错位或整行丢失', () => {
    const md = `## API

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| disabled | \`boolean\` |  | ❌ | 是否禁用 |
`;
    const { props } = parse(md);
    expect(props).toHaveLength(1);
    expect(props[0]).toMatchObject({
      name: 'disabled',
      type: 'boolean',
      required: false,
      description: '是否禁用',
    });
    expect(props[0].defaultValue).toBeUndefined();
  });

  it('没有默认值不等于必填，只认显式的必填列', () => {
    const md = `## API

| 属性名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| modelValue | \`string\` | - | 绑定值 |
`;
    expect(parse(md).props[0].required).toBe(false);
  });

  it('不要求表格挂在 ## API 标题下，并记录所属章节', () => {
    const md = `## UI 组件

### WaveformCanvas

| 属性名 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| barWidth | \`number\` | 2 | ❌ | 柱宽 |
`;
    const { props } = parse(md);
    expect(props).toHaveLength(1);
    expect(props[0].group).toBe('WaveformCanvas');
  });

  it('应该分别提取 Emits 和 Slots', () => {
    const md = `## API

| 事件名 | 参数 | 说明 |
| --- | --- | --- |
| click | \`MouseEvent\` | 点击时触发 |

| 插槽名 | 说明 |
| --- | --- |
| default | 按钮内容 |
`;
    const { emits, slots } = parse(md);
    expect(emits).toEqual([
      expect.objectContaining({ name: 'click', params: 'MouseEvent', description: '点击时触发' }),
    ]);
    expect(slots).toEqual([expect.objectContaining({ name: 'default', description: '按钮内容' })]);
  });

  it('同名 API 不应该被别的子组件顶掉，且各自保留自己的默认值', () => {
    // popper 包的真实形态：Popper / Tooltip 两个子组件各有一张表，
    // 共享 placement / arrowSize 这些名字，但默认值不同。
    // 只按名字去重会让 Tooltip 拿到 Popper 的 'bottom'，是错值而不是缺值。
    const md = `## API

### Popper Props

| 属性名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| placement | \`Placement\` | 'bottom' | 浮动元素位置 |
| arrowSize | \`number\` | 8 | 箭头大小 |

### Tooltip Props

| 属性名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| placement | \`Placement\` | 'top' | 弹出位置 |
| arrowSize | \`number\` | 6 | 箭头大小 |
| content | \`string\` | - | 提示内容 |
`;
    const { props } = parse(md);
    expect(props).toHaveLength(5);

    const byGroup = (group: string) =>
      props.filter((p: PropDefinition) => p.group === group).map((p: PropDefinition) => p.name);
    expect(byGroup('Popper Props')).toEqual(['placement', 'arrowSize']);
    expect(byGroup('Tooltip Props')).toEqual(['placement', 'arrowSize', 'content']);

    const tooltipPlacement = props.find(
      (p: PropDefinition) => p.name === 'placement' && p.group === 'Tooltip Props',
    );
    expect(tooltipPlacement.defaultValue).toBe("'top'");
    const popperPlacement = props.find(
      (p: PropDefinition) => p.name === 'placement' && p.group === 'Popper Props',
    );
    expect(popperPlacement.defaultValue).toBe("'bottom'");
  });

  it('同名 Emits / Slots 同样按章节各留一份', () => {
    const md = `## API

### Popper Events

| 事件名 | 参数 | 说明 |
| --- | --- | --- |
| update:open | \`boolean\` | 显示状态变更 |

### Popper Slots

| 插槽名 | 说明 |
| --- | --- |
| default | 浮动内容 |

### Tooltip Events

| 事件名 | 参数 | 说明 |
| --- | --- | --- |
| update:open | \`boolean\` | 提示显示状态变更 |

### Tooltip Slots

| 插槽名 | 说明 |
| --- | --- |
| default | 触发元素 |
`;
    const { emits, slots } = parse(md);
    expect(emits).toHaveLength(2);
    expect(emits.map((e: EmitDefinition) => e.group)).toEqual(['Popper Events', 'Tooltip Events']);
    expect(emits[1].description).toBe('提示显示状态变更');

    expect(slots).toHaveLength(2);
    expect(slots.map((s: SlotDefinition) => s.group)).toEqual(['Popper Slots', 'Tooltip Slots']);
    expect(slots[1].description).toBe('触发元素');
  });

  it('同一章节内重复出现的同名条目仍然只留第一条', () => {
    const md = `## API

| 属性名 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| size | \`string\` | medium | 尺寸 |
| size | \`string\` | large | 重复行 |
`;
    const { props } = parse(md);
    expect(props).toHaveLength(1);
    expect(props[0].defaultValue).toBe('medium');
  });

  it('type / enum 不应该带 markdown 转义和反引号', () => {
    // `\|` 是表格里管道符的必要转义，反引号是排版；留在数据里会变成
    // `number \| string` 这种照抄即错的类型标注
    const md = `## API

| 属性名 | 类型 | 可选值 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| width | \`number \\| string\` | - | - | 宽度 |
| locale |  | \`'zh-CN'\` \\| \`'en-US'\` | \`'zh-CN'\` | 语言 |
`;
    const { props } = parse(md);

    expect(props[0].type).toBe('number | string');
    // 没有类型列时用可选值兜底，同样不能带转义
    expect(props[1].type).toBe("'zh-CN' | 'en-US'");
    expect(props[1].enum).toEqual(["'zh-CN'", "'en-US'"]);
    expect(props[1].defaultValue).toBe("'zh-CN'");
  });

  it('说明性表格不应该被当成 props', () => {
    // 没有类型/默认值/可选值列，只是普通的说明表
    const md = `## 说明

| 配置 | 求值时机 |
| --- | --- |
| theme | 挂载时 |
`;
    expect(parse(md).props).toHaveLength(0);
  });
});

describe('toSubComponentName', () => {
  it('应该从章节标题识别出真正的组件名', () => {
    expect(toSubComponentName('Tooltip Props')).toBe('Tooltip');
    expect(toSubComponentName('Dropdown Events')).toBe('Dropdown');
    expect(toSubComponentName('WaveformCanvas')).toBe('WaveformCanvas');
    expect(toSubComponentName('DropdownItem 插槽')).toBe('DropdownItem');
  });

  it('不应该把非组件名的章节标题当成组件', () => {
    // 这些都是仓库里真实出现过的标题，按组件名处理会造出不存在的条目
    expect(toSubComponentName('Props')).toBeNull();
    expect(toSubComponentName('Events')).toBeNull();
    expect(toSubComponentName('createLocale')).toBeNull(); // camelCase：函数不是组件
    expect(toSubComponentName('音频来源契约')).toBeNull();
    expect(toSubComponentName('generateThemeCSS - 构建时生成主题 CSS')).toBeNull();
    expect(toSubComponentName('命名插槽穿透块内部（<块类型>-<内部slot名>）')).toBeNull();
    expect(toSubComponentName(undefined)).toBeNull();
  });
});
