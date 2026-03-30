import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { loadRuleSources } from '../src/core/resolver.js';
import type { AdapterContext, PresetName } from '../src/types.js';
import { PRESET_MARKER_END, PRESET_MARKER_START } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  const context: AdapterContext = {
    projectRoot: '/tmp/test-project',
    projectName: 'test-project',
    variables: { componentPrefix: 'app' },
    framework: 'vue3',
    domains: [],
  };

  it('platform 和 displayName 正确', () => {
    expect(adapter.platform).toBe('claude');
    expect(adapter.displayName).toBe('Claude Code');
  });

  it('生成 CLAUDE.md 文件', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeMd).toBeDefined();
    expect(claudeMd!.content).toContain(PRESET_MARKER_START);
    expect(claudeMd!.content).toContain(PRESET_MARKER_END);
  });

  it('agent 标签的规则输出为独立 agent 文件', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);

    // agent-rule.md 有 agent 标签
    const agentFile = files.find((f) =>
      f.relativePath.startsWith('.claude/agents/'),
    );
    expect(agentFile).toBeDefined();
    expect(agentFile!.relativePath).toBe('.claude/agents/agent-rule.md');
  });

  it('agent 文件包含正确的 frontmatter', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const agentFile = files.find(
      (f) => f.relativePath === '.claude/agents/agent-rule.md',
    );
    expect(agentFile).toBeDefined();
    expect(agentFile!.content).toContain('---');
    expect(agentFile!.content).toContain('name: agent-rule');
    expect(agentFile!.content).toContain('tools: Read, Grep, Glob');
    expect(agentFile!.content).toContain('model: inherit');
  });

  it('CLAUDE.md 不包含 agent 标签的内容', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeMd!.content).not.toContain('Agent 内容');
  });

  it('CLAUDE.md 包含非 agent 规则的内容', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeMd!.content).toContain('示例内容');
  });

  it('CLAUDE.md 包含技术栈概览', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeMd!.content).toContain('Vue 3');
    expect(claudeMd!.content).toContain('TypeScript');
  });
});
