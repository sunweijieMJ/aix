import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IconsExtractor } from '../src/extractors/icons-extractor';

/** 与真实图标包一致的 Vue SFC 结构 */
const ICON_SFC = `<template>
  <svg
    :width="width"
    :height="height"
    :style="{ color: color }"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    v-bind="$attrs"
  >
    <path d="M3 3h18v18H3z" fill="currentColor" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ width?: number }>();
</script>
`;

describe('IconsExtractor', () => {
  let pkgDir: string;

  beforeEach(async () => {
    pkgDir = await mkdtemp(join(tmpdir(), 'aix-icons-'));
    await mkdir(join(pkgDir, 'src', 'General'), { recursive: true });
    await writeFile(
      join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@aix/icons', version: '0.0.3', license: 'MIT' }),
      'utf8',
    );
    await writeFile(
      join(pkgDir, 'src', 'index.ts'),
      `export { default as IconSearch } from './General/Search.vue';\n`,
      'utf8',
    );
    await writeFile(join(pkgDir, 'src', 'General', 'Search.vue'), ICON_SFC, 'utf8');
  });

  afterEach(async () => {
    await rm(pkgDir, { recursive: true, force: true });
  });

  it('应该产出可独立使用的标准 SVG，不残留 Vue 绑定', async () => {
    const [icon] = await new IconsExtractor().extractIconsFromPackage(pkgDir);

    expect(icon?.svgContent).toBeDefined();
    const svg = icon!.svgContent!;

    // Vue 模板语法在 Vue 之外是无效属性，内联进 HTML 会得到没有尺寸的图标
    expect(svg).not.toContain('v-bind');
    expect(svg).not.toContain(':width');
    expect(svg).not.toContain(':style');

    expect(svg).toContain('width="24"');
    expect(svg).toContain('height="24"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="currentColor"');
  });

  it('绑定值里含 > 时也不应该切错开始标签', async () => {
    await writeFile(
      join(pkgDir, 'src', 'General', 'Search.vue'),
      `<template>\n  <svg v-if="size > 0" :width="width" viewBox="0 0 24 24">\n    <path d="M0 0" />\n  </svg>\n</template>\n`,
      'utf8',
    );

    const [icon] = await new IconsExtractor().extractIconsFromPackage(pkgDir);

    expect(icon?.svgContent).toBe(
      '<svg width="24" viewBox="0 0 24 24">\n  <path d="M0 0" />\n  </svg>',
    );
  });

  it('packageName 必须是可解析的包名', async () => {
    const [icon] = await new IconsExtractor().extractIconsFromPackage(pkgDir);

    // 曾经拼成 @aix/icons/IconSearch，而 exports 映射到 es/<分类>/ 下，解析不到
    expect(icon?.packageName).toBe('@aix/icons');
    expect(icon?.version).toBe('0.0.3');
  });

  it('关键词应该包含中文别名', async () => {
    const [icon] = await new IconsExtractor().extractIconsFromPackage(pkgDir);

    expect(icon?.keywords).toContain('搜索');
    expect(icon?.keywords).toContain('search');
  });

  it('示例应该是 Vue 写法', async () => {
    const [icon] = await new IconsExtractor().extractIconsFromPackage(pkgDir);

    expect(icon?.examples[0]?.language).toBe('vue');
    expect(icon?.examples[0]?.code).toContain('<script setup');
    expect(icon?.examples.some((e) => e.code.includes('@ant-design'))).toBe(false);
  });
});
