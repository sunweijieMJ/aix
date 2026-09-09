/**
 * 版本推导规则的离线断言。
 *
 * 用一份 `npm view <pkg> dist-tags versions --json` 的 registry 快照（fixtures/registry-snapshot.json，
 * 34 个标签 / 2550 个版本）跑断言。用快照而不是手写 fixture：形态覆盖度不是手写能凑出来的：标签名与预发布标识对不上（space → 1.6.89-space-beta.3、
 * aeu → 1.7.5-aeu-ws.43）、指针落后于自己的序列、不合标准的预发布段（1.6.25-beta.qk）。
 *
 * live 自检（kit-publish -a check）仍然保留，它核对的是当下的 registry。
 */

import { describe, expect, it } from 'vitest';
import {
  checkBumpPreContract,
  checkFirstChoiceIsPublishable,
  checkTags,
} from '../src/core/selfcheck';
import {
  buildVersionChoices,
  collectVersionTagWarnings,
  commonTags,
  currentVersionOfTag,
  inSeries,
  planDistTagUpdate,
  validateTag,
} from '../src/core/versioning';
import * as semver from '../src/core/semver';
import { DEFAULT_MAINLINE_TAGS } from '../src/config/loader';
import snapshot from './fixtures/registry-snapshot.json';

const distTags: Record<string, string> = snapshot['dist-tags'];
const versions: string[] = snapshot.versions;
const mainline = DEFAULT_MAINLINE_TAGS;

/** 把 selfcheck 的 CheckFn 收成一个失败清单，断言它是空的 */
const collectFailures = (run: (check: (n: string, c: boolean, d?: string) => void) => void) => {
  const failures: string[] = [];
  run((name, condition, detail = '') => {
    if (!condition) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  });
  return failures;
};

describe('registry 快照', () => {
  it('是一份有内容的真实快照', () => {
    expect(Object.keys(distTags).length).toBeGreaterThan(20);
    expect(versions.length).toBeGreaterThan(1000);
  });
});

// 这一组是对 2550 个版本 × 34 个标签做穷举校验，纯 CPU。本地约 0.4s，但 CI 的 4 vCPU runner
// 上 turbo 并行跑着近 30 个包，实测同比例慢约 25 倍（10s 量级），5s 默认预算不够用。
describe('候选推导（全量真实标签）', { timeout: 30_000 }, () => {
  it('每个标签的候选都合法、未发布过、无重复，且首选严格前进', () => {
    const failures = collectFailures((check) =>
      // report 传空函数：测试里不需要那几十行 “当前 → 候选” 的清单
      checkTags({ distTags, versions, mainline }, check, () => {}),
    );
    expect(failures).toEqual([]);
  });

  /**
   * 这条是 -y 的前提：confirmVersionTagMatch 在 -y 下只告警不阻断，理由是
   * 「会走到那里的版本号必是显式传入的」—— 而这只在自动推导出的首选从不触发告警时才成立。
   */
  it('首选候选不触发任何搭配告警，且发布后指针会被判为需要补设', () => {
    const failures = collectFailures((check) =>
      checkFirstChoiceIsPublishable({ distTags, versions, mainline }, check),
    );
    expect(failures).toEqual([]);
  });

  it('bumpPre 对全量版本 × 主线标签只前进、且一律给标准形态', () => {
    const failures = collectFailures((check) =>
      checkBumpPreContract({ versions, mainline }, check),
    );
    expect(failures).toEqual([]);
  });
});

describe('OEM 序列的历史形态', () => {
  it('无序号的 1.8.3-oem 被收回标准形态 1.8.3-oem.1', () => {
    expect(versions).toContain('1.8.3-oem');
    expect(semver.bumpPre('1.8.3-oem', 'oem')).toBe('1.8.3-oem.1');
    expect(semver.compare('1.8.3-oem.1', '1.8.3-oem')).toBeGreaterThan(0);
  });

  it('不标准的 1.6.25-beta.qk 退到下一个 patch 开标准序列，而不是延续 .qk.4', () => {
    expect(versions).toContain('1.6.25-beta.qk');
    // 直接取 semver.inc 会给出 1.6.25-beta.1，而它按 semver 反而更低（数字段 < 字符串段）
    expect(semver.compare('1.6.25-beta.1', '1.6.25-beta.qk')).toBeLessThan(0);
    expect(semver.bumpPre('1.6.25-beta.qk', 'beta')).toBe('1.6.26-beta.1');
  });

  it('指针指向别的序列时（space → 1.6.89-space-beta.3）首选是合法的前进', () => {
    expect(distTags.space).toBe('1.6.89-space-beta.3');
    expect(inSeries(distTags.space!, 'space')).toBe(false);

    const [first] = buildVersionChoices({ tag: 'space', distTags, versions, mainline });
    expect(first!.version).toBe('1.6.90-space.1');
    expect(semver.compare(first!.version, distTags.space!)).toBeGreaterThan(0);
    expect(inSeries(first!.version, 'space')).toBe(true);
  });
});

describe('bumpPre 的标准形态契约', () => {
  /**
   * 只守「严格大于」是不够的：semver.inc 会把三段预发布原样延长成 1.0.0-beta.1.3，
   * 确实前进了，却把非标准形态延续了下去。此时退到下一个 patch 开标准序列。
   */
  it('多段预发布不被延长，退到下一个 patch 开标准序列', () => {
    expect(semver.bumpPre('1.0.0-beta.1.2', 'beta')).toBe('1.0.1-beta.1');
    expect(semver.bumpPre('2.3.4-oem.7.0', 'oem')).toBe('2.3.5-oem.1');
    // 两条契约同时成立
    expect(semver.compare('1.0.1-beta.1', '1.0.0-beta.1.2')).toBeGreaterThan(0);
    expect(semver.isStandardPre('1.0.1-beta.1', 'beta')).toBe(true);
  });

  it.each([
    ['1.0.0-beta', 'beta', '1.0.0-beta.1'],
    ['1.0.0-beta.0', 'beta', '1.0.0-beta.1'],
    ['1.0.0-Beta.1', 'beta', '1.0.0-beta.1'],
    ['1.0.0-beta.1', 'beta', '1.0.0-beta.2'],
    ['1.0.0', 'beta', '1.0.1-beta.1'],
    ['2.0.20-beta.2', 'oem', '2.0.20-oem.1'],
    ['1.8.3-oem', 'oem', '1.8.3-oem.1'],
    ['1.6.25-beta.qk', 'beta', '1.6.26-beta.1'],
  ])('%s + %s → %s（既有行为不变）', (version, tag, expected) => {
    expect(semver.bumpPre(version, tag)).toBe(expected);
  });

  it('非法入参返回 null', () => {
    expect(semver.bumpPre('not-a-version', 'beta')).toBeNull();
  });
});

describe('isStandardPre', () => {
  it.each([
    ['1.0.0-beta.1', 'beta'],
    ['1.0.0-beta.0', 'beta'],
    ['1.0.0-oem.42', 'oem'],
    // 标签本身带点号：整段预发布是 <tag>.N，拆开虽是三段仍是标准形态
    ['1.3.96-sysu-test.1.1', 'sysu-test.1'],
    ['1.3.96-sysu-test.1', 'sysu-test'],
  ])('%s 对 %s 是标准形态', (version, tag) => {
    expect(semver.isStandardPre(version, tag)).toBe(true);
  });

  it.each([
    // 没有预发布段
    ['1.0.0', 'beta'],
    // 只有一段，没有序号
    ['1.0.0-beta', 'beta'],
    // 三段
    ['1.0.0-beta.1.2', 'beta'],
    // 序号不是纯数字
    ['1.0.0-beta.qk', 'beta'],
    // 标识与标签对不上（大小写也算对不上：registry 上两种写法会并存）
    ['1.0.0-oem.1', 'beta'],
    ['1.0.0-Beta.1', 'beta'],
    // 带点号的标签：少了自己的序号段就不是标准形态
    ['1.3.96-sysu-test.1', 'sysu-test.1'],
    // 非法版本号
    ['not-a-version', 'beta'],
  ])('%s 对 %s 不是标准形态', (version, tag) => {
    expect(semver.isStandardPre(version, tag)).toBe(false);
  });
});

describe('指针落后于自身序列', () => {
  it('当前版本取指针与序列最大值的较大者', () => {
    // 构造一个指针落后的场景：oem 序列已到 1.8.5-oem.11，指针却停在 1.8.3-oem
    const lagging = { ...distTags, oem: '1.8.3-oem' };
    expect(currentVersionOfTag('oem', lagging, versions)).toBe('1.8.5-oem.11');

    const [first] = buildVersionChoices({ tag: 'oem', distTags: lagging, versions, mainline });
    // 只信指针的话会给出一个早已发布过的号
    expect(versions).not.toContain(first!.version);
    expect(semver.compare(first!.version, '1.8.5-oem.11')).toBeGreaterThan(0);
  });

  it('latest 的序列是全部正式版，指针落后时候选不会低于最高正式版', () => {
    const lagging = { ...distTags, latest: '1.0.0' };
    const highestRelease = semver.maxVersion(versions.filter((v) => inSeries(v, 'latest')))!;
    expect(currentVersionOfTag('latest', lagging, versions)).toBe(highestRelease);

    const [first] = buildVersionChoices({ tag: 'latest', distTags: lagging, versions, mainline });
    expect(semver.compare(first!.version, highestRelease)).toBeGreaterThan(0);
  });
});

describe('搭配告警', () => {
  it('预发布版发到 latest 会告警', () => {
    const warnings = collectVersionTagWarnings({
      version: '9.9.9-beta.1',
      tag: 'latest',
      distTags,
      versions,
    });
    expect(warnings.some((w) => w.includes('预发布版本'))).toBe(true);
  });

  it('正式版号发到定制标签会告警', () => {
    const warnings = collectVersionTagWarnings({
      version: '9.9.9',
      tag: 'oem',
      distTags,
      versions,
    });
    expect(warnings.some((w) => w.includes('正式版本号'))).toBe(true);
  });

  it('beta 产物发到 oem 会被「不属于这条线」拦住', () => {
    const warnings = collectVersionTagWarnings({
      version: '9.9.9-beta.1',
      tag: 'oem',
      distTags,
      versions,
    });
    expect(warnings.some((w) => w.includes('不属于 oem 这条线'))).toBe(true);
  });

  it('低于指针与低于序列最大值是两条不同的告警', () => {
    // 指针与序列最大值不是同一个版本时两条才都成立；相等时后一条不加信息，故意不重复
    const ahead = { ...distTags, oem: '1.9.0-oem.1' };
    const warnings = collectVersionTagWarnings({
      version: '1.8.4-oem.1',
      tag: 'oem',
      distTags: ahead,
      versions,
    });
    expect(warnings.some((w) => w.includes('当前指向的'))).toBe(true);
    expect(warnings.some((w) => w.includes('序列已有的最大版本'))).toBe(true);
  });

  it('序列最大值恰好就是指针时，「低于序列最大」那条不重复说', () => {
    expect(distTags.oem).toBe('1.8.5-oem.11');
    const warnings = collectVersionTagWarnings({
      version: '1.8.4-oem.1',
      tag: 'oem',
      distTags,
      versions,
    });
    expect(warnings.filter((w) => w.includes('1.8.5-oem.11'))).toHaveLength(1);
  });
});

describe('dist-tag 校验', () => {
  it.each([
    ['oem', undefined],
    ['sysu-test.1', undefined],
    ['IEU-beta.8', undefined],
  ])('%s 合法', (tag, expected) => {
    expect(validateTag(tag)).toBe(expected);
  });

  it.each(['my_tag', '1beta', '', 'x', 'v1', 'v1.2'])('%s 不合法', (tag) => {
    expect(validateTag(tag)).toBeTypeOf('string');
  });
});

describe('指针补设判定', () => {
  it('已指向本次版本时不动', () => {
    expect(planDistTagUpdate({ current: '2.0.1', version: '2.0.1', tag: 'latest' }).action).toBe(
      'ok',
    );
  });
  it('指针更高时保持不动（其后可能已有新发布）', () => {
    expect(planDistTagUpdate({ current: '2.0.2', version: '2.0.1', tag: 'latest' }).action).toBe(
      'keep',
    );
  });
  it('其余情形补设', () => {
    expect(planDistTagUpdate({ current: undefined, version: '2.0.1', tag: 'oem' }).action).toBe(
      'set',
    );
    expect(planDistTagUpdate({ current: '2.0.0', version: '2.0.1', tag: 'latest' }).action).toBe(
      'set',
    );
  });
});

describe('常用标签列表', () => {
  it('由 mainline 派生，去掉 rc', () => {
    expect(commonTags(DEFAULT_MAINLINE_TAGS)).toEqual(['latest', 'beta', 'dev']);
  });
  it('跟随配置里的 mainline', () => {
    expect(commonTags(['alpha', 'beta'])).toEqual(['latest', 'alpha', 'beta']);
  });
});
