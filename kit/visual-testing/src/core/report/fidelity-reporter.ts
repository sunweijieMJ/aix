/**
 * Fidelity 报告生成器：markdown（面向 agent）+ json（完整数据）
 *
 * markdown 结构固定：概要 → Major → Minor → 未解释区域 → DOM 多出元素。
 * 排序：missing 与 major 在前；同级按面积降序（大元素先修，往往连带修好子元素）。
 */

import path from 'node:path';

import fs from 'node:fs/promises';

import { ensureDir, writeJSON } from '../../utils/file';
import { logger } from '../../utils/logger';
import { isUnexplainedRegion } from '../fidelity/crop';
import type { FidelityResult, NodeMatch, PropertyDiff, RenderNode } from '../fidelity/types';

const log = logger.child('FidelityReporter');

export class FidelityReporter {
  async generate(
    result: FidelityResult,
    outputDir: string,
    formats: Array<'md' | 'json'>,
  ): Promise<{ md?: string; json?: string }> {
    await ensureDir(outputDir);
    const out: { md?: string; json?: string } = {};

    if (formats.includes('json')) {
      out.json = path.join(outputDir, 'fidelity.json');
      await writeJSON(out.json, result);
      log.info(`Fidelity JSON: ${out.json}`);
    }
    if (formats.includes('md')) {
      out.md = path.join(outputDir, 'fidelity.md');
      await fs.writeFile(out.md, renderMarkdown(result, outputDir), 'utf-8');
      log.info(`Fidelity report: ${out.md}`);
    }
    return out;
  }
}

export function renderMarkdown(result: FidelityResult, reportDir: string): string {
  const rel = (p?: string | null) => (p ? path.relative(reportDir, p) || '.' : '');
  const { meta, summary, pixel } = result;
  const lines: string[] = [];

  lines.push(
    `# Fidelity Report: ${meta.figma.name || meta.figma.nodeId} (${meta.figma.nodeId}) ↔ ${meta.url}`,
  );
  lines.push('');
  lines.push(
    `- Figma version ${meta.figma.version || 'unknown'} · viewport ${meta.viewport.width}×${meta.viewport.height} @${meta.deviceScaleFactor}x` +
      ` · matched ${summary.matched}/${summary.total} · major ${summary.major} · minor ${summary.minor} · missing ${summary.missing}` +
      ` · pixel mismatch ${pixel.mismatchPercentage.toFixed(1)}%`,
  );
  if (result.responsive || result.interaction) {
    const parts: string[] = [];
    if (result.responsive) parts.push(`响应式问题 ${summary.responsive}`);
    if (result.interaction) {
      parts.push(
        `交互反馈 ${result.interaction.withFeedback}/${result.interaction.total} 有 hover 效果`,
      );
    }
    lines.push(`- ${parts.join(' · ')}`);
  }
  lines.push(
    `- score ${summary.score}（只反映与设计稿的静态吻合度，不含响应式与交互，仅供趋势观察）`,
  );
  lines.push(
    `- design: ${rel(pixel.designImage)} · render: ${rel(pixel.renderImage)}${pixel.diffPath ? ` · diff: ${rel(pixel.diffPath)}` : ''}`,
  );
  if (result.warnings.length) {
    lines.push('');
    lines.push('> **Warnings**');
    for (const w of result.warnings) lines.push(`> - ${w}`);
  }

  // 容器 / 文本缺失进 Major；图标 / 图片等叶子缺失进 Minor（由像素裁图兜底）
  const missing = result.matches.filter((m) => !m.render && !m.design.isLeaf).sort(byArea);
  const missingLeaf = result.matches.filter((m) => !m.render && m.design.isLeaf).sort(byArea);
  const withMajor = result.matches
    .filter((m) => m.render && m.diffs.some((d) => d.severity === 'major'))
    .sort(byArea);
  const withMinorOnly = result.matches
    .filter((m) => m.render && m.diffs.length > 0 && !m.diffs.some((d) => d.severity === 'major'))
    .sort(byArea);

  // ---- Major ----
  lines.push('');
  lines.push('## Major');
  if (missing.length === 0 && withMajor.length === 0) {
    lines.push('');
    lines.push('无。');
  }
  for (const m of withMajor) {
    lines.push('');
    lines.push(`### ${title(m)}`);
    lines.push(
      `- Figma: ${m.design.name} (${m.design.id}) · DOM: \`${m.render!.selector}\` · match: ${m.method}${confidence(m)}`,
    );
    for (const d of m.diffs) lines.push(`- ${formatDiff(d)}`);
  }
  for (const m of missing) lines.push(...renderMissing(m, '未找到对应元素'));

  // ---- Minor ----
  lines.push('');
  lines.push('## Minor');
  if (withMinorOnly.length === 0 && missingLeaf.length === 0) {
    lines.push('');
    lines.push('无。');
  }
  for (const m of withMinorOnly) {
    lines.push('');
    lines.push(`### ${title(m)}`);
    lines.push(
      `- Figma: ${m.design.name} (${m.design.id}) · DOM: \`${m.render!.selector}\` · match: ${m.method}${confidence(m)}`,
    );
    for (const d of m.diffs) lines.push(`- ${formatDiff(d)}`);
  }
  for (const m of missingLeaf) lines.push(...renderMissing(m, '未找到对应元素（图标/图片）'));

  function renderMissing(m: NodeMatch, label: string): string[] {
    const out: string[] = [''];
    out.push(`### ${label}：${m.design.name}`);
    const b = m.design.bounds;
    out.push(
      `- Figma: ${m.design.name} (${m.design.id}) · bounds (${b.x}, ${b.y}) ${b.width}×${b.height} · type ${m.design.type}` +
        (m.design.componentId ? ` · component ${m.design.componentId}` : ''),
    );
    if (m.design.text?.content) out.push(`- text: "${m.design.text.content}"`);
    const region = pixel.regions.find((r) => r.relatedNodeIds.includes(m.design.id));
    if (region?.cropDesign)
      out.push(`- 裁图: ${rel(region.cropDesign)} · ${rel(region.cropRender)}`);
    return out;
  }

  // ---- 响应式健壮性 ----
  if (result.responsive) {
    lines.push('');
    lines.push('## 响应式健壮性');
    lines.push('');
    if (result.responsive.findings.length === 0) {
      lines.push(`在 ${result.responsive.widths.join(' / ')}px 宽度下未发现问题。`);
    } else {
      lines.push(
        `在 ${result.responsive.widths.join(' / ')}px 宽度下重新测量。静态比对只在设计稿尺寸下进行，` +
          '写死宽高同样能拿满分，以下问题不体现在上面的 major / minor 里。',
      );
      const order: Record<string, number> = {
        'no-reflow': 0,
        overflow: 1,
        'fixed-width-should-fill': 2,
        clipped: 3,
      };
      const sorted = [...result.responsive.findings].sort(
        (a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9),
      );
      for (const f of sorted) {
        const sev = f.severity === 'major' ? '**major**' : f.severity;
        const where = f.selector ? ` · \`${f.selector}\`` : '';
        const node = f.figmaId ? ` · Figma ${f.figmaId}` : '';
        lines.push('');
        lines.push(`- [${sev}] ${f.detail}${where}${node}`);
      }
    }
  }

  // ---- 交互反馈 ----
  if (result.interaction) {
    const { total, withFeedback, findings } = result.interaction;
    lines.push('');
    lines.push('## 交互反馈');
    lines.push('');
    if (total === 0) {
      lines.push('未检出可交互元素。');
    } else if (findings.length === 0) {
      lines.push(`${total} 个可交互元素全部具备 hover 反馈。`);
    } else {
      lines.push(
        `检出 ${total} 个可交互元素，其中 ${withFeedback} 个 hover 后有视觉变化。` +
          '设计稿通常只画静态态，这类问题静态比对发现不了。',
      );
      for (const f of findings) {
        lines.push('');
        lines.push(`- [${f.severity}] ${f.detail} · \`${f.selector}\``);
      }
    }
  }

  // ---- 未解释区域 ----
  const unexplained = pixel.regions.filter((r) => isUnexplainedRegion(r, result.matches));
  if (unexplained.length > 0) {
    lines.push('');
    lines.push('## 未解释的差异区域');
    lines.push('');
    lines.push(
      '以下区域像素有差异，但相关节点的结构化属性均在容差内，可能是图标形状、图片内容或渲染差异。',
    );
    for (let i = 0; i < unexplained.length; i++) {
      const r = unexplained[i]!;
      const idx = pixel.regions.indexOf(r) + 1;
      lines.push('');
      lines.push(
        `- region-${idx} (${r.bounds.x}, ${r.bounds.y}) ${r.bounds.width}×${r.bounds.height}` +
          (r.relatedNodeIds.length ? ` · nodes ${r.relatedNodeIds.join(', ')}` : ' · 无相关节点') +
          (r.cropDesign ? ` · 裁图 ${rel(r.cropDesign)} · ${rel(r.cropRender)}` : ''),
      );
      if (r.note) lines.push(`  - note: ${r.note.replace(/\s+/g, ' ').trim()}（LLM，仅供参考）`);
    }
  }

  // ---- DOM 多出 ----
  const extras = result.unmatchedRender.filter(isNotable);
  if (extras.length > 0) {
    lines.push('');
    lines.push('## DOM 多出的元素（设计中不存在）');
    lines.push('');
    for (const n of extras.slice(0, 30)) {
      lines.push(
        `- \`${n.selector}\` (${n.bounds.x}, ${n.bounds.y}) ${n.bounds.width}×${n.bounds.height}${n.text ? ` "${n.text}"` : ''}`,
      );
    }
    if (extras.length > 30) lines.push(`- … 另有 ${extras.length - 30} 个`);
  }

  lines.push('');
  return lines.join('\n');
}

// ---- 辅助 ----

function byArea(a: NodeMatch, b: NodeMatch): number {
  const area = (m: NodeMatch) => m.design.bounds.width * m.design.bounds.height;
  return area(b) - area(a);
}

function confidence(m: NodeMatch): string {
  // attr 是精确匹配、root 是默认绑定，二者都没有置信度可言
  return m.method && m.method !== 'attr' && m.method !== 'root'
    ? ` (${Math.round(m.confidence * 100)}%)`
    : '';
}

/** delta 为「四边最大绝对差」的属性，打印时不带符号 */
const ABS_DELTA_PROPS = new Set<PropertyDiff['property']>(['borderRadius', 'padding']);

function title(m: NodeMatch): string {
  const first = m.diffs.find((d) => d.severity === 'major') ?? m.diffs[0];
  const label: Record<PropertyDiff['property'], string> = {
    x: '水平位置偏移',
    y: '垂直位置偏移',
    width: '宽度不一致',
    height: '高度不一致',
    color: '文字颜色不一致',
    backgroundColor: '背景色不一致',
    fontSize: '字号不一致',
    fontWeight: '字重不一致',
    fontFamily: '字体族不一致',
    lineHeight: '行高不一致',
    letterSpacing: '字距不一致',
    borderRadius: '圆角不一致',
    padding: '内边距不一致',
    gap: '间距不一致',
    borderColor: '描边颜色不一致',
    borderWidth: '描边宽度不一致',
    boxShadow: '阴影不一致',
    opacity: '透明度不一致',
    text: '文案不一致',
  };
  const extra = m.diffs.length > 1 ? `（另 ${m.diffs.length - 1} 项）` : '';
  return `${m.design.name}：${first ? label[first.property] : '差异'}${extra}`;
}

function formatDiff(d: PropertyDiff): string {
  const sev = d.severity === 'major' ? '**major**' : d.severity === 'minor' ? 'minor' : 'info';
  let s = `[${sev}] ${d.property}: 期望 ${d.expected}`;
  if (d.token) s += ` → \`var(${d.token})\``;
  s += `，实际 ${d.actual}`;
  if (d.delta !== undefined) {
    const isColor =
      d.property === 'color' || d.property === 'backgroundColor' || d.property === 'borderColor';
    if (isColor) s += `（ΔE ${d.delta}）`;
    else if (ABS_DELTA_PROPS.has(d.property)) s += `（最大 Δ ${d.delta}）`;
    else s += `（Δ ${d.delta > 0 ? '+' : ''}${d.delta}）`;
  }
  if (d.hint) s += ` · ${d.hint}`;
  return s;
}

/** 过滤掉纯包装元素，只列有视觉意义的多出元素 */
function isNotable(n: RenderNode): boolean {
  if (n.text) return true;
  const s = n.styles;
  return (
    (s.backgroundColor !== null && s.backgroundKind !== 'none') ||
    s.borderWidth > 0 ||
    (s.boxShadow !== '' && s.boxShadow !== 'none')
  );
}
