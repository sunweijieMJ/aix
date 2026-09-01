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

  // 回归（审计：restore 二次读盘）：transform 应优先使用调用方已读取的 sourceText，
  // 与 ITransformer 对齐。RestoreProcessor 已 readFileSync 一次用于比对，transform 内
  // 再读同一文件属可避免的重复 IO。传入 sourceText 时不应再读盘。
  it('transform 优先使用传入 sourceText，不再二次读盘（文件不在磁盘也能还原）', () => {
    const src = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst m = t('k');\n</script>\n`;
    const out = new VueRestoreTransformer(vi18n, '@/locale').transform(
      '/__no_such_dir__/Restore.vue', // 不存在：若实现仍 readFileSync 会抛 ENOENT
      { k: '你好' },
      src,
    );
    expect(out).toContain('你好');
  });

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

/**
 * 回归（Bug 1）：对象简写 `{ count }` 的变量还原。旧实现 script 侧只认 PropertyAssignment、
 * template 侧 parseVarMap 对无冒号 segment 直接 continue，简写形态下 varMap 为空 → 占位符
 * `{count}` 被当字面量塞进字符串，变量丢失。修复后简写应与 `{ count: count }` 同形态还原。
 * 另：`{ ...rest }` 之类不可解析形态应保守保留 $t 调用不还原（宁可漏还原也不破坏源码）。
 */
describe('VueRestoreTransformer — 对象简写变量还原（Bug 1）', () => {
  const vi18n = new VueI18nLibraryImpl();
  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, vi18n, '@/locale');

  it('script 侧：`t(k, { count })` 简写 → 模板字面量 `共 ${count} 项`（与非简写同形态）', () => {
    const src = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst count = 3;\nconst msg = t('list.count', { count });\n</script>\n`;
    const out = restore(src, { 'list.count': '共 {count} 项' });
    expect(out).toContain('const msg = `共 ${count} 项`');
    // 不得字面化为单引号串（占位符 {count} 未替换成变量）
    expect(out).not.toContain("'共 {count} 项'");
    expect(out).not.toContain("t('list.count'");
  });

  it('script 侧：非简写 `{ count: count }` 结果一致（对照）', () => {
    const src = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst count = 3;\nconst msg = t('list.count', { count: count });\n</script>\n`;
    const out = restore(src, { 'list.count': '共 {count} 项' });
    expect(out).toContain('const msg = `共 ${count} 项`');
  });

  it('template 侧：`{{ $t(k, { count }) }}` 简写 → `共 {{ count }} 项`', () => {
    const src = `<template>\n  <div>{{ $t('list.count', { count }) }}</div>\n</template>\n`;
    const out = restore(src, { 'list.count': '共 {count} 项' });
    expect(out).toContain('共 {{ count }} 项');
    expect(out).not.toContain('$t');
    expect(out).not.toContain('{count}');
  });

  it('script 侧：`{ ...rest }` 无法解析 → 保守保留原 $t 调用不还原', () => {
    const src = `<script setup lang="ts">\nimport { t } from '@/locale';\nconst msg = t('list.count', { ...rest });\n</script>\n`;
    const out = restore(src, { 'list.count': '共 {count} 项' });
    expect(out).toContain("t('list.count', { ...rest })");
    expect(out).not.toContain('共 {count} 项');
  });

  it('template 侧：`{ ...rest }` 无法解析 → 保守保留原 $t 调用不还原', () => {
    const src = `<template>\n  <div>{{ $t('list.count', { ...rest }) }}</div>\n</template>\n`;
    const out = restore(src, { 'list.count': '共 {count} 项' });
    expect(out).toContain("$t('list.count', { ...rest })");
    expect(out).not.toContain('共 {count} 项');
  });
});

/**
 * Bug：restoreTemplate 三个 pass 对整段 template 全文正则替换，不避开 code/pre/v-pre——
 * 而提取端明确跳过这些逐字区（NON_EXTRACTABLE_ELEMENT_TAGS + v-pre 子树），其内容从未被
 * generate 动过。只要 key 存在于 localeMap，pass 3 就会把示例代码 `t('key')` 改写成译文，
 * 破坏文档型页面的逐字内容。修复：restore 前按提取端同款规则先 stash 逐字区再回填。
 */
describe('逐字区保护：code/pre/v-pre 不被 restore 改写', () => {
  const lib = new VueI18nLibraryImpl();
  const run = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, '@/locale');

  it("<code> 内的 t('key') 字面文本保持原样，区外照常还原", () => {
    const src = `<template>\n  <code>调用 t('home.title') 取标题</code>\n  <div>{{ $t('home.title') }}</div>\n</template>\n`;
    const out = run(src, { 'home.title': '首页标题' });
    expect(out, `还原输出：\n${out}`).toContain(`<code>调用 t('home.title') 取标题</code>`);
    expect(out).toContain('<div>首页标题</div>');
  });

  it('<pre> 内的插值形态 {{ $t(...) }} 同样保持原样', () => {
    const src = `<template>\n  <pre>{{ $t('a') }} 是插值语法示例</pre>\n</template>\n`;
    const out = run(src, { a: '文本' });
    expect(out, `还原输出：\n${out}`).toContain(`<pre>{{ $t('a') }} 是插值语法示例</pre>`);
  });

  it('v-pre 子树（含嵌套元素）整体保持原样', () => {
    const src = `<template>\n  <div v-pre><span>{{ $t('a') }}</span> 与 t('a')</div>\n  <p>{{ $t('a') }}</p>\n</template>\n`;
    const out = run(src, { a: '文本' });
    expect(out, `还原输出：\n${out}`).toContain(
      `<div v-pre><span>{{ $t('a') }}</span> 与 t('a')</div>`,
    );
    expect(out).toContain('<p>文本</p>');
  });

  it('属性值里的 " v-pre " 不误判为指令，元素照常还原', () => {
    const src = `<template>\n  <div title="enable v-pre mode">{{ $t('a') }}</div>\n</template>\n`;
    const out = run(src, { a: '文本' });
    expect(out, `还原输出：\n${out}`).toContain('文本');
    expect(out).not.toContain('$t');
  });

  it('<code-editor> 等以 code 开头的组件名不受保护规则误伤', () => {
    const src = `<template>\n  <code-editor :title="$t('a')">x</code-editor>\n</template>\n`;
    const out = run(src, { a: '标题' });
    expect(out, `还原输出：\n${out}`).toContain('title="标题"');
    expect(out).not.toContain('$t');
  });
});

/**
 * 回归（中文占位符一等化的连带缺口）：parseVarMap 的对象简写判定是纯 ASCII 正则，
 * `$t('key', { 数量 })`（中文简写变量，ESLint object-shorthand 常见产物）走不进简写
 * 分支而整体返回 null → 模板侧永远不还原，与脚本侧 AST 路径（已处理中文 shorthand）
 * 行为不一致。字符集与 PLACEHOLDER_NAME/getVariableNameFromExpression 对齐（一-鿿）。
 */
describe('parseVarMap — 中文简写变量', () => {
  const lib = new VueI18nLibraryImpl();

  it('{{ $t(key, { 数量 }) }} → 还原为插值 {{ 数量 }}', () => {
    const src = `<template>\n  <div>{{ $t('c.total', { 数量 }) }}</div>\n</template>\n`;
    const out = VueRestoreTransformer.restoreVueFile(
      src,
      { 'c.total': '共{数量}个' },
      lib,
      '@/locale',
    );
    expect(out, `还原输出：\n${out}`).toContain('共{{ 数量 }}个');
    expect(out).not.toContain('$t');
  });
});

/**
 * script 侧 restore 的第二参形态判定：只有对象字面量才能推出确定的变量映射，
 * 数组 / 标识符 / 数字等形态必须保留原调用（否则占位符被字面化、运行时变量丢失）。
 */
describe('VueRestoreTransformer script restore — 第二参非对象字面量时保留原调用', () => {
  const lib = new VueI18nLibraryImpl();
  const T_IMPORT = '@/plugins/locale';

  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, T_IMPORT);

  /** 包一层 <script setup>，并带上 generate 阶段会注入的模块 import。 */
  const sfc = (body: string): string =>
    `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\n${body}\n</script>\n`;

  it('数组列表插值 t(k, [name]) 不被还原', () => {
    const out = restore(sfc(`const msg = t('greet', [name]);`), { greet: '你好 {0}' });
    expect(out).toContain("t('greet', [name])");
    expect(out).not.toContain("'你好 {0}'");
    // 调用还在 → t 仍被引用 → 模块 import 不得被清理（否则 TS2304）
    expect(out).toContain(`import { t } from '${T_IMPORT}'`);
  });

  it('标识符透传 t(k, params) 不被还原', () => {
    const out = restore(sfc(`const msg = t('tip', params);`), { tip: '共 {count} 条' });
    expect(out).toContain("t('tip', params)");
    expect(out).not.toContain("'共 {count} 条'");
  });

  it('复数计数 t(k, 5) 不被还原', () => {
    const out = restore(sfc(`const msg = t('apple', 5);`), { apple: '{count} 个苹果' });
    expect(out).toContain("t('apple', 5)");
    expect(out).not.toContain("'{count} 个苹果'");
  });

  it('$t 成员调用形态同样保留', () => {
    const src = `<script lang="ts">\nexport default {\n  computed: {\n    msg() {\n      return this.$t('greet', [this.name]);\n    },\n  },\n};\n</script>\n`;
    const out = restore(src, { greet: '你好 {0}' });
    expect(out).toContain("this.$t('greet', [this.name])");
    expect(out).not.toContain("'你好 {0}'");
  });

  // ---------- 反向：对象字面量与无参路径必须照旧还原 ----------

  it('反向：对象字面量 t(k, { name: expr }) 仍还原为模板串', () => {
    const out = restore(sfc(`const msg = t('greet', { name: user.name });`), {
      greet: '你好 {name}',
    });
    expect(out).toContain('`你好 ${user.name}`');
    expect(out).not.toContain("t('greet'");
  });

  it('反向：对象简写 t(k, { count }) 仍还原为模板串', () => {
    const out = restore(sfc(`const msg = t('n', { count });`), { n: '共 {count} 条' });
    expect(out).toContain('`共 ${count} 条`');
  });

  it('反向：无第二参的简单替换仍工作，并清理不再使用的 import', () => {
    const out = restore(sfc(`const msg = t('plain');`), { plain: '纯文本' });
    expect(out).toContain("const msg = '纯文本'");
    expect(out).not.toContain(`from '${T_IMPORT}'`);
  });

  it('反向：spread t(k, { ...rest }) 仍保留原调用（既有行为不变）', () => {
    const out = restore(sfc(`const msg = t('greet', { ...rest });`), { greet: '你好 {name}' });
    expect(out).toContain("t('greet', { ...rest })");
  });

  // ---------- template 侧：三个 pass 对这些形态本就原样保留 ----------

  it('template 侧：{{ $t(k, [name]) }} / :attr 绑定 / 三元 都原样保留', () => {
    const src =
      `<template>\n` +
      `  <p>{{ $t('greet', [name]) }}</p>\n` +
      `  <el-input :placeholder="$t('tip', params)" />\n` +
      `  <span>{{ ok ? $t('apple', 5) : '' }}</span>\n` +
      `</template>\n`;
    const out = restore(src, {
      greet: '你好 {0}',
      tip: '共 {count} 条',
      apple: '{count} 个苹果',
    });
    expect(out).toContain("$t('greet', [name])");
    expect(out).toContain("$t('tip', params)");
    expect(out).toContain("$t('apple', 5)");
    expect(out).not.toContain('你好 {0}');
    expect(out).not.toContain('共 {count} 条');
  });
});

/**
 * pass 3（表达式内 $t 片段还原）写回的文本若含与属性外层同种的引号，
 * 必须转成 HTML 实体，否则提前终结属性值、产出结构损坏的模板。
 */
describe('VueRestoreTransformer pass 3 — 还原文本里的引号不终结属性外层引号', () => {
  const lib = new VueI18nLibraryImpl();
  const T_IMPORT = '@/plugins/locale';

  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, T_IMPORT);

  it('双引号属性 + 文本含 "：转成 &quot; 而非提前闭合属性', () => {
    const src = `<template>\n  <div :title="cond ? $t('k1') : other">x</div>\n</template>\n`;
    const out = restore(src, { k1: '他说"你好"' });
    expect(out).toContain(`:title="cond ? '他说&quot;你好&quot;' : other"`);
    expect(out).not.toContain('他说"你好"');
  });

  it('双引号属性 + 带变量还原（模板串路径）同样转义', () => {
    const src = `<template>\n  <div :title="cond ? $t('k2', { n: name }) : other">x</div>\n</template>\n`;
    const out = restore(src, { k2: '他说"{n}"' });
    expect(out).toContain(':title="cond ? `他说&quot;${name}&quot;` : other"');
  });

  it("单引号属性 + 文本含 '：转成 &#39;", () => {
    const src = `<template>\n  <div :title='cond ? $t("k3") : other'>x</div>\n</template>\n`;
    const out = restore(src, { k3: "它说'嗨'" });
    expect(out).toContain(`:title='cond ? "它说&#39;嗨&#39;" : other'`);
  });

  // ---------- 反向：文本不含外层引号字符时输出逐字节不变 ----------

  it('反向：文本不含引号时输出与转义前逐字节一致', () => {
    const src = `<template>\n  <div :title="cond ? $t('k4') : other">x</div>\n</template>\n`;
    const out = restore(src, { k4: '普通文案' });
    expect(out).toBe(
      `<template>\n  <div :title="cond ? '普通文案' : other">x</div>\n</template>\n`,
    );
  });

  it('反向：文本只含与外层不同种的引号时不做实体替换', () => {
    const src = `<template>\n  <div :title="cond ? $t('k5') : other">x</div>\n</template>\n`;
    const out = restore(src, { k5: "别名 don't" });
    expect(out).toBe(
      `<template>\n  <div :title="cond ? '别名 don\\'t' : other">x</div>\n</template>\n`,
    );
  });

  it('反向：pass 2 的整值路径行为不变', () => {
    const src = `<template>\n  <div :title="$t('k6')">x</div>\n</template>\n`;
    expect(restore(src, { k6: '标题' })).toContain('title="标题"');
  });
});

/**
 * t 来源（模块 import / useI18n 解构）的清理守卫要把 template 里存活的裸 t() 一并计入，
 * 否则部分还原后 template 引用的 t 失去来源。
 */
describe('VueRestoreTransformer — template 里存活的裸 t() 保住 t 的来源', () => {
  const lib = new VueI18nLibraryImpl();
  const T_IMPORT = '@/plugins/locale';

  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, T_IMPORT);

  it('模块 import：template 仍有 t(自管 key) 时不得删 import', () => {
    const src =
      `<template>\n  <div>{{ t('own.key') }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).toContain(`import { t } from '${T_IMPORT}'`);
    expect(out).toContain("{{ t('own.key') }}");
    expect(out).toContain("const msg = '你好'");
  });

  it('注释里的 t() 字样不算引用：真实调用全部还原后 import 照删', () => {
    const src =
      `<template>\n  <!-- 也可以用 t('key') 写法 -->\n  <div>{{ msg }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).not.toContain(`from '${T_IMPORT}'`);
    expect(out).toContain("<!-- 也可以用 t('key') 写法 -->");
  });

  it('注释含 t() 且另有存活的真实 t() 时仍保留 import', () => {
    const src =
      `<template>\n  <!-- t('demo') -->\n  <div>{{ t('own.key') }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).toContain(`import { t } from '${T_IMPORT}'`);
    expect(out).toContain("{{ t('own.key') }}");
  });

  it('hook 声明：template 仍有 t(自管 key) 时不得删 const { t } = useI18n()', () => {
    const src =
      `<template>\n  <div>{{ t('own.key') }}</div>\n</template>\n\n` +
      `<script setup>\nimport { useI18n } from 'vue-i18n';\nconst { t } = useI18n();\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).toContain('const { t } = useI18n()');
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
  });

  // ---------- 反向：template 无裸 t 引用时照删 ----------

  it('反向：template 无 t 引用时模块 import 照删', () => {
    const src =
      `<template>\n  <div>{{ msg }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).not.toContain(`from '${T_IMPORT}'`);
  });

  it('反向：template 只有 $t()（全局注入）时模块 import 照删', () => {
    const src =
      `<template>\n  <div>{{ $t('own.key') }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).not.toContain(`from '${T_IMPORT}'`);
    expect(out).toContain("{{ $t('own.key') }}");
  });

  it('反向：template 只有形近的 `.t(` / `xt(` 时照删', () => {
    const src =
      `<template>\n  <div>{{ i18n.t('own.key') }}{{ fmt(cnt) }}</div>\n</template>\n\n` +
      `<script setup lang="ts">\nimport { t } from '${T_IMPORT}';\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).not.toContain(`from '${T_IMPORT}'`);
  });

  it('反向：template 无 t 引用时 hook 声明与 import 照删', () => {
    const src =
      `<template>\n  <div>{{ msg }}</div>\n</template>\n\n` +
      `<script setup>\nimport { useI18n } from 'vue-i18n';\nconst { t } = useI18n();\nconst msg = t('k');\n</script>\n`;
    const out = restore(src, { k: '你好' });
    expect(out).not.toContain('useI18n');
  });
});

describe('VueRestoreTransformer — U+00A0 重编码为 &nbsp;', () => {
  const lib = new VueI18nLibraryImpl();

  const restore = (src: string, map: Record<string, string>): string =>
    VueRestoreTransformer.restoreVueFile(src, map, lib, '@/plugins/locale');

  it('文本节点：locale 值含 U+00A0 → 写回 &nbsp;，不留下字面 NBSP', () => {
    const src = `<template>\n  <div>{{ $t('k') }}</div>\n</template>\n`;
    const out = restore(src, { k: '提示\u00A0：请先阅读' });
    expect(out).toContain('提示&nbsp;：请先阅读');
    expect(out).not.toContain('\u00A0');
  });

  it('静态属性值：同样重编码且 & 不被二次转义', () => {
    const src = `<template>\n  <div :title="$t('k')"></div>\n</template>\n`;
    const out = restore(src, { k: 'A\u00A0&\u00A0B' });
    expect(out).toContain('title="A&nbsp;&amp;&nbsp;B"');
  });
});
