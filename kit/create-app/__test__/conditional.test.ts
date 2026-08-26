import { describe, expect, it } from 'vitest';
import { applyConditionalBlocks } from '../src/core/conditional';

/** 便捷包装：默认文件名，特性数组转 Set */
function apply(content: string, features: string[] = []): string {
  return applyConditionalBlocks(content, 'src/main.ts', new Set(features));
}

describe('applyConditionalBlocks - 保留与删除', () => {
  it('无标记的文件原样返回', () => {
    const src = 'const a = 1;\nconst b = 2;\n';
    expect(apply(src, ['i18n'])).toBe(src);
  });

  it('条件为真时保留块内容并删除标记行', () => {
    const src = ['before', '// #if i18n', 'setupLocale(app);', '// #endif', 'after'].join('\n');
    expect(apply(src, ['i18n'])).toBe(['before', 'setupLocale(app);', 'after'].join('\n'));
  });

  it('条件为假时删除整块', () => {
    const src = ['before', '// #if i18n', 'setupLocale(app);', '// #endif', 'after'].join('\n');
    expect(apply(src, [])).toBe(['before', 'after'].join('\n'));
  });

  it('多个独立块各自求值', () => {
    const src = ['// #if i18n', 'A', '// #endif', '// #if qiankun', 'B', '// #endif', 'C'].join(
      '\n',
    );
    expect(apply(src, ['i18n'])).toBe(['A', 'C'].join('\n'));
  });
});

describe('applyConditionalBlocks - else 与取反', () => {
  it('条件为真取 if 段', () => {
    const src = ['// #if qiankun', 'micro()', '// #else', 'mount()', '// #endif'].join('\n');
    expect(apply(src, ['qiankun'])).toBe('micro()');
  });

  it('条件为假取 else 段', () => {
    const src = ['// #if qiankun', 'micro()', '// #else', 'mount()', '// #endif'].join('\n');
    expect(apply(src, [])).toBe('mount()');
  });

  it('取反表达式 !feature', () => {
    const src = ['// #if !qiankun', 'standalone', '// #endif'].join('\n');
    expect(apply(src, [])).toBe('standalone');
    expect(apply(src, ['qiankun'])).toBe('');
  });

  it('取反表达式配合 else', () => {
    const src = ['// #if !i18n', 'plain', '// #else', 'i18n', '// #endif'].join('\n');
    expect(apply(src, ['i18n'])).toBe('i18n');
  });
});

describe('applyConditionalBlocks - 注释风格与缩进', () => {
  it('识别 HTML 注释风格', () => {
    const src = [
      '<template>',
      '  <!-- #if i18n -->',
      '  <LanguageSwitcher />',
      '  <!-- #endif -->',
      '</template>',
    ].join('\n');
    expect(apply(src, ['i18n'])).toBe(
      ['<template>', '  <LanguageSwitcher />', '</template>'].join('\n'),
    );
    expect(apply(src, [])).toBe(['<template>', '</template>'].join('\n'));
  });

  it('HTML 风格支持 else', () => {
    const src = [
      '<!-- #if i18n -->',
      '<i18n />',
      '<!-- #else -->',
      '<plain />',
      '<!-- #endif -->',
    ].join('\n');
    expect(apply(src, [])).toBe('<plain />');
  });

  it('标记行允许行首缩进', () => {
    const src = ['    // #if i18n', '    keep', '    // #endif'].join('\n');
    expect(apply(src, ['i18n'])).toBe('    keep');
  });

  it('识别 # 注释风格（dotenv / shell）', () => {
    const src = [
      'VITE_APP_TITLE=demo',
      '# #if qiankun',
      'VITE_AS_GUEST=true',
      'VITE_APP_NAME=sub-app',
      '# #endif',
      'VITE_PORT=8080',
    ].join('\n');
    expect(apply(src, ['qiankun'])).toBe(
      ['VITE_APP_TITLE=demo', 'VITE_AS_GUEST=true', 'VITE_APP_NAME=sub-app', 'VITE_PORT=8080'].join(
        '\n',
      ),
    );
    expect(apply(src, [])).toBe(['VITE_APP_TITLE=demo', 'VITE_PORT=8080'].join('\n'));
  });

  it('# 风格支持 else 与取反', () => {
    const src = [
      '# #if !qiankun',
      'VITE_MODE=standalone',
      '# #else',
      'VITE_MODE=micro',
      '# #endif',
    ].join('\n');
    expect(apply(src, [])).toBe('VITE_MODE=standalone');
    expect(apply(src, ['qiankun'])).toBe('VITE_MODE=micro');
  });

  it('# 风格标记行允许行首缩进', () => {
    const src = ['  # #if i18n', 'keep', '  # #endif'].join('\n');
    expect(apply(src, ['i18n'])).toBe('keep');
  });

  it('三种风格可出现在同一文件（不按扩展名区分）', () => {
    const src = [
      '<!-- #if i18n -->',
      'tpl',
      '<!-- #endif -->',
      '// #if i18n',
      'script',
      '// #endif',
      '# #if i18n',
      'env',
      '# #endif',
    ].join('\n');
    expect(apply(src, ['i18n'])).toBe(['tpl', 'script', 'env'].join('\n'));
    expect(apply(src, [])).toBe('');
  });

  it('markdown 标题与普通 # 注释不被误判为标记（前缀必须精确是 `# #`）', () => {
    const src = [
      '# 一级标题',
      '## #if i18n',
      '#comment #if i18n',
      '#!/usr/bin/env sh',
      '### #endif',
      '#if i18n',
    ].join('\n');
    // 一个都不认 → 原样返回（若误判成标记，孤立的 #endif 会先抛错）
    expect(apply(src, ['i18n'])).toBe(src);
    expect(apply(src, [])).toBe(src);
  });

  it('保留块内原有缩进与空行', () => {
    const src = ['// #if i18n', '  a', '', '  b', '// #endif'].join('\n');
    expect(apply(src, ['i18n'])).toBe(['  a', '', '  b'].join('\n'));
  });
});

describe('applyConditionalBlocks - 语法错误', () => {
  it('嵌套 #if 抛 E_TEMPLATE_SYNTAX', () => {
    const src = ['// #if i18n', '// #if qiankun', 'x', '// #endif', '// #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('未闭合 #if 抛 E_TEMPLATE_SYNTAX 且带文件与行号', () => {
    const src = ['line1', '// #if i18n', 'x'].join('\n');
    try {
      apply(src, ['i18n']);
      expect.unreachable('应当抛出未闭合错误');
    } catch (err) {
      expect((err as { code: string }).code).toBe('E_TEMPLATE_SYNTAX');
      expect((err as Error).message).toContain('src/main.ts:2');
    }
  });

  it('孤立的 #endif 抛错', () => {
    expect(() => apply('// #endif')).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('孤立的 #else 抛错', () => {
    expect(() => apply('// #else')).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('同一块中多个 #else 抛错', () => {
    const src = ['// #if i18n', 'a', '// #else', 'b', '// #else', 'c', '// #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('# 风格未闭合 #if 抛 E_TEMPLATE_SYNTAX 且带文件与行号', () => {
    const src = ['VITE_A=1', '# #if qiankun', 'VITE_B=2'].join('\n');
    try {
      applyConditionalBlocks(src, '.env.development', new Set(['qiankun']));
      expect.unreachable('应当抛出未闭合错误');
    } catch (err) {
      expect((err as { code: string }).code).toBe('E_TEMPLATE_SYNTAX');
      expect((err as Error).message).toContain('.env.development:2');
    }
  });

  it('# 风格嵌套 #if 抛 E_TEMPLATE_SYNTAX', () => {
    const src = ['# #if i18n', '# #if qiankun', 'X=1', '# #endif', '# #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('# 风格与 // 风格交叉嵌套同样报错（不按风格分栈）', () => {
    const src = ['# #if i18n', '// #if qiankun', 'X=1', '// #endif', '# #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('# 风格的孤立 #endif 抛错', () => {
    expect(() => apply('# #endif')).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('# 风格的逻辑运算符表达式不受支持，抛错', () => {
    const src = ['# #if i18n && qiankun', 'X=1', '# #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });

  it('逻辑运算符表达式不受支持，抛错', () => {
    const src = ['// #if i18n && qiankun', 'x', '// #endif'].join('\n');
    expect(() => apply(src, ['i18n'])).toThrowError(
      expect.objectContaining({ code: 'E_TEMPLATE_SYNTAX' }) as unknown as Error,
    );
  });
});

describe('applyConditionalBlocks - 边界', () => {
  it('未知特性 id 视为未选中', () => {
    const src = ['// #if unknownFeature', 'x', '// #endif', 'y'].join('\n');
    expect(apply(src, ['i18n'])).toBe('y');
  });

  it('形似标记的普通代码不被误判', () => {
    const src = ['const s = "// #if i18n";', 'run(); // #if 注释后缀不算标记'].join('\n');
    expect(apply(src, [])).toBe(src);
  });

  it('CRLF 行尾的文件也能正确裁剪', () => {
    const src = ['// #if i18n\r', 'keep\r', '// #endif\r', 'tail'].join('\n');
    expect(apply(src, ['i18n'])).toBe(['keep\r', 'tail'].join('\n'));
  });
});

describe('applyConditionalBlocks - 裁剪后的空行折叠', () => {
  it('块被裁掉后两侧空行贴在一起时折叠成一个空行', () => {
    // 渗透点的惯用写法：空行 + #if 块 + 空行
    const src = ['before', '', '// #if i18n', 'setupLocale();', '// #endif', '', 'after'].join(
      '\n',
    );
    expect(apply(src, [])).toBe(['before', '', 'after'].join('\n'));
  });

  it('保留的块不受影响', () => {
    const src = ['before', '', '// #if i18n', 'setupLocale();', '// #endif', '', 'after'].join(
      '\n',
    );
    expect(apply(src, ['i18n'])).toBe(['before', '', 'setupLocale();', '', 'after'].join('\n'));
  });

  it('单个空行不被吞掉', () => {
    const src = ['a', '', 'b', '// #if x', 'c', '// #endif'].join('\n');
    expect(apply(src, [])).toBe(['a', '', 'b'].join('\n'));
  });

  it('无标记的文件即便有连续空行也原样返回（走快路径）', () => {
    const src = 'a\n\n\n\nb\n';
    expect(apply(src, ['i18n'])).toBe(src);
  });
});
