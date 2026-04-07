import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CursorAdapter } from '../src/adapters/cursor.js';
import { CopilotAdapter } from '../src/adapters/copilot.js';
import { CodexAdapter } from '../src/adapters/codex.js';
import { loadRuleSources } from '../src/core/resolver.js';
import type { AdapterContext, PresetName } from '../src/types.js';
import { PRESET_MARKER_START } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

const context: AdapterContext = {
  projectRoot: '/tmp/test',
  projectName: 'test-project',
  variables: {},
  framework: 'vue3',
  domains: [],
};

describe('CursorAdapter', () => {
  const adapter = new CursorAdapter();

  it('platform 和 displayName 正确', () => {
    expect(adapter.platform).toBe('cursor');
    expect(adapter.displayName).toBe('Cursor');
  });

  it('为每个规则生成 .mdc 文件', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);

    expect(files.length).toBe(sources.length);
    for (const file of files) {
      expect(file.relativePath).toMatch(/^\.cursor\/rules\/.*\.mdc$/);
    }
  });

  it('MDC 文件包含正确的 frontmatter', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const sample = files.find((f) => f.relativePath.includes('sample-rule'));

    expect(sample).toBeDefined();
    expect(sample!.content).toContain('---');
    expect(sample!.content).toContain('description:');
    expect(sample!.content).toContain('alwaysApply:');
  });

  it('base 层规则 alwaysApply 为 true', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const sample = files.find((f) => f.relativePath.includes('sample-rule'));

    expect(sample!.content).toContain('alwaysApply: true');
  });

  it('framework 层规则 alwaysApply 为 false', async () => {
    const sources = await loadRuleSources(fixturesDir, ['vue3' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const vue = files.find((f) => f.relativePath.includes('vue-rule'));

    expect(vue!.content).toContain('alwaysApply: false');
  });
});

describe('CopilotAdapter', () => {
  const adapter = new CopilotAdapter();

  it('platform 和 displayName 正确', () => {
    expect(adapter.platform).toBe('copilot');
    expect(adapter.displayName).toBe('GitHub Copilot');
  });

  it('生成单个合并文件（不生成子文件）', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);

    // 只有一个主文件
    expect(files.length).toBe(1);
    const entry = files.find((f) => f.relativePath === '.github/copilot-instructions.md');
    expect(entry).toBeDefined();
    expect(entry!.content).toContain('Copilot Instructions');
  });

  it('入口文件直接包含规则内容', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const entry = files.find((f) => f.relativePath === '.github/copilot-instructions.md');

    // 规则内容直接合并，不再是链接引用
    expect(entry!.content).toContain('示例规则');
  });
});

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  it('platform 和 displayName 正确', () => {
    expect(adapter.platform).toBe('codex');
    expect(adapter.displayName).toBe('OpenAI Codex');
  });

  it('生成单个 AGENTS.md', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);

    expect(files.length).toBe(1);
    expect(files[0]!.relativePath).toBe('AGENTS.md');
  });

  it('AGENTS.md 包含标记区域', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);

    expect(files[0]!.content).toContain(PRESET_MARKER_START);
  });

  it('所有规则合并为 ## 章节', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const content = files[0]!.content;

    // 每个规则应有一个 ## 标题
    for (const source of sources) {
      expect(content).toContain(`## ${source.meta.title}`);
    }
  });
});
