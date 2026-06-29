import { describe, it, expect } from 'vitest';
import { VueRestoreTransformer } from '../src/strategies/vue/VueRestoreTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { VueI18nextLibrary } from '../src/strategies/vue/libraries/vue-i18next';
import type { VueI18nLibrary } from '../src/strategies/vue/libraries';

/**
 * Vue 模板还原引擎测试（此前零覆盖：restore-cleanup-import.test.ts 全是 <script setup>
 * import 清理，VueRestoreTransformer.restoreTemplate 的三个 pass 一行没测）。
 *
 * 镜像 React 端 react-restore-jsx-mixed.test.ts，覆盖模板四种还原上下文 + 命名空间剥离
 * + 不可还原守卫。直接调静态 restoreVueFile（与 restore-cleanup-import.test.ts 同风格）。
 */
describe('VueRestoreTransformer 模板还原', () => {
  const vi18n = new VueI18nLibraryImpl();
  const restore = (src: string, map: Record<string, string>, lib: VueI18nLibrary = vi18n): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

  it('pass1：{{ $t(key) }} 文本插值 → 还原回文本节点中文', () => {
    const src = `<template>\n  <div>{{ $t('m.submit') }}</div>\n</template>\n`;
    const out = restore(src, { 'm.submit': '提交' });
    expect(out).toContain('<div>提交</div>');
    expect(out).not.toContain('$t');
  });

  it('pass2：:attr="$t(key)" 属性绑定 → 还原回静态属性', () => {
    const src = `<template>\n  <el-button :title="$t('m.confirm')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.confirm': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain(':title');
    expect(out).not.toContain('$t');
  });

  it("pass2：单引号外层 :attr='$t(key)' 也能还原（不产出非法语法）", () => {
    const src = `<template>\n  <el-tag :label='$t('m.k')'>x</el-tag>\n</template>\n`;
    const out = restore(src, { 'm.k': '标签' });
    expect(out).toContain('label="标签"');
    expect(out).not.toContain('$t');
    // 不得产出 :label=''标签'' 这种无效语法
    expect(out).not.toMatch(/''/);
  });

  it('pass3：三元内层 $t 调用 → 各自还原为字符串字面量（保留三元结构）', () => {
    const src = `<template>\n  <div>{{ ok ? $t('a') : $t('b') }}</div>\n</template>\n`;
    const out = restore(src, { a: '成功', b: '失败' });
    expect(out).toContain("ok ? '成功' : '失败'");
    expect(out).not.toContain('$t');
  });

  it('带变量：{{ $t(key, { name: expr }) }} → 文本插值 {{ expr }}', () => {
    const src = `<template>\n  <div>{{ $t('w.hello', { name: userName }) }}</div>\n</template>\n`;
    const out = restore(src, { 'w.hello': '欢迎 {name}' });
    expect(out).toContain('欢迎 {{ userName }}');
    expect(out).not.toContain('$t');
  });

  it('vue-i18next：$t(ns:key) 命名空间前缀在还原时被剥离', () => {
    const src = `<template>\n  <div>{{ $t('app:greeting') }}</div>\n</template>\n`;
    // locale 中只存无命名空间的 key
    const out = restore(src, { greeting: '你好' }, new VueI18nextLibrary());
    expect(out).toContain('<div>你好</div>');
    expect(out).not.toContain('$t');
  });

  it('守卫：locale 查不到的 key → $t 调用原样保留，不误删', () => {
    const src = `<template>\n  <div>{{ $t('missing.key') }}</div>\n</template>\n`;
    const out = restore(src, { other: '别的' });
    expect(out).toContain("$t('missing.key')");
  });

  it("PUA 防重入：locale 文本里碰巧含 t('x') 字面量不被二次替换", () => {
    const src = `<template>\n  <div>{{ $t('doc.tip') }}</div>\n</template>\n`;
    // 还原文本本身含形似 i18n 调用的字面串
    const out = restore(src, { 'doc.tip': "调用 t('foo') 函数", foo: '不应命中' });
    expect(out).toContain("调用 t('foo') 函数");
    expect(out).not.toContain('不应命中');
  });
});

/**
 * 回归：restoreTemplate pass 2 把 :attr="$t('key')" 还原成静态属性时，直接把 locale 文本
 * 原样插进双引号属性值，不转义。若译文含双引号（如 Click "OK"），输出 attr="Click "OK""
 * 引号失衡 → 破坏整个标签解析。带变量分支把文本包进反引号模板字面量塞进双引号属性，文本里
 * 的双引号/反引号同样破坏标记。脚本侧带变量分支会转义，属性侧完全没有，提取/还原不对称。
 * 修复：静态属性值做属性转义（&/"/<>→实体）；带变量分支转义反引号/${ 与外层双引号。
 */
describe('VueRestoreTransformer 属性还原转义', () => {
  const lib = new VueI18nLibraryImpl();
  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

  it('静态属性译文含双引号 → 转义为 &quot;，不产出引号失衡的属性', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': 'Click "OK" now' });
    expect(out).toContain('&quot;'); // 双引号被转义
    expect(out).not.toContain('"OK"'); // 不残留会破坏属性的裸引号
    expect(out).not.toContain('$t');
  });

  it('静态属性译文含 & → 转义为 &amp;（与提取解码对称，可往返）', () => {
    const src = `<template>\n  <el-tag :label="$t('m.k')">x</el-tag>\n</template>\n`;
    const out = restore(src, { 'm.k': '保存 & 关闭' });
    expect(out).toContain('label="保存 &amp; 关闭"');
  });

  it('普通译文（无特殊字符）静态属性仍按原样还原', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
  });

  it('带变量属性译文含双引号 → 转义且保留 ${expr} 插值', () => {
    const src = `<template>\n  <el-input :placeholder="$t('m.p', { n: count })">x</el-input>\n</template>\n`;
    const out = restore(src, { 'm.p': 'Say "hi" {n}' });
    expect(out).toContain('${count}'); // 变量插值保留
    expect(out).toContain('&quot;'); // 双引号被转义，不破坏外层双引号属性
    expect(out).not.toContain('"hi"');
  });
});

/**
 * 守卫：restore 清理「t 的来源」（hook 声明 `const { t } = useI18n()` + useI18n 导入；
 * 或 standalone 的 `import { t } from <tImport>`）时，若仍有未被还原的存活 t() 调用
 * （locale 缺 key / 动态 key），不得删除来源，否则产出未定义标识符（TS2304）。
 *
 * 此前 SFC 仅守卫了模块 import，hook 声明无条件删；standalone 路径 import 与 hook 声明
 * 都无条件删。本组用例锁定两条路径在「部分还原」下的对称行为。
 */
describe('VueRestoreTransformer t 来源删除守卫（部分还原）', () => {
  const lib = new VueI18nLibraryImpl();

  // --- SFC：hook 提供 t ---
  it('SFC：存活 t() 调用时保留 useI18n hook 声明与导入', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
const b = t('missing');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib);
    expect(out).toContain('你好'); // 命中的已还原
    expect(out).toMatch(/t\('missing'\)/); // 存活调用保留
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/); // hook 声明保留
    expect(out).toMatch(/import\s*\{\s*useI18n\s*\}\s*from\s*['"]vue-i18n['"]/); // 来源导入保留
  });

  it('SFC：全部还原后无残留 t() → 仍清理 hook 声明与导入（不回归）', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
</script>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { k: '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useI18n\(\)/);
    expect(out).not.toMatch(/const\s*\{\s*t\s*\}/);
    expect(out).not.toMatch(/import.*vue-i18n/);
  });

  // --- standalone .ts：自定义 tImport ---
  it('standalone：存活 t() 调用时保留 import { t }', () => {
    const code = `import { t } from '@/plugins/locale';
const a = t('k');
const b = t('missing');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(
      code,
      { k: '你好' },
      lib,
      '@/plugins/locale',
    );
    expect(out).toContain('你好');
    expect(out).toMatch(/t\('missing'\)/);
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
  });

  it('standalone：全部还原后删除死 import { t }（不回归）', () => {
    const code = `import { t } from '@/plugins/locale';
const a = t('k');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(
      code,
      { k: '你好' },
      lib,
      '@/plugins/locale',
    );
    expect(out).toContain('你好');
    expect(out).not.toMatch(/import\s*\{\s*t\s*\}/);
  });

  // --- standalone .ts：hook 提供 t ---
  it('standalone：存活 t() 调用时保留 useI18n hook 声明与导入', () => {
    const code = `import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('k');
const b = t('missing');
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(code, { k: '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).toMatch(/t\('missing'\)/);
    expect(out).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    expect(out).toMatch(/import\s*\{\s*useI18n\s*\}\s*from\s*['"]vue-i18n['"]/);
  });
});

/**
 * 回归：restoreTemplate pass 2 的属性绑定正则原以 `:([\w-]+)=` 为锚点，假定一律是简写
 * `:attr=`。遇到 Vue 官方同样合法的完整写法 `v-bind:title="$t('k')"` 时，正则只从中间的
 * `:title=` 匹配，把它替换为静态属性后残留 `v-bind` 前缀 → 拼出非法属性名 `v-bindtitle`。
 * 修复：锚点改 `(?:v-bind)?:`，完整写法下连同 `v-bind` 前缀一起替换。
 */
describe('VueRestoreTransformer — v-bind 完整语法还原', () => {
  const lib = new VueI18nLibraryImpl();
  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

  it('完整写法 v-bind:title="$t()" → 还原为静态属性 title，不残留 v-bind', () => {
    const src = `<template>\n  <el-button v-bind:title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain('v-bindtitle');
    expect(out).not.toContain('v-bind:title');
    expect(out).not.toContain('$t');
  });

  it('完整写法带变量 v-bind:placeholder="$t(k,{...})" → 保留动态绑定与插值', () => {
    const src = `<template>\n  <el-input v-bind:placeholder="$t('m.p', { n: count })">x</el-input>\n</template>\n`;
    const out = restore(src, { 'm.p': '剩余 {n} 项' });
    expect(out).toContain('${count}');
    expect(out).not.toContain('v-bindplaceholder');
    expect(out).not.toContain('$t');
  });

  it('简写 :title="$t()" 仍正常还原（无回归）', () => {
    const src = `<template>\n  <el-button :title="$t('m.k')">x</el-button>\n</template>\n`;
    const out = restore(src, { 'm.k': '确认' });
    expect(out).toContain('title="确认"');
    expect(out).not.toContain('$t');
  });
});

/**
 * 回归：还原**多键** hook 解构 `const { t, locale } = useI18n()` 且所有 t() 都能还原时，
 * cleanupImports 无条件摘除 `import { useI18n }`，而 cleanupHookDeclarations 的正则
 * `/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/` 只匹配恰好单键 `{ t }`、对 `{ t, locale }` 不命中
 * → 声明保留、import 被删 → `useI18n` 悬空（ReferenceError / TS2304）。
 *
 * 根因：isTNameUnusedInScript 仅看 t 还有无引用（还原后无引用即放行），删 import 这一步
 * 缺少 generate 侧 VueImportManager.removeHookImportAndDeclaration 的 hookCallStillUsed 守卫
 * （仍有 useI18n( 调用就不删 import）。典型 import/声明 不对称缺陷。
 */
describe('VueRestoreTransformer — 多键 useI18n 解构清理对称（回归）', () => {
  const lib = new VueI18nLibraryImpl();

  it('多键 const { t, locale } = useI18n() + 全部 t() 可还原 → 保留 import，不留悬空 useI18n', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const msg = t('m.hello');
function toggle() { locale.value = 'en'; }
</script>
<template><div>{{ msg }}</div></template>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { 'm.hello': '你好' }, lib);

    // 可还原的 t() 被替换为中文
    expect(out).toContain('你好');
    // locale 仍被 toggle 使用 → 含 useI18n() 的声明必须保留
    expect(out).toContain('locale.value');
    expect(out, `还原输出：\n${out}`).toMatch(/=\s*useI18n\(\)/);
    // 关键：声明仍调用 useI18n() → 其 import 必须一并保留，否则 useI18n 未定义
    expect(out, `还原输出：\n${out}`).toMatch(
      /import\s*\{[^}]*useI18n[^}]*\}\s*from\s*['"]vue-i18n['"]/,
    );
  });

  it('对照：单键 const { t } = useI18n() 全部可还原 → 声明与 import 一并清除（不回归）', () => {
    const code = `<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const msg = t('m.hello');
</script>
<template><div>{{ msg }}</div></template>`;
    const out = VueRestoreTransformer.restoreVueFile(code, { 'm.hello': '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).not.toMatch(/useI18n\(\)/);
    expect(out).not.toMatch(/import.*vue-i18n/);
  });

  it('standalone .ts 多键 const { t, locale } = useI18n() + 全部可还原 → 保留 import（姊妹路径同缺陷）', () => {
    const code = `import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const msg = t('m.hello');
function toggle() { locale.value = 'en'; }
`;
    const out = VueRestoreTransformer.restoreStandaloneScript(code, { 'm.hello': '你好' }, lib);
    expect(out).toContain('你好');
    expect(out).toContain('locale.value');
    expect(out, `还原输出：\n${out}`).toMatch(/=\s*useI18n\(\)/);
    expect(out, `还原输出：\n${out}`).toMatch(
      /import\s*\{[^}]*useI18n[^}]*\}\s*from\s*['"]vue-i18n['"]/,
    );
  });
});
