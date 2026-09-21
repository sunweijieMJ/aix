/**
 * 发布规则的常驻断言，拿 registry 真实数据跑候选推导。
 *
 * 几十个 dist-tag、数千个版本里的各种形态（标签名与预发布标识对不上、指针落后于自己的序列、
 * 不合标准的预发布段）不可能靠 fixture 穷举，这部分只有活数据才有意义 —— 同一批断言另有
 * 一份跑在 registry 快照上的离线版本（__test__/versioning.test.ts），CI 能跑。
 *
 * 业务仓库自己的契约（产物形态之类）通过 hooks.selfCheck 挂在最后：
 * 自检就该是一次跑完，「哪些需要联网」是实现细节。
 */

import { c, logInfo, logOk } from '../utils/logger';
import * as semver from './semver';
import {
  buildVersionChoices,
  collectVersionTagWarnings,
  currentVersionOfTag,
  inSeries,
  planDistTagUpdate,
  seriesVersions,
} from './versioning';
import type { CheckFn, HooksConfig } from '../config/types';

export interface SelfCheckInput {
  distTags: Record<string, string>;
  versions: string[];
  mainline: readonly string[];
}

/** 逐个真实标签核对候选列表 */
export const checkTags = (
  { distTags, versions, mainline }: SelfCheckInput,
  check: CheckFn,
  report: (line: string) => void = logInfo,
): void => {
  for (const tag of Object.keys(distTags)) {
    const choices = buildVersionChoices({ tag, distTags, versions, mainline });
    const label = `[${tag}]`;

    check(`${label} 至少给出一个候选`, choices.length > 0);
    if (!choices.length) continue;

    for (const { version } of choices) {
      check(`${label} 候选合法`, semver.isValid(version), version);
      check(`${label} 候选未发布过`, !versions.includes(version), version);
    }
    check(
      `${label} 候选无重复`,
      new Set(choices.map((choice) => choice.version)).size === choices.length,
    );

    const current = currentVersionOfTag(tag, distTags, versions);
    const seriesMax = semver.maxVersion(seriesVersions(tag, versions));
    const first = choices[0]!.version;

    // 这三条对全部标签成立，包括标签名与预发布标识对不上的那些
    //（space → 1.6.89-space-beta.3、aeu → 1.7.5-aeu-ws.43）：
    // bumpPre 的契约是「一律给标准形态且只前进」，不留豁免
    if (current)
      check(`${label} 首选高于当前版本 ${current}`, semver.compare(first, current) > 0, first);
    if (seriesMax)
      check(`${label} 首选高于序列最大 ${seriesMax}`, semver.compare(first, seriesMax) > 0, first);
    // latest 这条线的成员是全部正式版（见 inSeries），于是这条断言对它就是「首选是个正式版号」
    if (distTags[tag]) check(`${label} 首选落在自身序列里`, inSeries(first, tag), first);

    report(
      `${tag.padEnd(14)} 当前 ${(current ?? '无').padEnd(24)} → ${choices.map((choice) => choice.version).join(', ')}`,
    );
  }
};

/**
 * 首选候选必须能一路走完发布流程，不触发任何「版本与标签搭配异常」的确认。
 *
 * 这条是 -y 的前提：confirmVersionTagMatch 在 -y 下只告警不阻断，理由是「会走到那里的
 * 版本号必是显式传入的」—— 而这只在「自动推导出的首选从不触发告警」成立时才对。
 * 这个前提不能只写在注释里，得有东西拿真实标签在验它。
 *
 * 顺带验 planDistTagUpdate：首选严格高于当前版本（上面 checkTags 已断言），
 * 因此发布后回读到的旧指针一定是「需要补设」，不该被判成 keep 而把指针留在旧版本上。
 */
export const checkFirstChoiceIsPublishable = (
  { distTags, versions, mainline }: SelfCheckInput,
  check: CheckFn,
): void => {
  for (const tag of Object.keys(distTags)) {
    const [first] = buildVersionChoices({ tag, distTags, versions, mainline });
    if (!first) continue;

    const warnings = collectVersionTagWarnings({ version: first.version, tag, distTags, versions });
    check(`[${tag}] 首选不触发搭配告警`, warnings.length === 0, warnings.join('；'));

    const plan = planDistTagUpdate({ current: distTags[tag], version: first.version, tag });
    check(
      `[${tag}] 首选发布后指针需要补设而非保持`,
      plan.action === 'set',
      `${distTags[tag]} → ${first.version} 判成了 ${plan.action}`,
    );
  }
};

/**
 * bumpPre 的两条契约：结果严格大于入参、且是标准形态 <tag>.N。
 * 拿全量真实版本跑 —— 固定用例覆盖不到 registry 上那些形态各异的版本。
 */
export const checkBumpPreContract = (
  { versions, mainline }: Pick<SelfCheckInput, 'versions' | 'mainline'>,
  check: CheckFn,
): void => {
  const regressed: string[] = [];
  const nonStandard: string[] = [];

  for (const version of versions) {
    for (const tag of mainline) {
      const next = semver.bumpPre(version, tag);
      if (!next) continue;
      if (semver.compare(next, version) <= 0) regressed.push(`${version} +${tag} → ${next}`);
      // 形态判据与 bumpPre 自己守契约用的是同一个函数，两边各写一份会漂移
      if (!semver.isStandardPre(next, tag)) nonStandard.push(`${version} +${tag} → ${next}`);
    }
  }

  check(
    `bumpPre 只前进（${versions.length} 个版本 × ${mainline.length} 个主线标签）`,
    regressed.length === 0,
    regressed.slice(0, 3).join('、'),
  );
  check(
    'bumpPre 一律给标准形态 <tag>.N',
    nonStandard.length === 0,
    nonStandard.slice(0, 3).join('、'),
  );
};

/**
 * 跑完真实数据校验，返回是否全部通过。
 */
export const runSelfCheck = async ({
  distTags,
  versions,
  mainline,
  hooks,
}: SelfCheckInput & { hooks: HooksConfig }): Promise<boolean> => {
  let failed = 0;
  let passed = 0;

  const check: CheckFn = (name, condition, detail = '') => {
    if (condition) {
      passed++;
      return;
    }
    failed++;
    console.log(c.err(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`));
  };

  console.log(
    c.bold(`\n候选推导（${Object.keys(distTags).length} 个标签 / ${versions.length} 个版本）`),
  );
  checkTags({ distTags, versions, mainline }, check);
  checkFirstChoiceIsPublishable({ distTags, versions, mainline }, check);
  checkBumpPreContract({ versions, mainline }, check);

  if (hooks.selfCheck) {
    console.log(c.bold('\n业务仓库自检（hooks.selfCheck）'));
    await hooks.selfCheck(check);
  }

  console.log('');
  if (failed) {
    console.log(c.err(`❌ ${failed} 项未通过`) + c.dim(`（${passed} 项通过）`));
    return false;
  }
  logOk(`校验通过：${passed} 项`);
  return true;
};
