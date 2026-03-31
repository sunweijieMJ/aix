import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeAdapter } from '../src/adapters/claude.js';
import { loadRuleSources } from '../src/core/resolver.js';
import type { AdapterContext, PresetName } from '../src/types.js';

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

  it('不生成 CLAUDE.md 文件（由用户自行维护）', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    const claudeMd = files.find((f) => f.relativePath === 'CLAUDE.md');
    expect(claudeMd).toBeUndefined();
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

  it('rules 类型的规则不输出任何文件', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const files = adapter.generateFiles(sources, context);
    // 只应有 agent/command/skill 类型的文件，不包含 rules 内容
    for (const file of files) {
      expect(file.relativePath).toMatch(
        /^\.claude\/(agents|commands|skills)\//,
      );
    }
  });
});
