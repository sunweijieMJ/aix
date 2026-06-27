import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import { IdGenerator } from '../src/utils/id-generator';
import type { I18nToolsConfig } from '../src/config/types';

/**
 * 回归（B6）：PathStrategy 中「文件直接位于 anchor 下」的退化分支用原始文件名作单段前缀，
 * 未应用 fileNameCase；而子目录文件的 includeFile 分支会应用。导致顶层文件与子目录文件
 * 的前缀大小写规则不一致（fileNameCase:'kebab' 下 src/MyView.vue → 'MyView' 而非 'my-view'）。
 * 修复：退化分支同样 applyCase。
 */
function buildConfig(overrides: Partial<I18nToolsConfig> = {}) {
  const user: I18nToolsConfig = {
    root: '/tmp/proj',
    framework: { type: 'vue' },
    llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
    ...overrides,
  };
  return resolveConfig(user);
}

describe('IdGenerator - anchor 根文件应用 fileNameCase', () => {
  it('fileNameCase=kebab：顶层 MyView.vue 前缀走 kebab（修复前为原样 MyView）', () => {
    const gen = new IdGenerator(
      buildConfig({ keys: { prefix: { strategy: 'path', fileNameCase: 'kebab' } } }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/MyView.vue', '提交', new Set());
    expect(id).toBe('my-view.submit');
  });

  it('与子目录文件的 fileNameCase 规则一致', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'path', fileNameCase: 'kebab', includeFile: true } },
      }),
    );
    const top = gen.generateWithFilePath('/tmp/proj/src/MyView.vue', '提交', new Set());
    const nested = gen.generateWithFilePath('/tmp/proj/src/pages/MyView.vue', '提交', new Set());
    // 两者文件名段都应为 kebab 化的 my-view
    expect(top).toContain('my-view');
    expect(nested).toContain('my-view');
  });
});
