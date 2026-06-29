import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { VueAdapter } from '../src/adapters/VueAdapter';
import { createVueI18nLibrary, type VueI18nLibraryType } from '../src/strategies/vue/libraries';
import { VueImportManager } from '../src/strategies/vue/VueImportManager';
import { VueComponentInjector } from '../src/strategies/vue/VueComponentInjector';
import { VueTransformer } from '../src/strategies/vue/VueTransformer';
import { VueI18nLibraryImpl } from '../src/strategies/vue/libraries/vue-i18n';
import { VueTextExtractor } from '../src/strategies/vue/VueTextExtractor';
import { GenerateProcessor } from '../src/core/GenerateProcessor';
import { LoggerUtils } from '../src/utils/logger';
import { resolveConfig } from '../src/config/loader';
import type { ExtractedString } from '../src/utils/types';
import type { I18nToolsConfig, ResolvedConfig } from '../src/config';

/**
 * Vue transform 输出断言（此前 boundary-matrix.test.ts 仅断言"提取了什么"，从不验证
 * 生成的 $t 绑定文本）。重点补 round-trip 测不到的两条：
 *  - Options API `this.$t`（非 setup <script> 块 + isInThisBindableScope）
 *  - vue-i18next 命名空间发射 `$t('ns:key')`（generateTemplateReplacement: ns 前缀）
 * 外加模板/脚本各上下文的输出形状断言。
 */
describe('Vue transform 输出', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-tf-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(
    src: string,
    opts: { lib?: VueI18nLibraryType; namespace?: string } = {},
  ): Promise<string> {
    const adapter = new VueAdapter(
      '@/plugins/locale',
      opts.lib ?? 'vue-i18n',
      opts.namespace ? { namespace: opts.namespace } : {},
    );
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it('文本节点 → {{ $t(key) }}，原始中文被替换', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`);
    expect(out).toContain("{{ $t('k0') }}");
    expect(out).not.toContain('>提交<');
  });

  it('表达式内先比较后展示同一文案：替换命中展示分支，比较操作数保持硬编码（回归 #2）', async () => {
    // status === '保存' 的 '保存' 被提取端有意跳过（比较操作数），只提取展示分支 ? '保存' 与 '保存中'。
    // 旧实现替换 '保存' 时从指令起点 indexOf 命中更靠前的 === '保存' → 比较被改成 $t() 永不命中，
    // 展示分支反而残留硬编码。
    const out = await transformVue(
      `<template>\n  <span :title="status === '保存' ? '保存' : '保存中'">x</span>\n</template>\n`,
    );
    // 比较操作数必须保持硬编码字面量
    expect(out).toContain(`status === '保存'`);
    // 展示分支的 '保存' 应被替换成 $t(...)，不得残留未替换的 ? '保存'
    expect(out).not.toMatch(/\?\s*'保存'/);
  });

  it('Yoda 写法（比较符在左侧）：替换命中展示分支，左侧比较操作数保持硬编码（回归 Bug2）', async () => {
    // '编辑' === x 的左操作数 '编辑' 被提取端有意跳过（isComparisonOperand 对 === 两侧都识别），
    // 只提取 else 展示分支的 '编辑'。旧实现的 indexOfSkippingComparison 跳过判据只看命中点之前
    // 是否紧跟 ===（即右操作数），对左操作数（=== 在命中点之后）失效 → 误把左操作数替换成 $t()
    // 使比较永不命中、分支失效，真正的 else 展示分支反而残留硬编码。
    const out = await transformVue(
      `<template>\n  <el-tag :type="'编辑' === x ? a : '编辑'">x</el-tag>\n</template>\n`,
    );
    // 左侧比较操作数必须保持硬编码字面量（不得被替换成 $t）
    expect(out).toContain(`'编辑' === x`);
    // 全文应只剩这一个硬编码 '编辑'（else 展示分支已替换为 $t），不残留第二个
    expect((out.match(/'编辑'/g) ?? []).length).toBe(1);
  });

  it('已存在其它路径的具名 import { t } 时不注入重复 t 导入（回归 Bug3）', async () => {
    // <script setup> 已从别的模块导入 t（用户手写或复用），工具仍按 tImport 路径注入
    // import { t } 会在同一模块作用域产生重复 t 声明 → "Identifier 't' has already been declared"。
    // 已存在检查旧实现只匹配 tImport 这一个路径，对其它路径的 import { t } 视而不见。
    const out = await transformVue(
      `<script setup>\nimport { t } from '@/other';\nconst msg = '你好';\n</script>\n`,
    );
    // 中文被替换为 t(...)（复用已有 t）
    expect(out).toContain("t('k0')");
    // 不得新增第二条具名 t 导入（同模块作用域重复声明 t 会 SyntaxError）
    expect((out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from/g) ?? []).length).toBe(1);
  });

  it('静态属性 → :attr="$t(key)"', async () => {
    const out = await transformVue(
      `<template>\n  <el-button title="确认">x</el-button>\n</template>\n`,
    );
    expect(out).toContain(':title="$t(\'k0\')"');
    expect(out).not.toContain('title="确认"');
  });

  it('script setup 字面量 → 裸 t(key) + 注入模块 import（非 useI18n hook）', async () => {
    // generate 对 <script setup> 走「模块 import」路径而非 useI18n hook
    // （见 VueRestoreTransformer 注释 / vue-setup-import-strategy.test.ts）
    const out = await transformVue(
      `<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
    );
    expect(out).toContain("t('k0')");
    expect(out).toMatch(/import\s*\{\s*t\s*\}\s*from\s*['"]@\/plugins\/locale['"]/);
    expect(out).not.toContain("'你好'");
  });

  it('Options API <script> 方法体 → this.$t(key)', async () => {
    const out = await transformVue(
      `<script>\nexport default {\n  methods: {\n    greet() {\n      return '你好';\n    },\n  },\n};\n</script>\n`,
    );
    expect(out).toContain("this.$t('k0')");
    expect(out).not.toContain("'你好'");
  });

  it('vue-i18next：命名空间前缀发射 $t(ns:key)', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`, {
      lib: 'vue-i18next',
      namespace: 'app',
    });
    expect(out).toContain("$t('app:k0')");
  });
});

/**
 * 单 <script setup> 场景的 t 注入策略：
 *
 * 已统一为「模块顶层 import { t } from tImport」一条路径，不再走 useI18n hook。
 * 详见 VueImportManager.handleGlobalImports 的 setup 分支注释。
 *
 * 关键校验点：
 *   1. 无论是否含编译宏，都注入 `import { t } from tImport`
 *   2. 上一轮残留的 hook 注入（无参形态）会被前置清理，不会与新 import 双声明
 *   3. 用户手写的 `useI18n({ useScope: 'local', messages })` 等高级用法不被误删
 */
describe('VueImportManager — script setup t 注入策略（统一模块 import）', () => {
  const TIMPORT = '@/i18n';
  const newMgr = () => new VueImportManager(TIMPORT, new VueI18nLibraryImpl());

  /** 构造一条 script 上下文的 ExtractedString，用于触发 handleGlobalImports 工作流。 */
  const scriptString: ExtractedString = {
    original: '',
    semanticId: 'k',
    filePath: 'fake.vue',
    line: 1,
    column: 1,
    context: 'script',
    componentType: 'setup',
  };

  it('单 setup 无编译宏 → 注入模块 import，不再注入 useI18n hook', () => {
    const code = `<template><div>{{ t('x') }}</div></template>
<script setup>
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineProps default 调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('defineEmits validator 内调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
defineEmits({
  change: (v) => v !== t('default'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('withDefaults 默认值对象内调 t() → 注入模块 import', () => {
    const code = `<template><div /></template>
<script setup lang="ts">
interface Props { title?: string }
withDefaults(defineProps<Props>(), {
  title: () => t('pages.x.title'),
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
  });

  it('上一轮 hook 残留 + 本轮无编译宏 → 清理 hook，注入模块 import（防双声明）', () => {
    // 这是真实 bug 复现：旧策略下两条路径切换不对称导致 t 被声明两次。
    // 统一策略后，hook 残留无条件被前置清理，只剩模块 import。
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
    expect(out).not.toContain('const { t } = useI18n();');
    // t 在整个文件中应只被声明一次（来自模块 import）；不应同时存在 `const { t } = useI18n()`
    const moduleImports = out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/g);
    expect(moduleImports?.length).toBe(1);
    const hookDecls = out.match(/const\s*\{\s*t\s*\}\s*=\s*useI18n\(\)/g);
    expect(hookDecls).toBeNull();
  });

  it('上一轮模块 import 已存在 + 本轮无编译宏 → 幂等，不重复 import', () => {
    const code = `<template><div /></template>
<script setup>
import { t } from '@/i18n';
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 不应出现两条 import { t } from '@/i18n'
    const importMatches = out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/g);
    expect(importMatches?.length).toBe(1);
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });

  it('上一轮 hook 残留 + 本轮含编译宏 → 清理 hook，注入模块 import', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const props = defineProps({
  title: { type: String, default: t('pages.x.title') },
});
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    expect(out).not.toContain('const { t } = useI18n();');
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });

  it('用户手写 useI18n({ useScope: "local" }) → import 保留，不误删', () => {
    const code = `<template><div /></template>
<script setup>
import { useI18n } from 'vue-i18n';
const { t: localT } = useI18n({ useScope: 'local', messages: {} });
const a = t('foo');
</script>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 注入工具的模块 import
    expect(out).toMatch(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"]/);
    // 用户手写的 useI18n({...}) 与其 import 必须保留
    expect(out).toContain("import { useI18n } from 'vue-i18n'");
    expect(out).toContain("useI18n({ useScope: 'local'");
  });

  it('双块共存（<script> + <script setup>）→ 写到非-setup 顶层，setup 块 hook 残留也清理', () => {
    const code = `<script>
export default { name: 'X' };
</script>
<script setup>
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const a = t('foo');
</script>
<template><div /></template>`;
    const out = newMgr().handleGlobalImports(code, [scriptString], 'a.vue');
    // 模块 import 写到非-setup 块
    expect(out).toMatch(
      /<script>[\s\S]*import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*['"]@\/i18n['"][\s\S]*<\/script>/,
    );
    // setup 块的 hook 残留被清掉
    expect(out).not.toContain('const { t } = useI18n();');
    expect(out).not.toContain("import { useI18n } from 'vue-i18n'");
  });
});

/**
 * 回归：增量接入场景——<script setup> 已有用户手写的多键 useI18n() 解构
 * （`const { t, locale } = useI18n()`），仍有中文待提取。
 *
 * 之前 handleGlobalImports 已用 hasLocalHookTBinding 跳过模块 import 注入，但其后的
 * VueComponentInjector.inject() / needsHook() 仅用 getHookDeclarationCheckRegex
 * （只匹配恰好 `{ t }`）判定，识别不出 `{ t, locale }`，于是又注入一遍
 * `const { t } = useI18n()` → `Identifier 't' has already been declared`，SFC 无法编译。
 *
 * 注意：必须走 VueTransformer.transform 全链路才能复现——只单测 handleGlobalImports
 * 会绕过出 bug 的 inject() 段（既有 audit-fixes-vue-dup-t-multikey-hook 的盲点）。
 */
describe('Vue inject：已有多键 useI18n 解构时 inject 不再注入重复 t（全链路）', () => {
  const build = () => {
    const lib = createVueI18nLibrary('vue-i18n');
    const im = new VueImportManager('@/plugins/locale', lib);
    const injector = new VueComponentInjector(lib, im);
    return new VueTransformer(lib, im, injector);
  };

  const countHookDecls = (code: string): number => (code.match(/=\s*useI18n\(\)/g) || []).length;

  it('vue-i18n：用户手写 const { t, locale } = useI18n()，转换后全文件仅一处 useI18n() 声明', () => {
    const file = 'X.vue';
    const src = `<template><div>{{ msg }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const msg = '标题';
void locale;
</script>`;

    const strings = [
      {
        original: '标题',
        semanticId: 'app.title',
        filePath: file,
        line: 5,
        column: 13,
        context: 'script',
        componentType: 'setup',
      },
    ] as unknown as ExtractedString[];

    const out = build().transform(file, strings, src);

    // 不得产生第二处 useI18n() 声明
    expect(countHookDecls(out)).toBe(1);
    // 用户原有多键解构保留
    expect(out).toContain('const { t, locale } = useI18n()');
    // 不得额外注入恰好 { t } 形态
    expect(out).not.toContain('const { t } = useI18n();\n\nconst { t, locale }');
    // 中文已被替换为 t() 调用
    expect(out).toContain("t('app.title')");
  });

  it('vue-i18next：用户手写 const { t, i18n } = useTranslation()，不重复注入', () => {
    const lib = createVueI18nLibrary('vue-i18next');
    const im = new VueImportManager('@/plugins/locale', lib);
    const injector = new VueComponentInjector(lib, im);
    const transformer = new VueTransformer(lib, im, injector);

    const file = 'Y.vue';
    const src = `<template><div>{{ msg }}</div></template>
<script setup lang="ts">
import { useTranslation } from 'vue-i18next';
const { t, i18n } = useTranslation();
const msg = '标题';
void i18n;
</script>`;

    const strings = [
      {
        original: '标题',
        semanticId: 'app.title',
        filePath: file,
        line: 5,
        column: 13,
        context: 'script',
        componentType: 'setup',
      },
    ] as unknown as ExtractedString[];

    const out = transformer.transform(file, strings, src);

    expect((out.match(/=\s*useTranslation\(/g) || []).length).toBe(1);
    expect(out).toContain('const { t, i18n } = useTranslation()');
  });
});

/**
 * 回归（#4 簇）：静态属性值首尾带空白时，transform 不得产出非法标记。
 *
 * 根因（修复前）：extractFromAttributes 存 original=attr.value.content.trim()（如 `确认`），
 * 而源码是 `title=" 确认"`。静态属性正则 `=["']确认["']` 要求引号紧贴文本 → padding 时失配
 * → 旧逻辑 fall through 到裸文本搜索，把 `:title="$t(...)"` 插进引号内部，产出
 * `title=" :title="$t('k0')""`（引号失衡的非法标记），且 key 照常生成、失败静默。
 *
 * 修复：静态属性正则容忍首尾空白 + `:` 前缀分支绝不 fall through 到裸文本搜索。
 */
describe('Vue 静态属性首尾空白 → transform 产出合法绑定', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-attr-ws-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const run = async (source: string): Promise<string> => {
    const file = path.join(dir, 'A.vue');
    fs.writeFileSync(file, source);
    const adapter = new VueAdapter('@/locale', 'vue-i18n');
    const strings = await adapter.getTextExtractor().extractFromFile(file);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(file, strings, source);
  };

  it('前导空格 title=" 确认"：转成合法 :title="$t(...)"，不破坏引号', async () => {
    const out = await run(`<template>\n  <a title=" 确认">x</a>\n</template>\n`);
    // 合法：:title="$t('k...')"
    expect(out, `输出：\n${out}`).toMatch(/:title="\$t\('k\d+'\)"/);
    // 反例：决不能把 :title 插进引号内部产生嵌套属性 / 失衡引号
    expect(out).not.toMatch(/title="\s*:title=/);
    expect(out).not.toContain('$t(\'k0\')""');
  });

  it('Tab 缩进 title="\\t确认"：同样合法转换', async () => {
    const out = await run(`<template>\n  <a title="\t确认">x</a>\n</template>\n`);
    expect(out, `输出：\n${out}`).toMatch(/:title="\$t\('k\d+'\)"/);
    expect(out).not.toMatch(/title="[\s\S]*:title=/);
  });

  it('无 padding title="确认"：原有行为不回归', async () => {
    const out = await run(`<template>\n  <a title="确认">x</a>\n</template>\n`);
    expect(out).toMatch(/:title="\$t\('k\d+'\)"/);
  });
});

/**
 * 回归 #2：@vue/compiler-dom 以 whitespace:'condense' 解析，跨行纯文本节点的 content
 * 被压成单空格，而 loc.source 保留换行缩进 → 提取存入的 original 含 `\n`。
 * VueTransformer.replaceInTemplate 是严格逐行 indexOf，含 `\n` 的 original 永远无法
 * 命中任何单行（±5 行兜底亦逐行）→ locale 写了 key，但源码中文从未被替换：
 * 残留中文 + 孤儿 key，破坏 extract⇄transform 不变量。
 */
describe('Vue 多行纯文本节点替换（回归 #2）', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-ml-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(src: string): Promise<string> {
    const adapter = new VueAdapter('@/plugins/locale', 'vue-i18n', {});
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it('跨行文本被替换为 {{ $t(key) }}，源码不残留中文', async () => {
    const out = await transformVue(`<template>\n  <div>这是\n  一段文字</div>\n</template>\n`);
    expect(out).toContain("$t('k0')");
    expect(out).not.toContain('这是');
    expect(out).not.toContain('一段文字');
  });

  it('单行文本仍正常替换（保护既有行为）', async () => {
    const out = await transformVue(`<template>\n  <div>提交</div>\n</template>\n`);
    expect(out).toContain("{{ $t('k0') }}");
    expect(out).not.toContain('>提交<');
  });
});

/**
 * 回归：静态属性提取只取 @vue/compiler-dom 解码后的 attr.value.content（&amp; → &），无
 * rawSource 兜底。当属性值含 HTML 实体时，Transformer 用解码后的 original 拼正则去匹配仍含
 * &amp; 的源码 → 失配 → 属性不被替换；但提取阶段已为其生成 key 写入 locale → 源码残留中文
 * 属性 + 孤儿 key。文本节点路径已修（B1），属性路径漏修。
 * 修复：属性路径与文本节点对称——original 用去引号的原始源码，processedMessage 用解码文本。
 */
describe('Vue 静态属性含 HTML 实体的提取/还原对称', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-attr-entity-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('含 &amp; 的静态属性 → 被替换为 $t()，locale 落解码后文本，不残留中文/孤儿', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><div title="点击 &amp; 确认">x</div></template>\n`, 'utf-8');

    await new GenerateProcessor(buildConfig(), false, false).execute(file, true);

    const out = fs.readFileSync(file, 'utf-8');
    expect(out).toContain('$t('); // 属性被国际化
    expect(out).not.toContain('点击'); // 源码不再残留中文属性（修复前会残留）

    const zh = JSON.parse(fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8')) as Record<
      string,
      string
    >;
    // locale 落解码后的文本（& 而非 &amp;），且不存在「源码未替换却写了 key」的孤儿
    expect(Object.values(zh)).toContain('点击 & 确认');
    expect(Object.values(zh)).not.toContain('点击 &amp; 确认');
  });
});

/**
 * 回归：vue-i18next 配置 namespace 时，generateTemplateReplacement 给 template $t() 加了
 * `namespace:key` 前缀，但 generateScriptReplacement 从不读 library.namespace，script 串
 * （script setup / Options API）产出裸 `t('key')` / `this.$t('key')`。当 namespace ≠ i18next
 * defaultNS 时，每个 script 提取串运行时解析失败（显示原始 key/fallback），而等价 template 串正常。
 *
 * 修复：generateScriptReplacement 与 template 对称地加 namespace 前缀。
 */
describe('Vue transform — vue-i18next namespace 前缀在 script 上下文同样生效', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-i18next-ns-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function transformVue(src: string, namespace?: string): Promise<string> {
    const adapter = new VueAdapter(
      '@/plugins/locale',
      'vue-i18next',
      namespace ? { namespace } : {},
    );
    const fp = path.join(dir, 'C.vue');
    fs.writeFileSync(fp, src, 'utf8');
    const strings = await adapter.getTextExtractor().extractFromFile(fp);
    strings.forEach((s, i) => (s.semanticId = `k${i}`));
    return adapter.getTransformer().transform(fp, strings, src);
  }

  it("script setup 字面量 → t('<ns>:key')（与 template $t 对称带前缀）", async () => {
    const out = await transformVue(
      `<template>\n  <div>提交</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
      'common',
    );
    // template 历来带前缀
    expect(out).toMatch(/\$t\('common:k\d'\)/);
    // 修复点：script 也带前缀，不再是裸 t('k')
    expect(out).toMatch(/[^$]t\('common:k\d'\)/);
    expect(out).not.toMatch(/[^:]t\('k\d'\)/);
    expect(out).not.toContain("'你好'");
  });

  it("Options API 方法体 → this.$t('<ns>:key')", async () => {
    const out = await transformVue(
      `<script>\nexport default {\n  methods: {\n    greet() {\n      return '你好';\n    },\n  },\n};\n</script>\n`,
      'common',
    );
    expect(out).toMatch(/this\.\$t\('common:k\d'\)/);
    expect(out).not.toContain("'你好'");
  });

  it('未配置 namespace → script 保持裸 key（无前缀回归保护）', async () => {
    const out = await transformVue(
      `<template>\n  <div>{{ msg }}</div>\n</template>\n<script setup>\nconst msg = '你好';\n</script>\n`,
    );
    expect(out).toMatch(/t\('k\d'\)/);
    expect(out).not.toContain(':k0');
  });
});

/**
 * 回归（三轮审计 #1，high，产物无法编译）：清理正则 getHookDeclarationCleanupRegex
 * 仅匹配「恰好 { t }」的 `const { t } = useI18n()`。用户手写的多键解构
 * `const { t, locale } = useI18n()`（增量接入极常见）不被匹配 → 残留；随后 setupOnly
 * 路径又注入模块级 `import { t } from tImport`，同一 SFC 模块作用域出现两个 t 声明
 * → `Identifier 't' has already been declared`，SFC 编译失败。
 *
 * 修复：addPluginLocaleImportToScript 注入前检测目标块是否已有从 hook 解构出的本地
 * t（含多键形态），有则跳过注入（t 已可用）。
 */
describe('Vue import：已有多键 useI18n 解构时不重复注入 t（审计三轮 #1）', () => {
  const makeStrings = (): ExtractedString[] => [
    {
      original: '标题',
      semanticId: 'app.title',
      filePath: 'X.vue',
      line: 1,
      column: 1,
      context: 'script',
      componentType: 'setup',
    },
  ];

  const im = (): VueImportManager =>
    new VueImportManager('@/plugins/locale', createVueI18nLibrary('vue-i18n'));

  it('用户手写 const { t, locale } = useI18n()：不再额外注入 import { t }，无双声明', () => {
    const code = `<template><div>{{ t('app.title') }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const title = t('app.title');
void locale;
</script>`;

    const out = im().handleGlobalImports(code, makeStrings(), 'X.vue');

    // 不得注入模块级 import { t }（会与解构出的 t 冲突）
    expect(out).not.toContain("import { t } from '@/plugins/locale'");
    // 用户原有解构保留
    expect(out).toContain('const { t, locale } = useI18n()');
    // 全文件只出现一处 t 声明（解构），不存在第二处
    const tBindings =
      (out.match(/\bconst\s*\{[^}]*\bt\b[^}]*\}\s*=\s*useI18n\(\)/g) || []).length +
      (out.match(/import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*'@\/plugins\/locale'/g) || []).length;
    expect(tBindings).toBe(1);
  });

  it('控制用例：工具自注入的恰好 const { t } = useI18n() 仍正常迁移为模块 import', () => {
    const code = `<template><div>{{ t('app.title') }}</div></template>
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
const title = t('app.title');
</script>`;

    const out = im().handleGlobalImports(code, makeStrings(), 'X.vue');

    // 恰好 { t } 形态被清理并迁移到模块 import（既有行为不被本修复破坏）
    expect(out).toContain("import { t } from '@/plugins/locale'");
    expect(out).not.toContain('const { t } = useI18n()');
  });
});

/**
 * 回归（三轮审计 #2，medium，产物非法 JS）：动态属性 / 插值表达式以语句上下文解析
 * （parseSourceFile），`:config="{ '提示信息': msg }"` 被 TS 当 Block 而非对象字面量，
 * 且该路径未走 isExtractableStringLiteral（缺对象 key / import 排除）。于是中文对象 KEY
 * 被当可见文案提取，转换后产出 `{ $t('...'): msg }`（非法 JS）+ 孤儿 key。
 *
 * 修复：动态属性 / 插值表达式改用表达式上下文解析，并统一经 isExtractableStringLiteral
 * 排除对象 key / 导入路径，与 script 段、React 端口径一致。
 */
describe('VueTextExtractor 动态属性/插值：中文对象 key 不被误提取（审计三轮 #2）', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-tools-vue-objkey-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const extract = async (content: string) => {
    const file = path.join(tmpDir, 'A.vue');
    fs.writeFileSync(file, content);
    const extractor = new VueTextExtractor({ name: 'vue-i18n' } as never);
    return extractor.extractFromFile(file);
  };

  it('动态属性内联对象字面量的中文 KEY 不被提取', async () => {
    const result = await extract(
      `<template><el-table :config="{ '提示信息': msg, '标题': title }" /></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).not.toContain('提示信息');
    expect(originals).not.toContain('标题');
  });

  it('插值内联对象字面量的中文 KEY 不被提取', async () => {
    const result = await extract(
      `<template><div>{{ { '错误': err }[code] }}</div></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).not.toContain('错误');
  });

  it('控制用例：绑定到中文字符串字面量的属性值仍被提取', async () => {
    const result = await extract(
      `<template><my-input :label="'请输入姓名'" /></template><script setup></script>`,
    );
    const originals = result.map((r) => r.original);
    expect(originals).toContain('请输入姓名');
  });
});

/**
 * 回归（审计 Vue/low）：HTML/Vue 合法允许无引号属性值（`<el-button title=确认>`）。
 * @vue/compiler-dom 照常提取并写入 locale，但旧 buildStaticAttrPattern 强制引号无法匹配 →
 * 转换阶段静默漏替换 → 孤儿 key + 源码残留中文。修复：正则兼容无引号分支。
 */
describe('Vue 无引号静态属性值的提取/替换对称（审计 Vue）', () => {
  let rootDir: string;
  let srcDir: string;
  let localeDir: string;

  const buildConfig = (): ResolvedConfig =>
    resolveConfig({
      root: rootDir,
      framework: { type: 'vue', library: 'vue-i18n', tImport: '@/i18n' },
      locales: { source: 'zh-CN', targets: ['en-US'] },
      io: { sourceDir: srcDir, localesDir: localeDir, format: 'flat', prettify: false },
      keys: { separator: '.' },
      llm: { shared: { apiKey: 'x', model: 'm' } },
    } satisfies I18nToolsConfig);

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vue-unquoted-attr-'));
    srcDir = path.join(rootDir, 'src');
    localeDir = path.join(rootDir, 'locale');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(localeDir, { recursive: true });
    vi.spyOn(LoggerUtils, 'info').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'warn').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'error').mockImplementation(() => {});
    vi.spyOn(LoggerUtils, 'success').mockImplementation(() => {});
  });
  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('无引号属性 title=确认 → 被替换为 :title="$t()"，不残留中文/孤儿', async () => {
    const file = path.join(srcDir, 'A.vue');
    fs.writeFileSync(file, `<template><el-button title=确认>x</el-button></template>\n`, 'utf-8');

    await new GenerateProcessor(buildConfig(), false, false).execute(file, true);

    const out = fs.readFileSync(file, 'utf-8');
    // 属性被国际化为动态绑定
    expect(out).toContain('$t(');
    expect(out).toContain(':title=');
    // 无引号中文不再残留
    expect(out).not.toContain('title=确认');

    // 生成的 key 在 locale 中存在（非孤儿）：locale value 应含「确认」
    const localeRaw = fs.readFileSync(path.join(localeDir, 'zh-CN.json'), 'utf-8');
    expect(localeRaw).toContain('确认');
  });
});
