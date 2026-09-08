/**
 * dist-tag 与版本号的推导规则（与 UI / 交互 / 网络无关，可单独测试，见 __test__/versioning.test.ts）。
 *
 * 主线标签原是写死的 MAINLINE_TAGS，现在由配置 tags.mainline 提供，默认仍是 beta / dev / rc；
 * 各函数按需以参数接收，模块本身不持有任何配置状态。
 */

import * as semver from './semver';

/** 版本候选 */
export interface VersionChoice {
  version: string;
  label: string;
  /** 该候选自身值得说明的问题（顺延过、低于序列最大值），无则空串 */
  warning: string;
}

/**
 * 交互列表里优先展示的常用标签。
 *
 * latest 加上主线标签里除 rc 之外的那些 —— rc 很少用，摆在首屏只会挤掉真正常用的项。要让它出现在列表里，直接敲「其它标签（手动输入）」。
 */
export const commonTags = (mainline: readonly string[]): string[] => [
  'latest',
  ...mainline.filter((tag) => tag !== 'rc'),
];

/**
 * dist-tag 的合法形态：以字母开头，字母 / 数字 / 连字符，可用点号分段
 *（点号是历史遗留，registry 上确有 sysu-test.1、IEU-beta.8、cem-ws.1 这类标签）。
 *
 * 不含下划线：标签会被拼进 semver 预发布段（x.y.z-<tag>.N），而 semver 的预发布标识符
 * 不允许下划线。放行的话，工具会推荐出连自己的 semver.isValid 都判定为非法的版本号
 *（my_tag → 2.0.20-my_tag.1），用户选完才在后面报「版本号不合法」。
 */
const TAG_SHAPE = /^[a-zA-Z][a-zA-Z0-9-]*(?:\.[a-zA-Z0-9-]+)*$/;

/**
 * 校验 dist-tag：合法返回 undefined，非法返回原因
 *（与 utils/prompts 里 ask 的 validate 约定一致，交互与 CLI 共用同一处判据）。
 */
export const validateTag = (tag: unknown): string | undefined => {
  if (!TAG_SHAPE.test(`${tag}`)) {
    return `标签不合法: ${tag || '(空)'}（需以字母开头，仅含字母、数字、连字符与点号，不能含下划线）`;
  }

  // npm 会拒绝「能被解析成 semver 范围」的标签（x / X / v1 / v1.2 都是合法范围），
  // 而那道拒绝发生在 npm publish 时 —— 也就是几分钟构建之后。用同一个判据提前拦住。
  if (semver.isRange(tag)) {
    return `标签不合法: ${tag}（能被解析成 semver 范围，npm 会拒绝这种 dist-tag）`;
  }

  return undefined;
};

/**
 * 版本是否属于该标签这条线：1.8.3-oem.2 属于 oem；1.7.5-aeu-ws.43 不属于 aeu。
 * 按整个预发布标识比对（而非只看第一段），registry 上确实存在 sysu-test.1 这类带点号的标签。
 *
 * latest 必须特判：这条线上的版本没有预发布段，它的成员就是全部正式版。
 * 不特判的话 inSeries(x, 'latest') 恒为 false、seriesVersions('latest', …) 恒为空数组，
 * 于是 collectVersionTagWarnings 里「低于该序列已有最大版本」那条对最要紧的 latest 通道
 * 永远不触发 —— 而 latest 指针落后于最高正式版（甚至指着一个预发布）是真实出现过的情形，
 * 此时推出的候选可能低于已发布的正式版，把 latest 指到更低的号上，全程零告警。
 * 当下的实际情形跑 kit-publish -a check 看，别在这里写死版本号。
 */
export const inSeries = (version: string, tag: string): boolean => {
  const parsed = semver.parse(version);
  // 非法版本号不属于任何一条线（尤其不能因为「解析不出预发布段」就被当成正式版算进 latest）
  if (!parsed) return false;

  const pre = parsed.pre.join('.');
  if (tag === 'latest') return pre === '';
  return pre === tag || pre.startsWith(`${tag}.`);
};

/** 同一条线（1.8.3-oem.2 属于 oem 序列）下的全部版本 */
export const seriesVersions = (tag: string, versions: readonly string[]): string[] =>
  versions.filter((version) => inSeries(version, tag));

/**
 * 该标签下的「当前版本」：dist-tag 指针与该标签序列的最大版本取较大者
 *（latest 也走这条，它的序列是全部正式版，见 inSeries）。
 *
 * 只信指针是不够的：registry 上确实存在指针落后于自身序列的标签（如 oem-beta），
 * 此时基于指针递增会得到一个早已发布过的版本号。
 * 具体版本号不写在这里 —— 指针随时会被下一次发布推走，写死只会让注释过期。
 * 要看当下的实际情形，跑 kit-publish -a check。
 */
export const currentVersionOfTag = (
  tag: string,
  distTags: Record<string, string>,
  versions: readonly string[],
): string | null =>
  semver.maxVersion(
    [distTags[tag], ...seriesVersions(tag, versions)].filter((v): v is string => Boolean(v)),
  );

/**
 * 生成候选版本号列表：[{ version, label, warning }]，第一项即推荐值。
 */
export const buildVersionChoices = ({
  tag,
  distTags,
  versions,
  mainline,
}: {
  tag: string;
  distTags: Record<string, string>;
  versions: readonly string[];
  mainline: readonly string[];
}): VersionChoice[] => {
  const isLatest = tag === 'latest';

  /**
   * 主干基线：latest 指针与全部正式版取较大者 —— 与其它标签同一个口径（currentVersionOfTag）。
   *
   * 不能只信指针：latest 指针落后于最高正式版、甚至指着一个预发布，都是真实出现过的情形
   *（跑 -a check 看当下的实际值）。基于这样的指针推出的 patch 候选会低于已发布的正式版，
   * 而候选顺延只保证「不撞已发布的号」，保证不了「不低于它们」—— 版本线上有空洞时就会漏：
   * 已发 x.y.2 与 x.y.4、未发 x.y.3，指针停在 x.y.1，顺延就停在 x.y.3，
   * 把 latest 指到比已发布的 x.y.4 更低的号上。
   */
  const latestBaseline = currentVersionOfTag('latest', distTags, versions) ?? '0.0.0';

  const seriesMax = semver.maxVersion(seriesVersions(tag, versions));

  const choices: VersionChoice[] = [];
  /**
   * 追加一个候选。step 决定候选被占用时怎么顺延，必须与该候选自身的语义一致：
   * minor 候选撞车后应给下一个 minor（2.1.0 已发布 → 2.2.0），
   * 若一律按 patch 顺延，就会得到一个标着 "minor" 的 2.1.1。
   */
  const push = (
    version: string | null,
    label: string,
    step: (version: string) => string | null,
  ): void => {
    if (!version) return;

    // 候选已被发布过时继续顺延找空位，而不是静默丢掉这一项
    let candidate: string | null = version;
    for (let guard = 0; candidate && versions.includes(candidate) && guard < 500; guard++) {
      const next = step(candidate);
      // 带点号的标签（如 sysu-test.1）递增后可能原地打转，此时直接放弃这一项
      candidate = next === candidate ? null : next;
    }
    if (!candidate || versions.includes(candidate)) return;
    if (choices.some((choice) => choice.version === candidate)) return;

    const skipped = candidate !== version ? `${version} 起已发布，顺延` : '';
    const backwards =
      seriesMax && semver.compare(candidate, seriesMax) < 0
        ? `低于该序列已有最大版本 ${seriesMax}`
        : '';
    choices.push({
      version: candidate,
      label,
      warning: [skipped, backwards].filter(Boolean).join('；'),
    });
  };

  if (isLatest) {
    const byType = (type: 'major' | 'minor' | 'patch') => (version: string) =>
      semver.bumpRelease(version, type);

    // 预发布跑在正式版前面时（如 latest 2.0.19 而 beta 已到 2.0.20-beta.2），转正是最常见的诉求。
    // 只在主线序列里找基准：仓库里可能有几十条定制序列，任一个领先都会把正式版拽到它的基线上。
    const mainlineMax = semver.maxVersion(
      versions.filter((version) => {
        const first = semver.parse(version)?.pre[0];
        return first !== undefined && mainline.includes(first);
      }),
    );
    if (mainlineMax && semver.compare(mainlineMax, latestBaseline) > 0) {
      push(semver.bumpRelease(mainlineMax, 'patch'), `预发布 ${mainlineMax} 转正`, byType('patch'));
    }

    push(semver.bumpRelease(latestBaseline, 'patch'), 'patch', byType('patch'));
    push(semver.bumpRelease(latestBaseline, 'minor'), 'minor', byType('minor'));
    push(semver.bumpRelease(latestBaseline, 'major'), 'major', byType('major'));
  } else {
    const current = currentVersionOfTag(tag, distTags, versions);

    if (current) {
      // 候选一律以该标签自己这条线为基准。定制标签发的是自己的维护线，
      // 拿 latest 当基准会把版本号从 1.8.x 跳到 2.0.x，与该线的历史脱节
      const byType = (type: 'major' | 'minor' | 'patch') => (version: string) =>
        semver.advanceSeries(version, tag, type);

      push(semver.bumpPre(current, tag), `递增序号（基于 ${current}）`, (version) =>
        semver.bumpPre(version, tag),
      );
      push(
        semver.advanceSeries(current, tag, 'patch'),
        `patch 递进（基于 ${current}）`,
        byType('patch'),
      );
      push(
        semver.advanceSeries(current, tag, 'minor'),
        `minor 递进（基于 ${current}）`,
        byType('minor'),
      );

      // 兜底选项排最后：定制线若已经跟上主干，需要一个跨到主干基线的入口
      if (semver.compare(latestBaseline, current) > 0) {
        push(
          semver.advanceSeries(latestBaseline, tag, 'patch'),
          `跨到主干基线 latest ${latestBaseline}`,
          byType('patch'),
        );
      }
    } else {
      // 该标签还没有任何版本，只能以 latest 为基准开这条线
      const nextInSeries = (version: string) => semver.bumpPre(version, tag);
      push(
        semver.advanceSeries(latestBaseline, tag, 'patch'),
        `新标签，基于 latest ${latestBaseline} 开新序列 (patch)`,
        nextInSeries,
      );
      push(
        semver.advanceSeries(latestBaseline, tag, 'minor'),
        `新标签，基于 latest ${latestBaseline} 开新序列 (minor)`,
        nextInSeries,
      );
    }
  }

  return choices;
};

// ============ 版本号与 dist-tag 的搭配 ============

/**
 * 版本号与 dist-tag 搭配上的全部问题，按发现顺序返回（无问题则空数组）。
 *
 * 错配会让消费方 npm i 装到意料之外的版本，而「装到什么」只取决于版本号、标签、
 * registry 上的现状这三样，与是谁在问、问不问得动人无关 —— 所以它是纯函数，
 * 交互那半在 checks.ts 的 confirmVersionTagMatch。
 *
 * 逐项收集而不是命中即返回：命中一条就退出的话，后面几条根本跑不到。
 */
export const collectVersionTagWarnings = ({
  version,
  tag,
  distTags,
  versions,
}: {
  version: string;
  tag: string;
  distTags: Record<string, string>;
  versions: readonly string[];
}): string[] => {
  const isPre = Boolean(semver.parse(version)?.pre.length);
  const warnings: string[] = [];

  if (tag === 'latest' && isPre) {
    warnings.push(`${version} 是预发布版本，发到 latest 会成为消费方的默认安装版本`);
  }
  if (tag !== 'latest' && !isPre) warnings.push(`${version} 是正式版本号，却要发到 ${tag} 标签`);

  // 预发布标识属于另一条序列（2.0.20-beta.1 发到 oem）。上面两条只看「是不是预发布」，
  // 挡不住这种错配：三道校验全过、零告警，一个 beta 产物就进了 oem 通道。
  // 判据用的是 inSeries —— 与候选推导「一律以自己那条线为基准」是同一个口径
  if (tag !== 'latest' && isPre && !inSeries(version, tag)) {
    warnings.push(
      `${version} 的预发布标识不属于 ${tag} 这条线（该标签的序列形如 x.y.z-${tag}.N），发到该标签会让这条线的版本号来自另一个序列`,
    );
  }

  // 回退有两种，含义不同，分开报：
  //   低于指针     —— 本次发布会把指针拉到更低的版本，消费方 npm i pkg@tag 直接降级
  //   低于序列最大 —— 指针会落后于自己的序列，registry 上这种标签一直都有（连指针指向
  //                   别的序列的都有）。只比指针的话，这种「比序列里已有版本还低」的号
  //                   能一路静默发出去，版本号在这条线里就乱序了
  const pointer = semver.isValid(distTags[tag]) ? distTags[tag] : null;
  const seriesMax = semver.maxVersion(seriesVersions(tag, versions));

  if (pointer && semver.compare(version, pointer) < 0) {
    warnings.push(
      `${version} 低于 ${tag} 当前指向的 ${pointer}：发布后该标签会指向更低的版本，消费方会降级`,
    );
  }
  // 与上一条并列而非 else if：两种回退含义不同，都成立时就该都说。
  // 但序列最大值恰好就是指针时，两条会拿同一个版本号说两遍，那一条不加信息
  if (seriesMax && seriesMax !== pointer && semver.compare(version, seriesMax) < 0) {
    warnings.push(`${version} 低于 ${tag} 序列已有的最大版本 ${seriesMax}，版本号在这条线里会乱序`);
  }

  return warnings;
};

/**
 * 发布后回读到的指针该怎么处理，纯判定：
 *   ok   已经指向本次版本
 *   keep 指针比本次版本更高 —— 我们发布后又有人发了新版，改回去等于给对方降级
 *   set  其余情形都要补设
 */
export const planDistTagUpdate = ({
  current,
  version,
  tag,
}: {
  current: string | undefined;
  version: string;
  tag: string;
}): { action: 'ok' | 'keep' | 'set'; message: string } => {
  if (current === version) return { action: 'ok', message: `dist-tag ${tag} 已指向 ${version}` };

  if (current && semver.isValid(current) && semver.compare(current, version) > 0) {
    return {
      action: 'keep',
      message: `dist-tag ${tag} 指向 ${current}，比本次发布的 ${version} 更高（其后可能已有新发布），保持不动`,
    };
  }

  return {
    action: 'set',
    message: `dist-tag ${tag} 指向 ${current ?? '无'}，与本次发布的 ${version} 不一致，补设指针`,
  };
};
