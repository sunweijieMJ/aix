import { describe, expect, it } from 'vitest';
import type { ApiComponent, ApiPackage } from '../docs/api-model';
import { renderApiBody, sanitizeCell } from '../docs/api-markdown';

function component(overrides: Partial<ApiComponent> = {}): ApiComponent {
  return {
    name: 'Demo',
    file: 'src/Demo.vue',
    props: [],
    events: [],
    slots: [],
    expose: [],
    ...overrides,
  };
}

function pkg(components: ApiComponent[]): ApiPackage {
  return { package: '@aix/demo', generatedBy: 'pnpm docs:gen', components };
}

describe('sanitizeCell', () => {
  it('压缩换行与连续空白', () => {
    expect(sanitizeCell('第一行\n  第二行')).toBe('第一行第二行');
    expect(sanitizeCell('a   b')).toBe('a b');
  });

  it('空行分段转成 <br>', () => {
    expect(sanitizeCell('第一段。\n\n第二段。')).toBe('第一段。<br>第二段。');
    expect(sanitizeCell('第一段。  \n   \n  第二段。')).toBe('第一段。<br>第二段。');
  });

  it('列表项起头转成 <br>', () => {
    expect(sanitizeCell('取值：\n- 甲\n- 乙')).toBe('取值：<br>- 甲<br>- 乙');
    expect(sanitizeCell('步骤：\n1. 甲\n2. 乙')).toBe('步骤：<br>1. 甲<br>2. 乙');
  });

  it('句中普通换行仍压成一行', () => {
    expect(sanitizeCell('一句话太长\n于是换了行')).toBe('一句话太长于是换了行');
  });

  it('转义未转义的竖线', () => {
    expect(sanitizeCell("'a' | 'b'")).toBe("'a' \\| 'b'");
    expect(sanitizeCell("'a' \\| 'b'")).toBe("'a' \\| 'b'");
  });

  it('代码段之外的双下划线转义掉', () => {
    expect(sanitizeCell('见 __test__/Demo.test.ts')).toBe('见 \\_\\_test\\_\\_/Demo.test.ts');
    expect(sanitizeCell('见 `__test__`')).toBe('见 `__test__`');
  });
});

describe('renderApiBody', () => {
  it('单组件包的表不带组件名前缀', () => {
    const body = renderApiBody(
      pkg([
        component({
          props: [{ name: 'size', type: 'string', required: false, description: '尺寸' }],
        }),
      ]),
    );
    expect(body).toContain('### Props');
    expect(body).not.toContain('### Demo Props');
  });

  it('多组件包的表带组件名前缀并以分隔线隔开', () => {
    const body = renderApiBody(
      pkg([
        component({
          name: 'A',
          props: [{ name: 'a', type: 'string', required: true, description: '甲' }],
        }),
        component({
          name: 'B',
          props: [{ name: 'b', type: 'string', required: false, description: '乙' }],
        }),
      ]),
    );
    expect(body).toContain('### A Props');
    expect(body).toContain('### B Props');
    expect(body).toContain('---');
  });

  it('一张表都没有的组件保留标题', () => {
    const body = renderApiBody(
      pkg([component({ name: 'A', slots: [] }), component({ name: 'B' })]),
    );
    expect(body).toContain('### A\n\n暂无对外 API。');
    expect(body).toContain('### B\n\n暂无对外 API。');
  });

  it('单组件包一张表都没有时同样保留标题', () => {
    expect(renderApiBody(pkg([component({ name: 'A' })]))).toBe('### A\n\n暂无对外 API。\n');
  });

  it('一个组件都没有时整段只留一句话', () => {
    expect(renderApiBody(pkg([]))).toBe('暂无对外 API。\n');
  });

  it('组件说明冠以组件名渲染成段落，换行原样保留', () => {
    const body = renderApiBody(
      pkg([
        component({
          name: 'A',
          description: '甲组件：\n- 第一点；\n- 第二点。',
          props: [{ name: 'a', type: 'string', required: false, description: '甲' }],
        }),
      ]),
    );
    expect(body).toContain('**A** — 甲组件：\n- 第一点；\n- 第二点。\n\n### Props');
  });

  it('propsNote 代替 Props 表', () => {
    const body = renderApiBody(pkg([component({ propsNote: 'Props 由上游注入。', name: 'A' })]));
    expect(body).toContain('### Props\n\nProps 由上游注入。');
    expect(body).not.toContain('| 属性名 |');
  });

  it('必填与默认值列按标记渲染', () => {
    const body = renderApiBody(
      pkg([
        component({
          props: [
            { name: 'a', type: 'string', required: true, description: '甲' },
            { name: 'b', type: 'number', required: false, defaultValue: '1', description: '乙' },
          ],
        }),
      ]),
    );
    expect(body).toContain('| `a` | `string` | - | ✅ | 甲 |');
    expect(body).toContain('| `b` | `number` | `1` | - | 乙 |');
  });

  it('展开过的别名优先于声明文本', () => {
    const body = renderApiBody(
      pkg([
        component({
          props: [
            {
              name: 'theme',
              type: 'MenuTheme',
              resolvedType: "'gray' | 'white'",
              required: false,
              description: '主题',
            },
          ],
        }),
      ]),
    );
    expect(body).toContain("`'gray' \\| 'white'`");
    expect(body).not.toContain('`MenuTheme`');
  });
});
