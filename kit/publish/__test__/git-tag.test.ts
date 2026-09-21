/**
 * git tag 的判定规则。
 *
 * 重点是「什么时候不打」：tag 是溯源信息的一部分，指错 commit 比没有 tag 更坏 ——
 * 没有 tag 时人会去查 tarball 的 gitHead，指错了则没人会去核对。
 */

import { describe, expect, it } from 'vitest';
import { planGitTag, renderTagName } from '../src/core/git-tag';
import type { BuildMeta } from '../src/core/manifest';

const COMMIT = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
const OTHER = 'f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1';

const meta = (patch: Partial<BuildMeta> = {}): BuildMeta => ({
  commit: COMMIT,
  branch: 'master',
  dirty: false,
  builtAt: '2026-09-08T00:00:00.000Z',
  ...patch,
});

const plan = (
  metaValue: BuildMeta | null,
  existingTagCommit: string | null = null,
  tagName = 'v1.2.3',
) => planGitTag({ meta: metaValue, tagName, existingTagCommit });

// ============ tag 名模板 ============

describe('renderTagName', () => {
  it('默认模板只用版本号', () => {
    expect(renderTagName({ template: 'v{version}', name: '@kit/publish', version: '1.2.3' })).toBe(
      'v1.2.3',
    );
  });

  it('{name} 取去掉 scope 的包名', () => {
    expect(
      renderTagName({ template: '{name}@{version}', name: '@kit/publish', version: '0.1.1' }),
    ).toBe('publish@0.1.1');
  });

  it('没有 scope 的包名原样使用', () => {
    expect(renderTagName({ template: '{name}-v{version}', name: 'foo', version: '2.0.0' })).toBe(
      'foo-v2.0.0',
    );
  });

  it('同一占位出现多次时全部替换', () => {
    expect(renderTagName({ template: '{version}/{version}', name: 'foo', version: '1.0.0' })).toBe(
      '1.0.0/1.0.0',
    );
  });

  it('预发布版本号原样进 tag 名（dist-tag 已经在版本号里）', () => {
    expect(
      renderTagName({ template: 'v{version}', name: '@kit/publish', version: '1.2.3-beta.4' }),
    ).toBe('v1.2.3-beta.4');
  });
});

// ============ 打不打、打在哪 ============

describe('planGitTag', () => {
  it('没有 meta 时跳过：不知道产物来自哪个 commit', () => {
    expect(plan(null)).toMatchObject({ action: 'skip', commit: '', reason: '产物来源未知' });
  });

  it('meta 里 commit 为空时跳过', () => {
    expect(plan(meta({ commit: '' })).action).toBe('skip');
  });

  it('脏工作区打出的产物不打 tag', () => {
    const result = plan(meta({ dirty: true }));

    expect(result.action).toBe('skip');
    expect(result.reason).toMatch(/脏工作区/);
  });

  it('git 状态未知（dirty: null）时跳过，不当成干净', () => {
    const result = plan(meta({ dirty: null }));

    expect(result.action).toBe('skip');
    expect(result.reason).toMatch(/git 状态未知/);
  });

  // 更早版本写的 .build-meta.json 没有 dirty 字段，与 formatBuildMeta 一样按干净处理，
  // 否则老产物一律打不上 tag
  it('meta 没有 dirty 字段时按干净处理', () => {
    const { dirty: _dirty, ...legacy } = meta();

    expect(plan(legacy as BuildMeta)).toMatchObject({ action: 'create', commit: COMMIT });
  });

  it('本地没有同名 tag 时新建，指向产物来源 commit', () => {
    expect(plan(meta())).toEqual({
      action: 'create',
      tagName: 'v1.2.3',
      commit: COMMIT,
      reason: '',
    });
  });

  // 上次流程中断在推送之前：tag 在本地已经对了，远端可能还没有，所以仍要走推送
  it('同名 tag 已指向同一 commit 时复用，不重打', () => {
    expect(plan(meta(), COMMIT)).toMatchObject({ action: 'reuse', commit: COMMIT });
  });

  it('同名 tag 指向别的 commit 时跳过，绝不覆盖', () => {
    const result = plan(meta(), OTHER);

    expect(result.action).toBe('skip');
    expect(result.reason).toContain(OTHER.slice(0, 8));
    expect(result.reason).toMatch(/不覆盖/);
  });

  it('脏工作区的判定优先于「已存在同名 tag」', () => {
    expect(plan(meta({ dirty: true }), COMMIT).action).toBe('skip');
  });
});
