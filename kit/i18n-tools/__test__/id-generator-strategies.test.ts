import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../src/config/loader';
import { IdGenerator, __internal } from '../src/utils/id-generator';
import type { I18nToolsConfig } from '../src/config/types';

/** 测试辅助：构造完整的 ResolvedConfig（最小可用 LLM） */
function buildConfig(overrides: Partial<I18nToolsConfig> = {}) {
  const user: I18nToolsConfig = {
    root: '/tmp/proj',
    framework: { type: 'vue' },
    llm: { shared: { apiKey: 'sk-test', model: 'gpt-4o' } },
    ...overrides,
  };
  return resolveConfig(user);
}

describe('IdGenerator - PathStrategy', () => {
  it('从 anchor 后的目录段派生前缀', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/index.vue', '提交', new Set());
    expect(id).toBe('pages.home.submit');
  });

  it('文件直接在 anchor 下时退化到文件名', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.generateWithFilePath('/tmp/proj/src/main.vue', '提交', new Set());
    expect(id).toBe('main.submit');
  });

  it('找不到 anchor 时无前缀', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.generateWithFilePath('/tmp/other/foo/bar.vue', '提交', new Set());
    expect(id).toBe('submit');
  });

  it('绝对路径祖先含 anchor 同名段时，按 root 相对定位，不命中外层同名段', () => {
    // 项目根 /tmp/src/app 的祖先恰好含 'src' 段；anchor 默认 'src'。
    // 旧实现对绝对路径取「首个」src（命中外层 /tmp/src）→ 前缀污染成 'app.src.views' +
    // 与桶反推口径（buildKeyBucketMap / RulesPrefixStrategy 均先 path.relative）不一致。
    const gen = new IdGenerator(buildConfig({ root: '/tmp/src/app' }));
    expect(gen.getDirectoryPrefix('/tmp/src/app/src/views/Foo.vue')).toBe('views');
  });

  it('take 截断深度', () => {
    const gen = new IdGenerator(buildConfig({ keys: { prefix: { strategy: 'path', take: 2 } } }));
    const id = gen.generateWithFilePath(
      '/tmp/proj/src/pages/home/components/Header.vue',
      '提交',
      new Set(),
    );
    expect(id).toBe('pages.home.submit');
  });

  it('LLM 返回纯中文 id：sanitize 后为空时回退 hash，不产生尾随分隔符（回归 B4）', () => {
    const gen = new IdGenerator(buildConfig());
    // addDirectoryPrefixToId 直接消费 LLM 返回的 id；纯中文会被 sanitize 抹空
    const id = gen.addDirectoryPrefixToId(
      '/tmp/proj/src/pages/home/index.vue',
      '商品列表',
      new Set(),
    );
    expect(id.startsWith('pages.home.')).toBe(true);
    // 语义段非空：不以分隔符结尾，且前缀后有内容
    expect(id.endsWith('.')).toBe(false);
    expect(id).toMatch(/^pages\.home\.t_[a-z0-9]+$/);
  });

  it('LLM 返回纯标点 id：同样回退 hash', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.addDirectoryPrefixToId('/tmp/proj/src/main.vue', '。。。', new Set());
    expect(id.endsWith('.')).toBe(false);
    expect(id).toMatch(/^main\.t_[a-z0-9]+$/);
  });

  it('skip 跳过前 N 段', () => {
    const gen = new IdGenerator(buildConfig({ keys: { prefix: { strategy: 'path', skip: 1 } } }));
    const id = gen.generateWithFilePath(
      '/tmp/proj/src/pages/home/components/Header.vue',
      '提交',
      new Set(),
    );
    // 跳过 'pages' 后保留 home/components
    expect(id).toBe('home.components.submit');
  });

  it('skip + take 组合', () => {
    const gen = new IdGenerator(
      buildConfig({ keys: { prefix: { strategy: 'path', skip: 1, take: 1 } } }),
    );
    const id = gen.generateWithFilePath(
      '/tmp/proj/src/pages/home/components/Header.vue',
      '提交',
      new Set(),
    );
    // skip=1 → ['home', 'components']；take=1 → ['home']
    expect(id).toBe('home.submit');
  });

  it('includeFile=true 把文件名作为最后一段', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'path', includeFile: true } },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/Map2D.vue', '提交', new Set());
    // 默认 fileNameCase='camel'：'Map2D' → 'map2D'
    expect(id).toBe('pages.home.map2D.submit');
  });

  it('fileNameCase=kebab + preserveHyphens=true（默认）保留连字符', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'path', includeFile: true, fileNameCase: 'kebab' } },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/UserList.vue', '提交', new Set());
    // 默认 preserveHyphens=true：'UserList' → 'user-list' 直接保留
    expect(id).toBe('pages.home.user-list.submit');
  });

  it('fileNameCase=kebab + preserveHyphens=false 抹掉连字符', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'path',
            includeFile: true,
            fileNameCase: 'kebab',
            preserveHyphens: false,
          },
        },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/UserList.vue', '提交', new Set());
    expect(id).toBe('pages.home.userlist.submit');
  });

  it('fileNameCase 自定义函数', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'path',
            includeFile: true,
            fileNameCase: (name) => name.toUpperCase(),
          },
        },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/Map2D.vue', '提交', new Set());
    expect(id).toBe('pages.home.MAP2D.submit');
  });

  it('preserveHyphens=true（默认）保留目录段中的连字符', () => {
    const gen = new IdGenerator(buildConfig());
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/flipped-course/index.vue')).toBe(
      'pages.flipped-course',
    );
  });

  it('preserveHyphens=false 抹掉连字符', () => {
    const gen = new IdGenerator(
      buildConfig({ keys: { prefix: { strategy: 'path', preserveHyphens: false } } }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/flipped-course/index.vue')).toBe(
      'pages.flippedcourse',
    );
  });

  it('transform 改写段内容', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'path',
            transform: (seg) => seg.toUpperCase(),
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/home/index.vue')).toBe('PAGES.HOME');
  });

  it('transform 返回 null 删除段', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'path',
            transform: (seg) => (seg === 'pages' ? null : seg),
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/home/components/Header.vue')).toBe(
      'home.components',
    );
  });

  it('indexFile=collapse-to-parent（默认）+ includeFile=true 跳过 index 文件名', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'path', includeFile: true } },
      }),
    );
    // components/TagInput/index.vue → ['components', 'TagInput']，文件名段被折叠
    // 注意：目录段不过 fileNameCase，'TagInput' 原样保留
    expect(gen.getDirectoryPrefix('/tmp/proj/src/components/TagInput/index.vue')).toBe(
      'components.TagInput',
    );
    // 非 index 文件仍然作为末段加入（默认 fileNameCase='camel'：'Button' → 'button'）
    expect(gen.getDirectoryPrefix('/tmp/proj/src/components/TagInput/Button.vue')).toBe(
      'components.TagInput.button',
    );
  });

  it('indexFile=as-is 保留 index 作为末段', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: { strategy: 'path', includeFile: true, indexFile: 'as-is' },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/components/TagInput/index.vue')).toBe(
      'components.TagInput.index',
    );
  });
});

describe('IdGenerator - FixedStrategy', () => {
  it('忽略文件路径，所有 key 共享 value', () => {
    const gen = new IdGenerator(
      buildConfig({
        io: { format: 'flat' },
        keys: { prefix: { strategy: 'fixed', value: 'common' } },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/home/index.vue')).toBe('common');
    expect(gen.getDirectoryPrefix('/tmp/other/anywhere.vue')).toBe('common');
  });

  it('value 含 separator 时拆分为多段', () => {
    const gen = new IdGenerator(
      buildConfig({
        io: { format: 'flat' },
        keys: { prefix: { strategy: 'fixed', value: 'shared.global' } },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/anywhere.vue')).toBe('shared.global');
  });
});

describe('IdGenerator - RulesStrategy', () => {
  it('按路径分派到不同子策略：pages/components/utils 三类目录各走各的', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [
              {
                match: 'src/pages/**',
                use: { strategy: 'path', anchor: 'src', take: 3, preserveHyphens: true },
              },
              {
                match: 'src/components/**',
                use: {
                  strategy: 'path',
                  anchor: 'src',
                  includeFile: true,
                  fileNameCase: 'as-is',
                  indexFile: 'collapse-to-parent',
                },
              },
              {
                match: 'src/utils/**',
                use: {
                  strategy: 'path',
                  anchor: 'src',
                  includeFile: true,
                  fileNameCase: 'as-is',
                },
              },
            ],
            fallback: { strategy: 'path', anchor: 'src' },
          },
        },
      }),
    );
    // pages 走 take=3
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/flipped-course/components/Map.vue')).toBe(
      'pages.flipped-course.components',
    );
    // components 走 includeFile + collapse-to-parent
    expect(gen.getDirectoryPrefix('/tmp/proj/src/components/TagInput/index.vue')).toBe(
      'components.TagInput',
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/components/Button.vue')).toBe('components.Button');
    // utils 走 includeFile，文件名作为末段
    expect(gen.getDirectoryPrefix('/tmp/proj/src/utils/confirm.js')).toBe('utils.confirm');
    // fallback：未命中任何 rule
    expect(gen.getDirectoryPrefix('/tmp/proj/src/store/user.js')).toBe('store');
  });

  it('rule 顺序优先：先匹配先归属', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [
              { match: 'src/**', use: { strategy: 'fixed', value: 'first' } },
              { match: 'src/pages/**', use: { strategy: 'fixed', value: 'second' } },
            ],
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/pages/home/index.vue')).toBe('first');
  });

  it('无 fallback 且未命中时返回空前缀', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [{ match: 'src/pages/**', use: { strategy: 'fixed', value: 'pages' } }],
          },
        },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/utils/foo.js', '提交', new Set());
    expect(id).toBe('submit');
  });

  it('match 支持 RegExp', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [
              {
                match: /^src\/admin\//,
                use: { strategy: 'fixed', value: 'admin' },
              },
            ],
            fallback: { strategy: 'fixed', value: 'common' },
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/admin/users.vue')).toBe('admin');
    expect(gen.getDirectoryPrefix('/tmp/proj/src/other/foo.vue')).toBe('common');
  });

  it('match 支持函数', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'rules',
            rules: [
              {
                match: (fp) => fp.endsWith('.special.ts'),
                use: { strategy: 'fixed', value: 'special' },
              },
            ],
            fallback: { strategy: 'fixed', value: 'common' },
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/feature.special.ts')).toBe('special');
    expect(gen.getDirectoryPrefix('/tmp/proj/src/feature.ts')).toBe('common');
  });
});

describe('IdGenerator - CustomStrategy', () => {
  it('resolve 返回的段数组作为前缀', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: {
          prefix: {
            strategy: 'custom',
            resolve: (filePath) => {
              if (filePath.includes('/admin/')) return ['admin', 'panel'];
              return ['user'];
            },
          },
        },
      }),
    );
    expect(gen.getDirectoryPrefix('/tmp/proj/src/admin/settings.vue')).toBe('admin.panel');
    expect(gen.getDirectoryPrefix('/tmp/proj/src/profile.vue')).toBe('user');
  });

  it('resolve 返回空数组等价于无前缀', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { prefix: { strategy: 'custom', resolve: () => [] } },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/foo.vue', '提交', new Set());
    expect(id).toBe('submit');
  });
});

describe('IdGenerator - 唯一性', () => {
  it('重复 ID 追加 _N 后缀', () => {
    const gen = new IdGenerator(buildConfig());
    const existing = new Set<string>();
    const a = gen.generateWithFilePath('/tmp/proj/src/a/b/foo.vue', '提交', existing);
    const b = gen.generateWithFilePath('/tmp/proj/src/a/b/foo.vue', '提交', existing);
    expect(a).toBe('a.b.submit');
    expect(b).toBe('a.b.submit_1');
  });

  it('addDirectoryPrefixToId 使用已有 LLM 给的语义段', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.addDirectoryPrefixToId(
      '/tmp/proj/src/pages/home/index.vue',
      'confirmDelete',
      new Set(),
    );
    expect(id).toBe('pages.home.confirmdelete');
  });

  it('generateWithFixedPrefix 绕过 strategy', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.generateWithFixedPrefix('common', 'confirm', new Set());
    expect(id).toBe('common.confirm');
  });
});

describe('IdGenerator - fallback 兜底', () => {
  it('extend=true（默认）合并内置 18 条 + 命中 → 直接英文', () => {
    const gen = new IdGenerator(buildConfig());
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/index.vue', '确认', new Set());
    expect(id).toBe('pages.home.confirm');
  });

  it('extend=false 时不合并内置', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { fallback: { extend: false, mappings: { 提交: 'submitBtn' } } },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/index.vue', '提交', new Set());
    expect(id).toBe('pages.home.submitbtn');
    // 内置 '确认' 不再命中，走 hash 兜底
    const id2 = gen.generateWithFilePath('/tmp/proj/src/pages/home/index.vue', '确认', new Set());
    expect(id2).toMatch(/^pages\.home\.t_[a-z0-9]+$/);
  });

  it('extend=true 时用户配置覆盖内置同 key', () => {
    const gen = new IdGenerator(
      buildConfig({
        keys: { fallback: { extend: true, mappings: { 确认: 'okGo' } } },
      }),
    );
    const id = gen.generateWithFilePath('/tmp/proj/src/pages/home/index.vue', '确认', new Set());
    expect(id).toBe('pages.home.okgo');
  });
});

describe('IdGenerator - 内部工具', () => {
  it('applyCase camel 处理 CamelCase 输入', () => {
    expect(__internal.applyCase('UserList', 'camel')).toBe('userList');
  });

  it('applyCase kebab', () => {
    expect(__internal.applyCase('UserList', 'kebab')).toBe('user-list');
  });

  it('applyCase snake', () => {
    expect(__internal.applyCase('UserList', 'snake')).toBe('user_list');
  });

  it('applyCase as-is 保持原样', () => {
    expect(__internal.applyCase('My-Weird_Name', 'as-is')).toBe('My-Weird_Name');
  });

  it('sanitizeSemanticId 去前导序号', () => {
    expect(__internal.sanitizeSemanticId('9. 消息提示')).toBe('');
    expect(__internal.sanitizeSemanticId('submit_button')).toBe('submit_button');
  });

  it('extractSemanticPart 纯英文直接 sanitize', () => {
    expect(__internal.extractSemanticPart('Submit Form', {})).toBe('submit_form');
  });

  it('extractSemanticPart 中文 hash 兜底', () => {
    const r = __internal.extractSemanticPart('一段很长的中文', {});
    expect(r).toMatch(/^t_[a-z0-9]+$/);
  });
});
