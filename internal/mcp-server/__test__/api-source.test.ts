import { describe, expect, it } from 'vitest';
import { loadApiIndex, parseApiIndex, toApiDefinitions } from '../src/utils/api-source';
import type { ApiSourcePackage } from '../src/utils/api-source';

const sample: ApiSourcePackage = {
  package: '@aix/menu',
  components: [
    {
      name: 'Menu',
      file: 'src/Menu.vue',
      props: [
        {
          name: 'theme',
          type: 'MenuTheme',
          resolvedType: "'gray' | 'white' | (string & {})",
          values: ['gray', 'white'],
          defaultValue: "'gray'",
          required: false,
          description: '配色主题',
        },
        { name: 'items', type: 'MenuItemData<M>[]', required: false, description: '' },
      ],
      events: [{ name: 'select', params: 'payload: MenuSelectPayload<M>', description: '选中' }],
      slots: [{ name: 'item', params: 'props: MenuItemSlotProps<M>', description: '自定义叶子项' }],
    },
    {
      name: 'MenuItem',
      file: 'src/components/MenuItem.vue',
      props: [{ name: 'itemKey', type: 'string', required: true, description: '唯一标识' }],
      events: [],
      slots: [{ name: 'default', description: '' }],
    },
  ],
};

describe('parseApiIndex', () => {
  it('按包名建立索引，跳过没有 components 的条目', () => {
    const index = parseApiIndex(
      JSON.stringify({
        packages: { '@aix/menu': sample, '@aix/broken': { package: '@aix/broken' } },
      }),
    );

    expect([...index.keys()]).toEqual(['@aix/menu']);
    expect(index.get('@aix/menu')?.components.map((c) => c.name)).toEqual(['Menu', 'MenuItem']);
  });

  it('个别包解析失败时其余包仍入索引', () => {
    const index = parseApiIndex(
      JSON.stringify({
        packages: { '@aix/menu': sample },
        failures: [{ dirName: 'broken', message: 'boom' }],
      }),
    );

    expect([...index.keys()]).toEqual(['@aix/menu']);
  });

  it('缺少 packages 字段时得到空索引', () => {
    expect(parseApiIndex('{}').size).toBe(0);
  });
});

describe('loadApiIndex', () => {
  it('没有仓库根或仓库里没有文档管线脚本时返回 null', async () => {
    expect(await loadApiIndex(null)).toBeNull();
    expect(await loadApiIndex('/definitely/not/a/repo')).toBeNull();
  });
});

describe('toApiDefinitions', () => {
  it('group 取组件名，类型优先用展开文本，字面量可选值进 enum', () => {
    const { props, emits, slots } = toApiDefinitions(sample);

    expect(props).toEqual([
      {
        name: 'theme',
        type: "'gray' | 'white' | (string & {})",
        required: false,
        description: '配色主题',
        defaultValue: "'gray'",
        enum: ['gray', 'white'],
        group: 'Menu',
      },
      {
        name: 'items',
        type: 'MenuItemData<M>[]',
        required: false,
        description: '',
        defaultValue: undefined,
        enum: undefined,
        group: 'Menu',
      },
      {
        name: 'itemKey',
        type: 'string',
        required: true,
        description: '唯一标识',
        defaultValue: undefined,
        enum: undefined,
        group: 'MenuItem',
      },
    ]);
    expect(emits).toEqual([
      {
        name: 'select',
        params: 'payload: MenuSelectPayload<M>',
        description: '选中',
        group: 'Menu',
      },
    ]);
    expect(slots).toEqual([
      {
        name: 'item',
        description: '自定义叶子项',
        scope: 'props: MenuItemSlotProps<M>',
        group: 'Menu',
      },
      { name: 'default', description: undefined, scope: undefined, group: 'MenuItem' },
    ]);
  });
});
