/**
 * HTML 报告生成器
 *
 * 使用 eta 模板引擎生成可视化报告，支持图片对比查看。
 */

import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Eta } from 'eta';

import { ensureDir } from '../../utils/file';
import { logger } from '../../utils/logger';
import type { Reporter, ReportContext, TestResult } from './types';

const log = logger.child('HtmlReporter');

/**
 * 定位模板目录（dist/templates 或 src 同级 templates）
 */
async function resolveTemplateDir(): Promise<string> {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(thisDir, '../templates/report'), // from dist/
    path.resolve(thisDir, '../../../templates/report'), // from src/core/report/
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 目录不存在，尝试下一个
    }
  }

  return candidates[0]!;
}

/**
 * 计算图片相对于报告目录的相对路径
 */
function resolveImagePath(imagePath: string, reportDir: string): string {
  if (!imagePath) return '';
  return path.relative(reportDir, imagePath);
}

export class HtmlReporter implements Reporter {
  readonly name = 'html';

  async generate(
    results: TestResult[],
    outputDir: string,
    context?: ReportContext,
  ): Promise<string> {
    const outputPath = path.join(outputDir, 'report.html');

    log.info(`Generating HTML report: ${outputPath}`);

    await ensureDir(outputDir);

    // 使用 orchestrator 预构建的结论数据
    if (!context?.conclusion) {
      throw new Error('HtmlReporter requires conclusion data in ReportContext');
    }
    const conclusion = context.conclusion;

    const toRelative = (p: string) => resolveImagePath(p, outputDir);

    const templateDir = await resolveTemplateDir();
    const templatePath = path.join(templateDir, 'index.html.eta');

    try {
      await access(templatePath);
    } catch {
      throw new Error(
        `HTML report template not found at ${templatePath}. ` +
          'Ensure the "templates" directory is included in the package build.',
      );
    }

    const cssPath = path.join(templateDir, 'styles.css');
    let css: string;
    try {
      css = await readFile(cssPath, 'utf-8');
    } catch {
      throw new Error(
        `HTML report styles not found at ${cssPath}. ` +
          'Ensure the "templates" directory is included in the package build.',
      );
    }

    const eta = new Eta({ views: templateDir, autoEscape: false });
    const html = eta.render('./index.html.eta', {
      results,
      conclusion,
      generatedAt: new Date().toISOString(),
      resolveImagePath: toRelative,
      css,
    });

    await writeFile(outputPath, html, 'utf-8');

    log.info(`HTML report generated: ${outputPath}`);
    return outputPath;
  }
}
