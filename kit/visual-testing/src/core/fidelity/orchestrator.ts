/**
 * Fidelity 编排器：单个 Figma 节点 ↔ 单个页面 URL 的还原度校验
 *
 * 流程见 docs/fidelity-architecture.md §5.9：
 * Figma 节点树 + 位图（按版本缓存）→ Playwright 渲染 + DOM 提取 → 匹配 → 属性 diff
 * → 像素辅助（区域、裁图）→ 可选 LLM 视觉描述 → markdown + json 报告
 *
 * 判定全部确定性；LLM 输出只进 notes。
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { logger } from '../../utils/logger';
import { ensureDir, pathExists } from '../../utils/file';
import type { VisualTestConfig } from '../config/schema';
import { FigmaApiProvider } from '../baseline/figma-api-provider';
import { FigmaClient, resolveFigmaToken } from '../figma/client';
import { parseFigmaRef } from '../figma/url';
import type { FigmaNode } from '../figma/types';
import { PlaywrightScreenshotEngine } from '../screenshot/playwright-engine';
import { PixelComparisonEngine } from '../comparison/pixel-engine';
import { FidelityReporter } from '../report/fidelity-reporter';
import { createAdapter } from '../llm/adapters';
import { LLMCostController } from '../llm/cost-controller';
import { DESCRIBE_CROP_PROMPT } from '../llm/prompts/describe-crop';
import { extractDesignSpec } from './figma-spec-extractor';
import { extractRenderSpec } from './dom-extractor';
import {
  analyzeResponsive,
  defaultProbeWidths,
  measureAtWidths,
  type ResponsiveMeasurement,
} from './responsive-probe';
import { probeInteraction, type InteractionProbeResult } from './interaction-probe';
import { matchNodes } from './node-matcher';
import { diffMatches } from './property-diff';
import { TokenMapper } from './token-mapper';
import { cropRegions, isUnexplainedRegion } from './crop';
import type {
  DesignNode,
  FidelityRegion,
  FidelityResult,
  FidelitySummary,
  NodeMatch,
} from './types';

const log = logger.child('Fidelity');

export interface FidelityRunOptions {
  /** Figma URL / "<fileKey>:<nodeId>" / "<nodeId>" */
  figma: string;
  /** 页面 URL */
  url: string;
  /** 根元素选择器（覆盖配置） */
  selector?: string;
  /** 'frame' 或显式尺寸（覆盖配置） */
  viewport?: 'frame' | { width: number; height: number };
  theme?: 'light' | 'dark';
  /** 输出目录（覆盖配置；默认 <output.dir>/<nodeId>） */
  outDir?: string;
  formats?: Array<'md' | 'json'>;
  /** 忽略 Figma 缓存 */
  refresh?: boolean;
  /** 对未解释区域做 LLM 视觉描述 */
  vision?: boolean;
}

export interface FidelityRunOutput {
  result: FidelityResult;
  reports: { md?: string; json?: string };
  outDir: string;
}

interface CachedNodes {
  version: string;
  name: string;
  lastModified: string;
  node: FigmaNode;
}

export class FidelityOrchestrator {
  private readonly config: VisualTestConfig;
  private readonly engine: PlaywrightScreenshotEngine;
  private readonly client: FigmaClient;

  constructor(config: VisualTestConfig, deps: { figmaClient?: FigmaClient } = {}) {
    this.config = config;
    this.engine = new PlaywrightScreenshotEngine(config);
    this.client =
      deps.figmaClient ??
      new FigmaClient({ accessToken: resolveFigmaToken(config.baseline.figma?.accessToken) });
  }

  async run(options: FidelityRunOptions): Promise<FidelityRunOutput> {
    const start = Date.now();
    const warnings: string[] = [];
    const fcfg = this.config.fidelity;
    const dpr = this.config.screenshot.deviceScaleFactor;

    const { fileKey, nodeId } = parseFigmaRef(options.figma, this.config.baseline.figma?.fileKey);
    const outDir = options.outDir ?? path.join(fcfg.output.dir, safeName(nodeId));
    await ensureDir(outDir);

    // ---- 1. Figma 节点树（按版本缓存）----
    const cacheDir = path.join(this.config.directories.baselines, '..', 'cache', 'figma');
    const { node, version, name } = await this.loadNodes(
      fileKey,
      nodeId,
      cacheDir,
      options.refresh ?? false,
    );
    const design = extractDesignSpec(node);
    log.info(
      `Design: "${name}" ${design.bounds.width}x${design.bounds.height}, ${countNodes(design)} nodes`,
    );

    // ---- 2. Figma 位图 ----
    const designImage = path.join(outDir, 'design.png');
    const provider = new FigmaApiProvider({
      fileKey,
      cacheDir,
      refresh: options.refresh,
      client: this.client,
    });
    const baseline = await provider.fetch({
      source: { type: 'figma-api', source: nodeId, fileKey },
      outputPath: designImage,
      scale: dpr,
    });
    if (!baseline.success) {
      throw baseline.error ?? new Error('Failed to fetch Figma image');
    }

    // ---- 3. 渲染 + DOM 提取 + 截图 ----
    const viewportSetting = options.viewport ?? fcfg.viewport;
    const viewport =
      viewportSetting === 'frame'
        ? {
            width: Math.max(1, Math.ceil(design.bounds.width)),
            height: Math.max(1, Math.ceil(design.bounds.height)),
          }
        : viewportSetting;

    const renderImage = path.join(outDir, 'render.png');
    const probeWidths = fcfg.responsive.enabled
      ? fcfg.responsive.widths.length > 0
        ? fcfg.responsive.widths.filter((w) => w < viewport.width)
        : defaultProbeWidths(viewport.width)
      : [];

    let probe: {
      spec: Awaited<ReturnType<typeof extractRenderSpec>>;
      measurements: ResponsiveMeasurement[];
      interaction?: InteractionProbeResult;
    };
    try {
      // initialize 在 try 内：newContext / addCookies 失败时已启动的浏览器也要被关闭
      await this.engine.initialize();
      probe = await this.engine.withPage(
        { url: options.url, viewport, theme: options.theme },
        async (page) => {
          const spec = await extractRenderSpec(page, {
            rootSelector: options.selector ?? fcfg.rootSelector,
            rootFigmaId: nodeId,
            maxDepth: fcfg.extract.maxDepth,
            maxNodes: fcfg.extract.maxNodes,
          });
          // 截图必须在任何探测之前：探测会改视口、加临时标记、留下 hover 态
          await page.locator(spec.rootSelector).first().screenshot({ path: renderImage });

          const measurements =
            probeWidths.length > 0
              ? await measureAtWidths(page, {
                  rootSelector: spec.rootSelector,
                  widths: probeWidths,
                  baseViewport: viewport,
                  maxDepth: fcfg.extract.maxDepth,
                  maxNodes: fcfg.extract.maxNodes,
                })
              : [];

          const interaction = fcfg.interaction.enabled
            ? await probeInteraction(page, {
                rootSelector: spec.rootSelector,
                maxElements: fcfg.interaction.maxElements,
              })
            : undefined;

          return { spec, measurements, interaction };
        },
      );
    } finally {
      await this.engine.close();
    }
    const extraction = probe.spec;
    if (extraction.truncated) {
      warnings.push(
        `DOM 提取在 maxDepth=${fcfg.extract.maxDepth} / maxNodes=${fcfg.extract.maxNodes} 处截断（${extraction.nodeCount} 个元素），深层元素未参与比对`,
      );
    }
    log.info(`Render: root "${extraction.rootSelector}", ${extraction.nodeCount} elements`);

    // ---- 4. 匹配 + diff ----
    const {
      matches,
      unmatchedRender,
      warnings: matchWarnings,
    } = matchNodes(design, extraction.root, fcfg.match);
    warnings.push(...matchWarnings);
    const tokens = await this.loadTokens(warnings);
    diffMatches(matches, { tolerances: fcfg.tolerances, tokens, theme: options.theme });

    // ---- 5. 像素辅助（裁到交集比对：几像素的高度差不应变成一条贴边的幽灵区域）----
    const diffPath = path.join(outDir, 'diff.png');
    const comparison = await new PixelComparisonEngine().compare({
      baselinePath: designImage,
      actualPath: renderImage,
      diffPath,
      threshold: 0,
      antialiasing: true,
      sizeAlignment: 'crop',
    });
    if (comparison.sizeDiff) {
      const { baseline: b, actual: a } = comparison.sizeDiff;
      const ratio = Math.max(
        Math.abs(b.width - a.width) / b.width,
        Math.abs(b.height - a.height) / b.height,
      );
      if (ratio > 0.05) {
        warnings.push(
          `设计图 ${b.width}x${b.height} 与实现截图 ${a.width}x${a.height} 尺寸差超过 5%，请检查根元素选择器或 viewport；像素差异区域不可靠`,
        );
      } else {
        warnings.push(
          `设计图与实现截图尺寸略有差异（${b.width}x${b.height} vs ${a.width}x${a.height}），已裁到交集比对`,
        );
      }
    }

    let regions: FidelityRegion[];
    if (fcfg.crops.enabled && comparison.diffRegions.length > 0) {
      regions = await cropRegions(comparison.diffRegions, design, {
        designImagePath: designImage,
        renderImagePath: renderImage,
        outputDir: path.join(outDir, 'crops'),
        padding: fcfg.crops.padding,
        scale: dpr,
      });
    } else {
      regions = comparison.diffRegions.map((r) => ({
        bounds: {
          x: r.bounds.x / dpr,
          y: r.bounds.y / dpr,
          width: r.bounds.width / dpr,
          height: r.bounds.height / dpr,
        },
        pixels: r.pixels,
        relatedNodeIds: [],
      }));
    }

    // ---- 6. 可选 LLM 视觉描述 ----
    if ((options.vision ?? fcfg.vision.enabled) && regions.length > 0) {
      await this.describeRegions(regions, matches, design, warnings);
    }

    // ---- 7. 工程质量探测的结论（依赖匹配结果，故在此汇总）----
    const responsiveFindings =
      probe.measurements.length > 0
        ? analyzeResponsive(extraction.root.bounds, probe.measurements, matches)
        : [];

    // ---- 8. 汇总 + 报告 ----
    const summary = summarize(matches, {
      responsive: responsiveFindings.length,
      interaction: probe.interaction?.findings.length ?? 0,
    });
    const result: FidelityResult = {
      meta: {
        figma: { fileKey, nodeId, version, name },
        url: options.url,
        viewport,
        deviceScaleFactor: dpr,
        generatedAt: new Date().toISOString(),
        durationMs: Date.now() - start,
      },
      warnings,
      matches,
      unmatchedRender,
      responsive:
        probe.measurements.length > 0
          ? { widths: probe.measurements.map((m) => m.width), findings: responsiveFindings }
          : undefined,
      interaction: probe.interaction,
      pixel: {
        mismatchPercentage: comparison.mismatchPercentage,
        diffPath: comparison.diffPath,
        designImage,
        renderImage,
        regions,
      },
      summary,
    };

    const reports = await new FidelityReporter().generate(
      result,
      outDir,
      options.formats ?? fcfg.output.formats,
    );

    log.info(
      `Fidelity done in ${((Date.now() - start) / 1000).toFixed(1)}s: ` +
        `matched ${summary.matched}/${summary.total}, major ${summary.major}, minor ${summary.minor}, missing ${summary.missing}`,
    );

    return { result, reports, outDir };
  }

  // ---- 内部 ----

  private async loadNodes(
    fileKey: string,
    nodeId: string,
    cacheDir: string,
    refresh: boolean,
  ): Promise<{ node: FigmaNode; version: string; name: string }> {
    const cachePath = path.join(cacheDir, fileKey, `${safeName(nodeId)}.nodes.json`);

    let version = '';
    try {
      version = (await this.client.getFileMeta(fileKey)).version;
    } catch (error) {
      log.warn(`Cannot read Figma file version, cache disabled: ${(error as Error).message}`);
    }

    if (!refresh && version && (await pathExists(cachePath))) {
      try {
        const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8')) as CachedNodes;
        if (cached.version === version) {
          log.debug(`Figma nodes from cache (v${version})`);
          return { node: cached.node, version, name: cached.name };
        }
      } catch {
        /* 缓存损坏，重新拉取 */
      }
    }

    const fetched = await this.client.getNode(fileKey, nodeId);
    const resolvedVersion = fetched.version || version;
    if (resolvedVersion) {
      try {
        await ensureDir(path.dirname(cachePath));
        const entry: CachedNodes = {
          version: resolvedVersion,
          name: fetched.node.name,
          lastModified: fetched.lastModified,
          node: fetched.node,
        };
        await fs.writeFile(cachePath, JSON.stringify(entry), 'utf-8');
      } catch (error) {
        log.warn('Failed to cache Figma nodes', error as Error);
      }
    }
    return { node: fetched.node, version: resolvedVersion, name: fetched.node.name };
  }

  private async loadTokens(warnings: string[]): Promise<TokenMapper | undefined> {
    const { cssFile, prefix } = this.config.fidelity.tokens;
    if (!cssFile) return undefined;
    try {
      const mapper = await TokenMapper.fromFile(cssFile, prefix);
      log.debug(`Loaded ${mapper.size} color tokens from ${cssFile}`);
      return mapper;
    } catch (error) {
      warnings.push(`无法读取 token 文件 ${cssFile}：${(error as Error).message}`);
      return undefined;
    }
  }

  private async describeRegions(
    regions: FidelityRegion[],
    matches: NodeMatch[],
    design: DesignNode,
    warnings: string[],
  ): Promise<void> {
    const llm = this.config.llm;
    const endpoint = {
      apiKey: llm.analyze.apiKey ?? llm.apiKey ?? '',
      model: llm.analyze.model ?? llm.model,
      baseURL: llm.analyze.baseURL ?? llm.baseURL,
    };

    let adapter;
    try {
      adapter = createAdapter(endpoint);
    } catch (error) {
      warnings.push(`LLM 视觉描述未执行：${(error as Error).message}`);
      return;
    }

    const targets = regions
      .filter((r) => r.cropDesign && r.cropRender && isUnexplainedRegion(r, matches))
      .slice(0, 10);
    if (targets.length === 0) return;

    // 与回归路径共用成本控制：maxCallsPerRun / maxBudget 对视觉描述同样生效
    const cost = new LLMCostController({
      maxCallsPerRun: llm.costControl.maxCallsPerRun,
      diffThreshold: 0,
      cacheEnabled: false,
      cacheTTL: llm.costControl.cacheTTL,
      maxBudget: llm.costControl.maxBudget,
    });

    const nameOf = new Map<string, string>();
    walk(design, (n) => nameOf.set(n.id, n.name));

    for (const region of targets) {
      if (!cost.shouldCall()) {
        warnings.push('LLM 视觉描述：调用额度或预算已用尽，剩余区域未描述');
        break;
      }
      try {
        const [d, r] = await Promise.all([
          fs.readFile(region.cropDesign!),
          fs.readFile(region.cropRender!),
        ]);
        const nodes = region.relatedNodeIds.map((id) => nameOf.get(id) ?? id).join(', ') || '无';
        const res = await adapter.chatWithImages(
          [
            { data: d, label: '[设计稿裁图]' },
            { data: r, label: '[实际渲染裁图]' },
          ],
          DESCRIBE_CROP_PROMPT.replace('{{nodes}}', nodes),
          { model: endpoint.model, maxTokens: 200, temperature: 0.2 },
        );
        cost.recordCall(res.usage);
        const m = res.text.match(/\{[\s\S]*\}/);
        const parsed = m ? (JSON.parse(m[0]) as { note?: string }) : null;
        if (parsed?.note) region.note = String(parsed.note).replace(/\s+/g, ' ').trim();
      } catch (error) {
        cost.releaseCall();
        warnings.push(`LLM 视觉描述失败：${(error as Error).message}`);
        break;
      }
    }
  }
}

// ---- 辅助 ----

export function summarize(
  matches: NodeMatch[],
  extras: { responsive?: number; interaction?: number } = {},
): FidelitySummary {
  let major = 0;
  let minor = 0;
  let info = 0;
  let missing = 0;
  let missingLeaf = 0;
  for (const m of matches) {
    if (!m.render) {
      missing++;
      if (m.design.isLeaf) missingLeaf++;
      continue;
    }
    for (const d of m.diffs) {
      if (d.severity === 'major') major++;
      else if (d.severity === 'minor') minor++;
      else info++;
    }
  }
  // 叶子（图标 / 图片）缺失按 minor 权重计，由像素裁图兜底；容器 / 文本缺失才是重问题
  const missingContainer = missing - missingLeaf;
  const score = Math.max(
    0,
    Math.min(100, 100 - major * 5 - minor * 1 - missingContainer * 8 - missingLeaf * 2),
  );
  return {
    total: matches.length,
    matched: matches.length - missing,
    missing,
    missingLeaf,
    major,
    minor,
    info,
    // 工程质量探测独立计数：score 只反映与设计稿的静态吻合度，不该被这两项稀释
    responsive: extras.responsive ?? 0,
    interaction: extras.interaction ?? 0,
    score,
  };
}

function safeName(nodeId: string): string {
  return nodeId.replace(/[^0-9A-Za-z_-]/g, '-');
}

function countNodes(node: DesignNode): number {
  let n = 0;
  walk(node, () => n++);
  return n;
}

function walk(node: DesignNode, visit: (n: DesignNode) => void): void {
  visit(node);
  for (const c of node.children) walk(c, visit);
}
