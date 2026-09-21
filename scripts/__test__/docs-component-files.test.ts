import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { componentNameFromFile, discoverComponents } from '../docs/component-files';

const created: string[] = [];

async function makePackage(files: Record<string, string>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aix-docs-pkg-'));
  created.push(dir);
  for (const [file, content] of Object.entries(files)) {
    const target = path.join(dir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  return dir;
}

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

const VUE = '<template><div /></template>';

describe('discoverComponents', () => {
  it('识别 import 后具名导出，别名以导出名为准', async () => {
    const dir = await makePackage({
      'src/index.ts': [
        "import Foo from './Foo.vue';",
        "import Bar from './parts/Bar.vue';",
        'export { Foo, Bar as Baz };',
      ].join('\n'),
      'src/Foo.vue': VUE,
      'src/parts/Bar.vue': VUE,
    });
    expect(await discoverComponents(dir)).toEqual([
      { name: 'Foo', file: 'src/Foo.vue' },
      { name: 'Baz', file: path.normalize('src/parts/Bar.vue') },
    ]);
  });

  it('识别 `export { default as X } from` 写法', async () => {
    const dir = await makePackage({
      'src/index.ts': "export { default as Foo } from './Foo.vue';",
      'src/Foo.vue': VUE,
    });
    expect(await discoverComponents(dir)).toEqual([{ name: 'Foo', file: 'src/Foo.vue' }]);
  });

  it('同一源文件导出多次只保留第一个名字', async () => {
    const dir = await makePackage({
      'src/index.ts': "import Foo from './Foo.vue';\nexport { Foo, Foo as AixFoo };",
      'src/Foo.vue': VUE,
    });
    expect(await discoverComponents(dir)).toEqual([{ name: 'Foo', file: 'src/Foo.vue' }]);
  });

  it('非 .vue 的导出与再导出不算组件', async () => {
    const dir = await makePackage({
      'src/index.ts': [
        "import Foo from './Foo.vue';",
        "import { helper } from './helper';",
        'export { Foo, helper };',
        "export * from './types';",
        "export { default as util } from './util';",
      ].join('\n'),
      'src/Foo.vue': VUE,
    });
    expect(await discoverComponents(dir)).toEqual([{ name: 'Foo', file: 'src/Foo.vue' }]);
  });

  it('`export *` 导出 .vue 时报错', async () => {
    const dir = await makePackage({
      'src/index.ts': "export * from './Foo.vue';",
      'src/Foo.vue': VUE,
    });
    await expect(discoverComponents(dir)).rejects.toThrow('export *');
  });

  it('把 .vue 作为默认导出时报错', async () => {
    const dir = await makePackage({
      'src/index.ts': "export { default } from './Foo.vue';",
      'src/Foo.vue': VUE,
    });
    await expect(discoverComponents(dir)).rejects.toThrow('默认导出');
  });

  it('导出的组件文件不存在时报错', async () => {
    const dir = await makePackage({
      'src/index.ts': "export { default as Foo } from './Missing.vue';",
    });
    await expect(discoverComponents(dir)).rejects.toThrow('src/Missing.vue');
  });

  it('入口没有导出 .vue 时退回包根 src/*.vue，index.vue 取包目录名', async () => {
    const dir = await makePackage({
      'src/index.ts': 'export const version = 1;',
      'src/index.vue': VUE,
      'src/Other.vue': VUE,
      'src/nested/Deep.vue': VUE,
    });
    const components = await discoverComponents(dir);
    expect(components.map((c) => c.file)).toEqual(['src/Other.vue', 'src/index.vue']);
    expect(components[1]!.name).toBe(componentNameFromFile(dir, 'src/index.vue'));
  });

  it('没有入口也没有 .vue 时返回空', async () => {
    const dir = await makePackage({ 'src/helper.ts': 'export {};' });
    expect(await discoverComponents(dir)).toEqual([]);
  });
});

describe('componentNameFromFile', () => {
  it('普通文件取文件名，index 取包目录名的 PascalCase', () => {
    expect(componentNameFromFile('/repo/packages/video', 'src/PlaybackControls.vue')).toBe(
      'PlaybackControls',
    );
    expect(componentNameFromFile('/repo/packages/pdf-viewer', 'src/index.vue')).toBe('PdfViewer');
  });
});
