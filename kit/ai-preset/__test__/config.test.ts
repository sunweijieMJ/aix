import { describe, expect, it } from 'vitest';
import { initConfigToPersisted, persistedToInitConfig } from '../src/core/config.js';
import type { InitConfig } from '../src/types.js';

describe('initConfigToPersisted', () => {
  const config: InitConfig = {
    platforms: ['claude', 'cursor'],
    framework: 'vue3',
    domains: ['component-lib', 'monorepo'],
    projectName: 'test',
    variables: { componentPrefix: 'aix' },
  };

  it('保留所有平台', () => {
    const persisted = initConfigToPersisted(config);
    expect(persisted.platforms).toEqual(['claude', 'cursor']);
  });

  it('保留变量', () => {
    const persisted = initConfigToPersisted(config);
    expect(persisted.variables.componentPrefix).toBe('aix');
  });

  it('支持 exclude/include', () => {
    const persisted = initConfigToPersisted(config, {
      exclude: ['base/git-workflow'],
    });
    expect(persisted.exclude).toEqual(['base/git-workflow']);
  });
});

describe('persistedToInitConfig', () => {
  it('还原为 InitConfig + UserConfig', () => {
    const persisted = initConfigToPersisted({
      platforms: ['claude'],
      framework: 'vue3',
      domains: ['component-lib'],
      projectName: 'test',
      variables: { componentPrefix: 'aix' },
    });

    const { initConfig, userConfig } = persistedToInitConfig(persisted, 'my-project');

    expect(initConfig.platforms).toEqual(['claude']);
    expect(initConfig.framework).toBe('vue3');
    expect(initConfig.domains).toEqual(['component-lib']);
    expect(initConfig.projectName).toBe('my-project');
    expect(initConfig.variables.componentPrefix).toBe('aix');
    expect(userConfig.variables?.componentPrefix).toBe('aix');
  });
});
