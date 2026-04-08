import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { isProjectRoot } from './detector';
import { generateFiles, generateOverrideUtils } from './generator';
import { checkProjectConflict, resolveConflicts, writeFiles, printFileTree } from './conflict';
import { runPrompts } from './prompts';
import { REQUIRED_MODULES, ALL_MODULES, type ModuleId } from './types';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('override-init')
  .description('一键生成定制化覆盖层目录结构和模板文件')
  .version(version)
  .option('-p, --project <code>', '定制目录名（如 sysu、gzdx）')
  .option('-l, --lang <ts|js>', '语言（ts/js）')
  .option('-m, --modules <list>', '定制模块（逗号分隔）')
  .option('-o, --output <dir>', '输出目录', 'src/overrides')
  .option('-y, --yes', '跳过确认提示', false)
  .option('--dry-run', '仅预览将生成的文件', false)
  .option('--force', '强制覆盖已有文件', false)
  .action(async (opts) => {
    const cwd = process.cwd();

    // 检查是否在项目根目录
    if (!isProjectRoot(cwd)) {
      console.error(pc.red('❌ 未检测到 package.json，请在项目根目录执行'));
      process.exit(1);
    }

    console.log(pc.bold('\n🚀 Override 初始化工具\n'));

    // 解析命令行参数中的 modules
    let modules: ModuleId[] | undefined;
    if (opts.modules) {
      modules = (opts.modules as string).split(',').map((m: string) => m.trim()) as ModuleId[];
      // 校验模块名
      for (const m of modules) {
        if (!ALL_MODULES.includes(m)) {
          console.error(pc.red(`❌ 未知模块: ${m}`));
          console.error(pc.dim(`   可用模块: ${ALL_MODULES.join(', ')}`));
          process.exit(1);
        }
      }
      // 确保必选模块
      for (const req of REQUIRED_MODULES) {
        if (!modules.includes(req)) {
          modules.push(req);
        }
      }
    }

    // 校验 lang 参数
    if (opts.lang && opts.lang !== 'ts' && opts.lang !== 'js') {
      console.error(pc.red(`❌ 无效语言: ${opts.lang}，只支持 ts 或 js`));
      process.exit(1);
    }

    // 交互式收集缺失参数
    const options = await runPrompts(cwd, {
      project: opts.project,
      lang: opts.lang,
      modules,
      output: opts.output,
      yes: opts.yes,
      dryRun: opts.dryRun,
      force: opts.force,
    });

    if (!options) {
      process.exit(0);
    }

    const outputDir = path.resolve(cwd, options.output);

    // 项目代码重名检测
    if (!options.dryRun) {
      const canContinue = await checkProjectConflict(options.project, outputDir, {
        force: options.force,
        yes: options.yes,
      });
      if (!canContinue) {
        console.log(pc.yellow('已取消'));
        return;
      }
    }

    // 生成文件
    const files = generateFiles(options);

    // dry-run 模式：仅预览
    if (options.dryRun) {
      console.log(pc.cyan('\n📋 预览模式 (--dry-run)，不会写入文件：\n'));
      console.log(pc.dim(`  输出目录: ${outputDir}/`));
      for (const file of files) {
        console.log(pc.dim(`  ${file.path}`));
      }
      console.log(pc.dim(`\n  共 ${files.length} 个文件`));
      return;
    }

    // 冲突处理
    const resolvedFiles = await resolveConflicts(files, outputDir, {
      force: options.force,
      yes: options.yes,
    });

    if (!resolvedFiles) {
      console.log(pc.yellow('已取消'));
      return;
    }

    if (resolvedFiles.length === 0) {
      console.log(pc.yellow('所有文件已存在，无需生成'));
      return;
    }

    // 写入文件
    writeFiles(resolvedFiles, outputDir);
    printFileTree(resolvedFiles, options.output);

    // ── 检测并生成 utils/override（仅 TS 项目，首次运行时） ──
    const utilsDir = path.resolve(cwd, 'src/utils/override');
    const utilsIndexFile = path.join(utilsDir, 'index.ts');
    let utilsGenerated = false;

    if (!options.dryRun) {
      const utilFiles = generateOverrideUtils(options.lang);
      const missingUtils = utilFiles.filter((f) => !fs.existsSync(path.join(utilsDir, f.path)));

      if (missingUtils.length > 0) {
        console.log(pc.cyan('\n🔧 检测到 src/utils/override/ 缺少以下文件，自动生成：\n'));
        writeFiles(missingUtils, utilsDir);
        printFileTree(missingUtils, 'src/utils/override');
        utilsGenerated = true;
      }
    }

    // ── 下一步提示 ──
    const ext = options.lang;
    const overridesAlias = `@/${options.output.replace(/^src\//, '')}`;

    console.log(pc.bold('\n📝 下一步：'));
    console.log(`  1. 在 ${pc.cyan(`${options.output}/registry.${ext}`)} 中添加学校 NID 映射`);
    console.log(`  2. 在各模块的 ${pc.cyan('index.' + ext)} 中实现定制逻辑\n`);

    if (!fs.existsSync(utilsIndexFile) && !utilsGenerated) {
      console.log(
        pc.yellow('  ⚠️  未检测到 src/utils/override/，请手动创建或重新运行（会自动生成）\n'),
      );
    }

    console.log(pc.bold('  手动接入定制系统：\n'));

    console.log(`  ${pc.dim('// main.ts — 初始化运行时覆盖')}`);
    console.log(`  import { initOverrides } from ${pc.cyan("'@/utils/override'")};`);
    console.log(`  import overrideConfig from ${pc.cyan(`'${overridesAlias}'`)};`);
    console.log(
      `  ${pc.dim("// import { instances } from '@/api/core/request'; // 如有 API 覆盖")}`,
    );
    console.log(`  ${pc.cyan('initOverrides')}({ pinia, i18n, config: overrideConfig, app });`);
    console.log(
      `  ${pc.dim('// initOverrides({ pinia, i18n, config: overrideConfig, app, apiInstances: instances }); // 如有 API 覆盖')}`,
    );

    console.log('');
    console.log(`  ${pc.dim('// router/index.ts — 注册路由覆盖（同步，在 createRouter 之前）')}`);
    console.log(`  import { routerManager } from ${pc.cyan("'@/utils/override'")};`);
    console.log(`  import { customRoutes } from ${pc.cyan(`'${overridesAlias}'`)};`);
    console.log(`  ${pc.cyan('routerManager.register')}(customRoutes);`);
    console.log(`  routes: [...${pc.cyan('routerManager.applyOverrides')}(staticRoutes)]`);
    console.log(`  ${pc.cyan('routerManager.addCustomRoutes')}(router);`);

    console.log('');
    console.log(`  ${pc.dim('// constants/index.ts — 合并静态常量')}`);
    console.log(`  import { mergeConstants } from ${pc.cyan("'@/utils/override'")};`);
    console.log(`  import { customConstants } from ${pc.cyan(`'${overridesAlias}'`)};`);
    console.log(
      `  export const ROLES = ${pc.cyan('mergeConstants')}(DEFAULT_ROLES, customConstants.roles ?? {});`,
    );

    console.log('');
  });

program.parse();
