/**
 * `pnpm docs:smoke` 的入口：起一份 vitepress preview，逐页检查活演示是否挂载。
 *
 * 需要先 `pnpm docs:build`。传 `--base <url>` 可以指向已经跑起来的站点，跳过内部启动。
 */
import { smokeDemos, startPreview } from './smoke-demos';

const args = process.argv.slice(2);
const baseArg = args.indexOf('--base');
const externalBase = baseArg >= 0 ? args[baseArg + 1] : undefined;
const root = process.cwd();

let stop: (() => void) | undefined;
let baseUrl = externalBase;

if (!baseUrl) {
  const preview = await startPreview(root, 4173);
  baseUrl = preview.baseUrl;
  stop = () => preview.child.kill();
}

console.log(`🔎 逐页检查活演示：${baseUrl}\n`);

try {
  const results = await smokeDemos({ root, baseUrl, log: (line) => console.log(line) });
  const failed = results.filter(
    (result) =>
      result.actual < result.expected || result.errors.length > 0 || result.missing.length > 0,
  );

  console.log(`\n${'='.repeat(50)}`);
  if (failed.length === 0) {
    const total = results.reduce((sum, result) => sum + result.actual, 0);
    console.log(`✨ ${results.length} 个页面、${total} 个演示全部挂载，无页面报错`);
    console.log('='.repeat(50));
  } else {
    console.log(`✗ ${failed.length} 个页面有问题：`);
    for (const result of failed) {
      if (result.actual < result.expected) {
        console.log(
          `  · ${result.page}：源码里有 ${result.expected} 个演示，页面上只渲染出 ${result.actual} 个`,
        );
      }
      for (const error of result.errors) console.log(`  · ${result.page}：页面报错 ${error}`);
      for (const file of result.missing) console.log(`  · ${result.page}：站内资源 404 ${file}`);
    }
    console.log('='.repeat(50));
    process.exitCode = 1;
  }
} finally {
  stop?.();
}
