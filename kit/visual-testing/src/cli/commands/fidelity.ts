/**
 * visual-test fidelity - 设计还原度校验
 *
 * 单个 Figma 节点 ↔ 单个页面 URL，输出面向 agent 的结构化差异报告。
 * 退出码：0 完成（无论差异多少）；2 配置 / 网络 / 页面错误。
 * 不是门禁，差异数不影响退出码。
 */

import chalk from 'chalk';
import type { Command } from 'commander';

import { loadConfig, loadConfigFromFile } from '../../core/config/loader';
import { FidelityOrchestrator } from '../../core/fidelity/orchestrator';
import { logger, LogLevel, parseLogLevel } from '../../utils/logger';

interface FidelityCliOptions {
  figma: string;
  url: string;
  config?: string;
  selector?: string;
  viewport?: string;
  theme?: 'light' | 'dark';
  out?: string;
  format?: string;
  refresh?: boolean;
  llmVision?: boolean;
  json?: boolean;
  debug?: boolean;
}

export function registerFidelityCommand(program: Command): void {
  program
    .command('fidelity')
    .description(
      'Compare a rendered page against its Figma frame and report property-level differences',
    )
    .requiredOption('--figma <ref>', 'Figma URL with node-id, "<fileKey>:<nodeId>" or "<nodeId>"')
    .requiredOption('--url <url>', 'Page URL to render')
    .option('-c, --config <path>', 'Config file path')
    .option(
      '--selector <css>',
      'Root element selector (default: [data-figma=<nodeId>], #app > *, body > *)',
    )
    .option(
      '--viewport <frame|WxH>',
      'Viewport: "frame" follows the Figma frame size, or e.g. 1440x900',
    )
    .option('--theme <light|dark>', 'Emulate prefers-color-scheme')
    .option('--out <dir>', 'Output directory (default: <fidelity.output.dir>/<nodeId>)')
    .option('--format <list>', 'Report formats, comma separated: md,json')
    .option('--refresh', 'Ignore cached Figma data')
    .option('--llm-vision', 'Describe unexplained diff regions with the configured LLM')
    .option('--json', 'Print the result JSON to stdout (suppresses logs)')
    .option('--debug', 'Enable debug logging')
    .action(async (options: FidelityCliOptions) => {
      await runFidelity(options);
    });
}

async function runFidelity(options: FidelityCliOptions): Promise<void> {
  try {
    const config = options.config ? await loadConfigFromFile(options.config) : await loadConfig();

    if (options.json) {
      logger.setLevel(LogLevel.ERROR);
    } else if (options.debug) {
      logger.setLevel(LogLevel.DEBUG);
    } else if (config.logging.level) {
      logger.setLevel(parseLogLevel(config.logging.level));
    }

    const viewport = parseViewport(options.viewport);
    const formats = options.format
      ? (options.format.split(',').map((s) => s.trim()) as Array<'md' | 'json'>)
      : undefined;
    for (const f of formats ?? []) {
      if (f !== 'md' && f !== 'json')
        throw new Error(`Unknown report format "${f}" (expected md or json)`);
    }

    if (!options.json) {
      console.log(chalk.gray(`Comparing ${options.url} against Figma ${options.figma} ...`));
    }

    const orchestrator = new FidelityOrchestrator(config);
    const { result, reports, outDir } = await orchestrator.run({
      figma: options.figma,
      url: options.url,
      selector: options.selector,
      viewport,
      theme: options.theme,
      outDir: options.out,
      formats,
      refresh: options.refresh,
      vision: options.llmVision,
    });

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }

    const s = result.summary;
    console.log('');
    console.log(chalk.bold('Fidelity:'));
    console.log(
      `  matched ${s.matched}/${s.total}  ${chalk.red(`major ${s.major}`)}  ${chalk.yellow(`minor ${s.minor}`)}  ${chalk.magenta(`missing ${s.missing}`)}`,
    );
    console.log(
      `  pixel mismatch ${result.pixel.mismatchPercentage.toFixed(1)}%  score ${s.score} ${chalk.gray('(advisory)')}`,
    );
    for (const w of result.warnings) console.log(chalk.yellow(`  ⚠ ${w}`));
    console.log('');
    console.log(chalk.bold('Reports:'));
    if (reports.md) console.log(`  Markdown: ${chalk.underline(reports.md)}`);
    if (reports.json) console.log(`  JSON: ${chalk.underline(reports.json)}`);
    console.log(`  Images: ${chalk.underline(outDir)}`);
    console.log('');
  } catch (error) {
    console.error(chalk.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 2;
  }
}

export function parseViewport(
  value?: string,
): 'frame' | { width: number; height: number } | undefined {
  if (!value) return undefined;
  if (value === 'frame') return 'frame';
  const m = value.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) throw new Error(`Invalid --viewport "${value}" (expected "frame" or "<width>x<height>")`);
  return { width: Number(m[1]), height: Number(m[2]) };
}
