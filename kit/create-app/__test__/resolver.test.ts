import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { TemplateResolver, isLocalSource, resolveLocalSource } from '../src/core/resolver';
import { CreateAppError } from '../src/utils/errors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'template-pc');
const MINI_DIR = path.join(__dirname, 'fixtures', 'template-mini');

describe('isLocalSource', () => {
  it('识别绝对路径 / 相对路径 / home / file: 前缀', () => {
    expect(isLocalSource('/abs/tpl')).toBe(true);
    expect(isLocalSource('./tpl')).toBe(true);
    expect(isLocalSource('../tpl')).toBe(true);
    expect(isLocalSource('~/tpl')).toBe(true);
    expect(isLocalSource('file:./tpl')).toBe(true);
  });

  it('giget 源不算本地路径', () => {
    expect(isLocalSource('github:org/repo/sub')).toBe(false);
    expect(isLocalSource('git:ssh://git@host/org/repo#main:packages/tpl')).toBe(false);
    expect(isLocalSource('gh:org/repo')).toBe(false);
  });
});

describe('resolveLocalSource', () => {
  it('绝对路径原样返回', () => {
    expect(resolveLocalSource('/abs/tpl')).toBe('/abs/tpl');
  });

  it('相对路径基于 cwd 展开', () => {
    expect(resolveLocalSource('./tpl')).toBe(path.resolve(process.cwd(), 'tpl'));
  });

  it('~/ 展开为 home 目录', () => {
    expect(resolveLocalSource('~/tpl')).toBe(path.join(os.homedir(), 'tpl'));
  });

  it('file: 前缀的三种写法都能展开', () => {
    expect(resolveLocalSource('file:/abs/tpl')).toBe('/abs/tpl');
    expect(resolveLocalSource('file:///abs/tpl')).toBe('/abs/tpl');
    expect(resolveLocalSource('file:./tpl')).toBe(path.resolve(process.cwd(), 'tpl'));
  });
});

describe('TemplateResolver.fetch - 本地路径', () => {
  const resolver = new TemplateResolver();
  const emptyDir = path.join(os.tmpdir(), `create-app-empty-${process.pid}`);
  fs.mkdirSync(emptyDir, { recursive: true });

  afterAll(() => {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it('绝对路径直接返回模板目录，不走 giget', async () => {
    await expect(resolver.fetch(MINI_DIR)).resolves.toBe(MINI_DIR);
  });

  it('file: 前缀同样命中本地分支', async () => {
    await expect(resolver.fetch(`file:${MINI_DIR}`)).resolves.toBe(MINI_DIR);
  });

  it('目录不存在时抛 E_TEMPLATE_FETCH_FAILED', async () => {
    await expect(resolver.fetch('/tmp/create-app-not-exist-xyz')).rejects.toMatchObject({
      code: 'E_TEMPLATE_FETCH_FAILED',
    });
  });

  it('目录存在但缺 .template/config.ts 时抛 E_NO_TEMPLATE_CONFIG', async () => {
    await expect(resolver.fetch(emptyDir)).rejects.toMatchObject({
      code: 'E_NO_TEMPLATE_CONFIG',
    });
  });
});

describe('TemplateResolver.readConfig', () => {
  const resolver = new TemplateResolver();

  it('成功读取 fixture 模板配置', async () => {
    const config = await resolver.readConfig(FIXTURE_DIR);
    expect(config.id).toBe('template-pc');
    expect(config.platform).toBe('web');
    expect(config.features).toHaveProperty('i18n');
    expect(config.features).toHaveProperty('override');
  });

  it('读取协议 v0.2 模板的 hint / default / scripts 字段', async () => {
    const config = await resolver.readConfig(MINI_DIR);
    expect(config.features['i18n']?.default).toBe(true);
    expect(config.features['i18n']?.hint).toBe('recommended');
    expect(config.features['i18n']?.scripts).toEqual(['i18n', 'i18n:dry']);
    expect(config.features['demoPages']?.default).toBeUndefined();
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

  it('模板要求 v0.2 协议时，旧版本 CLI 被拒绝', () => {
    const v02 = { ...mockConfig, compatibleCliVersions: '>=0.2.0 <0.3.0' };
    expect(() => resolver.checkCompat(v02, '0.2.0')).not.toThrow();
    expect(() => resolver.checkCompat(v02, '0.1.1')).toThrowError(
      expect.objectContaining({ code: 'E_VERSION_INCOMPATIBLE' }) as unknown as CreateAppError,
    );
  });
});
