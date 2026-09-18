import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { extractPackageApi } from '../docs/extract-api';

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

async function extract(file: string) {
  const name = path.basename(file, '.vue');
  return extractPackageApi(fixtureDir, '@aix/fixture', [{ name, file }]);
}

describe('extractPackageApi', () => {
  it('组件说明取 setup 块顶部块注释，行中的 @ 不截断正文、行首标签不进正文', async () => {
    const { api } = await extract('DemoCard.vue');
    expect(api.components[0]!.description).toBe(
      '演示卡片：说明里带行中的 @aix/popper 写法，正文不该在这里截断。',
    );
  });

  it('withDefaults 的工厂默认值展开成字面量', async () => {
    const { api } = await extract('DemoCard.vue');
    const rates = api.components[0]!.props.find((p) => p.name === 'rates');
    expect(rates?.defaultValue).toBe('[0.5, 1, 2]');
  });

  it('defineModel 声明的 prop 与 update 事件都进表', async () => {
    const { api } = await extract('DemoCard.vue');
    const component = api.components[0]!;
    const picked = component.props.find((p) => p.name === 'picked');
    expect(picked).toMatchObject({ type: 'string[]', defaultValue: '[]', required: false });
    expect(picked?.description).toBe('已选项（v-model:picked）');
    expect(component.events.map((e) => e.name)).toContain('update:picked');
  });

  it('props 类型解析不出成员时报到 unresolvedProps', async () => {
    const { api, unresolvedProps } = await extract('ExternalProps.vue');
    expect(unresolvedProps).toEqual(['ExternalProps.vue']);
    expect(api.components[0]!.props).toEqual([]);
  });

  it('props 解析得出来的组件不进 unresolvedProps', async () => {
    const { unresolvedProps } = await extract('DemoCard.vue');
    expect(unresolvedProps).toEqual([]);
  });
});
