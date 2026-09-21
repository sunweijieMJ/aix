/**
 * visual-test init 生成的配置内容
 *
 * 测试重点：
 * - --yes 默认值与新增字段（deviceScaleFactor / ci.gate / fidelity）同步，
 *   避免 init 产物随 schema 演进而漂移
 * - 密钥绝不落进配置文件（FIGMA_TOKEN / LLM API Key 只以环境变量形式出现）
 */

import { describe, it, expect } from 'vitest';
import { generateConfigContent } from '../../../src/cli/commands/init';
import type { InitAnswers } from '../../../src/cli/ui/prompts';

/** 与 init --yes 的默认回答保持一致 */
const yesAnswers: InitAnswers = {
  projectName: 'my-project',
  baselineProvider: 'local',
  enableLLM: false,
  llmModel: 'gpt-4o',
};

describe('generateConfigContent', () => {
  it('emits the current config surface for --yes defaults', () => {
    const content = generateConfigContent(yesAnswers);

    expect(content).toContain("name: 'my-project'");
    expect(content).toContain("provider: 'local'");
    expect(content).toContain('deviceScaleFactor: 1');
    expect(content).toContain("gate: 'pixel'");
    expect(content).toContain('enabled: false');
    expect(content).toContain('fidelity: {');
    expect(content).toContain("viewport: 'frame'");
    expect(content).toContain("cssFile: 'public/assets/theme.css'");
    expect(content).toContain("prefix: '--aix-'");
    expect(content).toContain("dir: '.visual-test/fidelity'");
    expect(content).toContain("formats: ['md', 'json']");
  });

  it('writes the figma file key but never a token', () => {
    const content = generateConfigContent({
      ...yesAnswers,
      baselineProvider: 'figma-api',
      figmaFileKey: 'abc123',
      enableLLM: true,
      llmModel: 'claude-sonnet-4-20250514',
      apiKey: 'sk-super-secret',
    });

    expect(content).toContain("provider: 'figma-api'");
    expect(content).toContain("fileKey: 'abc123'");
    expect(content).toContain('enabled: true');
    // 密钥只以环境变量出现
    expect(content).not.toContain('sk-super-secret');
    expect(content).not.toContain('figd_');
    expect(content).toContain('process.env.ANTHROPIC_API_KEY');
  });

  it('leaves the figma block commented out when no file key is given', () => {
    const content = generateConfigContent({ ...yesAnswers, baselineProvider: 'figma-api' });

    expect(content).toContain("provider: 'figma-api'");
    expect(content).not.toMatch(/^\s{4}figma: \{/m);
    expect(content).toContain('// figma: {');
  });
});
