import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TemplateResolver } from '../src/core/resolver';
import { CreateAppError } from '../src/utils/errors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'template-pc');

describe('TemplateResolver.readConfig', () => {
  const resolver = new TemplateResolver();

  it('成功读取 fixture 模板配置', async () => {
    const config = await resolver.readConfig(FIXTURE_DIR);
    expect(config.id).toBe('template-pc');
    expect(config.platform).toBe('web');
    expect(config.features).toHaveProperty('i18n');
    expect(config.features).toHaveProperty('override');
    expect(config.entryFiles).toHaveProperty('src/main.ts');
  });

  it('缺少 .template/config.ts 时抛出 E_NO_TEMPLATE_CONFIG', async () => {
    await expect(resolver.readConfig('/tmp/nonexistent-template')).rejects.toMatchObject({
      code: 'E_NO_TEMPLATE_CONFIG',
    });
  });

  it('返回的对象符合 TemplateConfig 类型结构', async () => {
    const config = await resolver.readConfig(FIXTURE_DIR);
    expect(typeof config.compatibleCliVersions).toBe('string');
    expect(typeof config.variables).toBe('object');
    expect(Array.isArray(config.features)).toBe(false); // features 是 Record，非数组
  });
});

describe('TemplateResolver.checkCompat', () => {
  const resolver = new TemplateResolver();

  const mockConfig = {
    id: 'test',
    platform: 'web' as const,
    compatibleCliVersions: '>=0.1.0',
    variables: {},
    features: {},
    entryFiles: {},
  };

  it('版本满足时不抛错', () => {
    expect(() => resolver.checkCompat(mockConfig, '0.1.0')).not.toThrow();
    expect(() => resolver.checkCompat(mockConfig, '1.0.0')).not.toThrow();
  });

  it('版本不满足时抛出 E_VERSION_INCOMPATIBLE', () => {
    const strictConfig = { ...mockConfig, compatibleCliVersions: '>=1.0.0' };
    expect(() => resolver.checkCompat(strictConfig, '0.1.0')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
  });
});
