/**
 * 发布用构建：清理 dist → build.command → hooks.afterBuild → 写溯源 → 生成 dist/package.json
 *
 * 产物形态相关的修复（把某个 chunk 置空、改写压缩产物之类）不在这里 ——
 * 它是业务仓库的事，通过 hooks.afterBuild 挂入。
 */

import fs from 'fs';
import path from 'path';
import { logInfo, logOk, logStep, logWarn } from '../utils/logger';
import { run } from '../utils/exec';
import { formatBuildMeta, writeBuildMeta, writeManifest, type Manifest } from './manifest';
import type { PublishContext } from '../config/types';

/** 未指定版本时使用占位版本，避免本地验证产物被误发 */
export const LOCAL_VERSION = '0.0.0-local';

const copyFiles = (projectRoot: string, distPath: string, files: readonly string[]): void => {
  for (const file of files) {
    const source = path.join(projectRoot, file);
    if (!fs.existsSync(source)) {
      logWarn(`未找到 ${file}，跳过复制`);
      continue;
    }
    const target = path.join(distPath, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
};

/**
 * 完整构建，返回写入的发布清单。
 */
export const buildDist = async ({
  ctx,
  version = LOCAL_VERSION,
}: {
  ctx: PublishContext;
  version?: string;
}): Promise<Manifest> => {
  const { projectRoot, distPath, config } = ctx;
  // loader 已保证 command 非空数组
  const [file, ...args] = config.build.command as [string, ...string[]];

  // 清空旧产物：残留的入口目录会被派生进 exports，也会让产物修复重复作用于旧文件
  logStep(`清理 ${config.distDir}`);
  fs.rmSync(distPath, { recursive: true, force: true });

  logStep(config.build.command.join(' '));
  try {
    run(file, args, projectRoot);
  } catch (error) {
    // dist 在上一步已被清空，此刻仓库里没有任何可发布的产物。
    // 不点明的话，人会去试 -a publish 复用产物，然后撞上一条不知所云的「dist 不存在」
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\n构建失败，${config.distDir} 已在构建前清空：此刻没有可复用的产物，-a publish 顶不上，修好构建后重跑 -a full`,
      { cause: error },
    );
  }

  if (config.hooks.afterBuild) {
    logStep('afterBuild');
    // 抛错即构建失败：.build-meta.json 不会写，复用 dist 的门禁据此拒绝半成品
    await config.hooks.afterBuild({ projectRoot, distPath, version });
  }

  logStep('生成发布清单');
  copyFiles(projectRoot, distPath, config.manifest.copy);
  // 溯源信息必须此刻落盘：之后「复用 dist 发布」时 HEAD 可能已经变了
  const meta = writeBuildMeta({ projectRoot, distPath });
  // 复用 dist 的路径由 actions.ts 在确认之前打这行，所以只在新构建时打，避免一次流程里出现两遍
  logInfo(formatBuildMeta(meta));
  const manifest = writeManifest({ ctx, version });

  logOk('构建完成');
  return manifest;
};
