import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadRuleSources,
  mergeRuleSources,
  resolvePresetNames,
} from '../src/core/resolver.js';
import type { InitConfig, PresetName } from '../src/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

describe('resolvePresetNames', () => {
  it('始终包含 base', () => {
    const config: InitConfig = {
      platforms: ['claude'],
      domains: [],
      projectName: 'test',
      variables: {},
    };
    expect(resolvePresetNames(config)).toContain('base');
  });

  it('包含指定的 framework', () => {
    const config: InitConfig = {
      platforms: ['claude'],
      framework: 'vue3',
      domains: [],
      projectName: 'test',
      variables: {},
    };
    const names = resolvePresetNames(config);
    expect(names).toEqual(['base', 'vue3']);
  });

  it('包含指定的 domains', () => {
    const config: InitConfig = {
      platforms: ['claude'],
      framework: 'vue3',
      domains: ['component-lib', 'monorepo'],
      projectName: 'test',
      variables: {},
    };
    const names = resolvePresetNames(config);
    expect(names).toEqual(['base', 'vue3', 'component-lib', 'monorepo']);
  });
});

describe('loadRuleSources', () => {
  it('加载 base 目录的规则文件', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.meta.layer === 'base')).toBe(true);
  });

  it('按 layer + priority 排序', async () => {
    const sources = await loadRuleSources(fixturesDir, [
      'base' as PresetName,
      'vue3' as PresetName,
    ]);

    // base 层应在 framework 层之前
    const baseIdx = sources.findIndex((s) => s.meta.layer === 'base');
    const frameworkIdx = sources.findIndex((s) => s.meta.layer === 'framework');
    if (baseIdx !== -1 && frameworkIdx !== -1) {
      expect(baseIdx).toBeLessThan(frameworkIdx);
    }
  });

  it('正确解析 frontmatter', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const sample = sources.find((s) => s.meta.id === 'base/sample-rule');
    expect(sample).toBeDefined();
    expect(sample!.meta.title).toBe('示例规则');
    expect(sample!.meta.tags).toContain('test');
    expect(sample!.content).toContain('示例内容');
  });

  it('解析变量声明', async () => {
    const sources = await loadRuleSources(fixturesDir, ['vue3' as PresetName]);
    const vue = sources.find((s) => s.meta.id === 'vue3/vue-rule');
    expect(vue).toBeDefined();
    expect(vue!.meta.variables).toBeDefined();
    expect(vue!.meta.variables!.componentPrefix!.default).toBe('app');
  });
});

describe('mergeRuleSources', () => {
  it('过滤 exclude 列表中的规则', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const merged = mergeRuleSources(
      sources,
      { exclude: ['base/sample-rule'] },
      ['claude'],
    );
    expect(merged.ruleIds).not.toContain('base/sample-rule');
  });

  it('过滤不匹配的平台', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const merged = mergeRuleSources(sources, {}, ['cursor']);
    // claude-only 规则应被过滤（目标平台不含 claude）
    expect(merged.ruleIds).not.toContain('base/claude-only');
  });

  it('全平台规则不被过滤', async () => {
    const sources = await loadRuleSources(fixturesDir, ['base' as PresetName]);
    const merged = mergeRuleSources(sources, {}, ['cursor']);
    // sample-rule 的 platforms 为空（全平台），不应被过滤
    expect(merged.ruleIds).toContain('base/sample-rule');
  });

  it('收集变量默认值', async () => {
    const sources = await loadRuleSources(fixturesDir, ['vue3' as PresetName]);
    const merged = mergeRuleSources(sources, {}, ['claude']);
    expect(merged.variables.componentPrefix).toBe('app');
  });

  it('用户变量覆盖默认值', async () => {
    const sources = await loadRuleSources(fixturesDir, ['vue3' as PresetName]);
    const merged = mergeRuleSources(
      sources,
      { variables: { componentPrefix: 'aix' } },
      ['claude'],
    );
    expect(merged.variables.componentPrefix).toBe('aix');
  });
});
