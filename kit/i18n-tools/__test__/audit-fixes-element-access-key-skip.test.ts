import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';
import { ReactTextExtractor } from '../src/strategies/react/ReactTextExtractor';

/**
 * 回归：计算属性访问的中文字面量 key（`map['进行中']`）不应被提取。
 *
 * 根因：isExtractableStringLiteral 排除了对象字面量定义 key（`{ '进行中': x }`）、
 * import 路径、比较/case 操作数，但未排除 ElementAccessExpression 的实参字面量。
 * 于是访问侧 `map['进行中']` 被当可见文案提取替换为 `map[t(...)]`，运行时返回译文，
 * 与定义侧（已被保留的 `{ '进行中': x }`）不匹配，查找落空——与 === 操作数同类不对称风险。
 *
 * 修复：isExtractableStringLiteral 增加 ElementAccessExpression 实参排除。
 */
describe('计算属性访问的中文 key 不被误提取', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-elem-access-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("Vue <script>：map['中文'] 的 key 不被提取", async () => {
    const file = path.join(tmpDir, 'A.vue');
    fs.writeFileSync(
      file,
      `<template><div /></template>
<script setup>
const statusMap = { '进行中': 'green' };
const color = statusMap['进行中'];
</script>`,
    );
    const result = await new VueTextExtractor({ name: 'vue-i18n' } as never).extractFromFile(file);
    expect(result.map((r) => r.original)).not.toContain('进行中');
  });

  it("React .tsx：map['中文'] 的 key 不被提取", async () => {
    const file = path.join(tmpDir, 'A.tsx');
    fs.writeFileSync(
      file,
      `export function f(statusMap: Record<string, string>) {
  return statusMap['进行中'];
}`,
    );
    const result = await new ReactTextExtractor().extractFromFile(file);
    expect(result.map((r) => r.original)).not.toContain('进行中');
  });

  it('控制用例：普通中文展示文案仍被提取', async () => {
    const file = path.join(tmpDir, 'B.tsx');
    fs.writeFileSync(
      file,
      `export function f() {
  const title = '请输入姓名';
  return title;
}`,
    );
    const result = await new ReactTextExtractor().extractFromFile(file);
    expect(result.map((r) => r.original)).toContain('请输入姓名');
  });
});
