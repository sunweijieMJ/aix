/**
 * Storybook 自动发现模块
 *
 * 从 Storybook 的 /index.json 端点获取所有 story 列表，
 * 自动生成视觉测试目标，无需手动逐一配置。
 */

import picomatch from 'picomatch';

import { logger } from '../../utils/logger';
import type { VisualTestConfig } from '../config/schema';

const log = logger.child('StorybookDiscovery');

interface StorybookIndexEntry {
  id: string;
  title: string;
  name: string;
  type: 'story' | 'docs';
  tags?: string[];
}

interface StorybookIndex {
  v: number;
  entries: Record<string, StorybookIndexEntry>;
}

/** 与 configSchema 中 targetSchema 推导的类型对齐 */
interface Target {
  name: string;
  type: 'component' | 'page' | 'element';
  variants: Array<{
    name: string;
    url: string;
    baseline: string;
    selector?: string;
  }>;
}

/**
 * 从 Storybook /index.json 发现 story 并生成测试目标
 */
export async function discoverStories(
  config: VisualTestConfig,
): Promise<Target[]> {
  const sb = config.storybook;
  const baseUrl = (sb.url || config.server.url).replace(/\/+$/, '');

  const indexUrl = `${baseUrl}/index.json`;
  log.info(`Fetching Storybook index from ${indexUrl}`);

  let response: Response;
  try {
    response = await fetch(indexUrl);
  } catch (error) {
    throw new Error(
      `Failed to fetch Storybook index from ${indexUrl}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new Error(
      `Storybook index request failed: ${response.status} ${response.statusText} (${indexUrl})`,
    );
  }

  const index: StorybookIndex = (await response.json()) as StorybookIndex;

  // 过滤: 仅保留 type === 'story'
  const storyEntries = Object.values(index.entries).filter(
    (entry) => entry.type === 'story',
  );

  if (storyEntries.length === 0) {
    log.warn('No stories found in Storybook index');
    return [];
  }

  log.debug(`Found ${storyEntries.length} stories before filtering`);

  // 应用 include/exclude glob 过滤
  const isIncluded = picomatch(sb.include);
  const isExcluded =
    sb.exclude.length > 0 ? picomatch(sb.exclude) : () => false;

  const filteredEntries = storyEntries.filter((entry) => {
    const storyPath = `${entry.title}/${entry.name}`;
    return isIncluded(storyPath) && !isExcluded(storyPath);
  });

  log.debug(
    `${filteredEntries.length} stories after include/exclude filtering`,
  );

  // 按 title 分组为 targets
  const groupMap = new Map<string, StorybookIndexEntry[]>();

  for (const entry of filteredEntries) {
    const group = groupMap.get(entry.title);
    if (group) {
      group.push(entry);
    } else {
      groupMap.set(entry.title, [entry]);
    }
  }

  // 转换为 Target[]
  const targets: Target[] = [];

  for (const [title, entries] of groupMap) {
    const variants = entries.map((entry) => ({
      name: entry.name,
      url: `${baseUrl}/iframe.html?id=${encodeURIComponent(entry.id)}&viewMode=story`,
      baseline: `${sb.baselineDir}/${title.replace(/\//g, '-')}/${entry.name}.png`,
      selector: sb.defaultSelector,
    }));

    targets.push({
      name: title,
      type: 'component',
      variants,
    });
  }

  log.info(
    `Discovered ${targets.length} target(s) with ${filteredEntries.length} variant(s)`,
  );

  return targets;
}
