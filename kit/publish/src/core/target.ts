/**
 * 发布目标的选择：dist-tag 与版本号。
 *
 * 只负责「把候选摆给人看、把选择收回来」，候选怎么算出来的在 versioning.ts，
 * 选出来之后合不合理由 checks.ts 判断。utils/prompts.ts 只放交互原语，这一层是发布语义。
 */

import { ask, isInteractive, select } from '../utils/prompts';
import { c, logInfo, logWarn } from '../utils/logger';
import * as npm from './npm';
import * as semver from './semver';
import { buildVersionChoices, commonTags, validateTag } from './versioning';
import type { ConfiguredTag } from '../config/loader';

/** 选择 dist-tag：配置声明 > 常用标签 > 手动输入 */
export const resolveTag = async ({
  distTags,
  configured,
  mainline,
  configFile,
  skip,
}: {
  distTags: Record<string, string>;
  configured: ConfiguredTag;
  mainline: readonly string[];
  configFile: string;
  skip: boolean;
}): Promise<string> => {
  // 非交互时直接采用解析出的标签。来自配置 / 环境变量的算显式选择；
  // 落到内置默认 latest 则是「没人声明过」，无人值守把包发进默认通道值得告警
  if (skip || !isInteractive()) {
    // 但「声明了 tags.byBranch，只是读不到分支名」不能只告警：告警会在 CI 日志里滚过去，
    // 而配置里明明写着这个分支该发哪个标签 —— 结果定制产物进了默认通道。
    // 拦下来，并给出两个现成的逃生口（它们都是显式选择，不依赖分支名）。
    if (configured.branchUnknown) {
      throw new Error(
        `${configFile} 里声明了 tags.byBranch，但读不到当前分支名（detached HEAD？CI 的 checkout <sha> / 浅克隆就是这个状态），` +
          `那些声明一条都没被求值 —— 无人值守时不能就这么把包发到兜底标签 ${configured.tag}。\n` +
          '请显式指定目标标签：-t <tag>，或设置环境变量 PUBLISH_TAG=<tag>',
      );
    }

    const line = `标签取自 ${configured.source}: ${c.bold(configured.tag)}`;
    if (configured.isDefault) logWarn(`${line} —— 未声明目标标签，将发布到默认通道`);
    else logInfo(line);
    return configured.tag;
  }

  const existing = Object.keys(distTags);
  if (existing.length) {
    logInfo(`已有标签 (${existing.length} 个):`);
    npm.tagListLines(distTags).forEach((line) => logInfo(line));
  }

  // 解析出的标签作为默认项排在第一位，仍可改选
  const candidates = [...new Set([configured.tag, ...commonTags(mainline)])];
  const choices: { name: string; value: string | null }[] = candidates.map((tag) => ({
    name: `${c.bold(tag)}${distTags[tag] ? c.dim(` (当前 ${distTags[tag]})`) : c.dim(' (新标签)')}${
      tag === configured.tag ? c.info(` ← ${configured.source}`) : ''
    }`,
    value: tag,
  }));
  choices.push({ name: '其它标签（手动输入）', value: null });

  const picked = await select('选择发布的 dist-tag:', choices);
  if (picked) return picked;

  return ask('输入 dist-tag', {
    defaultValue: 'latest',
    validate: (value) => validateTag(value),
  });
};

export const resolveVersion = async ({
  tag,
  distTags,
  versions,
  mainline,
  skip,
}: {
  tag: string;
  distTags: Record<string, string>;
  versions: string[];
  mainline: readonly string[];
  skip: boolean;
}): Promise<string> => {
  const choices = buildVersionChoices({ tag, distTags, versions, mainline });
  const options: { name: string; value: string | null }[] = choices.map((choice) => ({
    name: `${c.bold(choice.version)} ${c.dim(choice.label)}${choice.warning ? c.warn(` ⚠ ${choice.warning}`) : ''}`,
    value: choice.version,
  }));

  const picked = await select(
    `选择 ${c.bold(tag)} 的版本号:`,
    [...options, { name: '手动输入', value: null }],
    { skip },
  );
  if (picked) return picked;

  return ask('输入版本号', {
    defaultValue: choices[0]?.version ?? '',
    skip,
    validate: (value) => {
      if (!semver.isValid(value)) return '版本号不合法（需形如 2.0.20 或 2.0.20-beta.1）';
      if (versions.includes(value)) return `${value} 已发布过，请换一个`;
      return undefined;
    },
  });
};
