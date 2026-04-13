import type { ProjectConfig } from '../../types';
import { buildMainTs } from './main-ts';
import { buildRouterIndex } from './router-index-ts';
import { buildViteConfig } from './vite-config-ts';

/** builder 函数签名 */
export type EntryBuilder = (config: ProjectConfig) => string;

/** 所有注册的 builder，key 与 TemplateConfig.entryFiles 的 value 对应 */
const BUILDERS: Record<string, EntryBuilder> = {
  buildMainTs,
  buildRouterIndex,
  buildViteConfig,
};

/**
 * 根据 builder 名称查找并执行，返回生成的文件内容。
 * 若 builderName 未注册，抛出错误。
 */
export function runEntryBuilder(builderName: string, config: ProjectConfig): string {
  const builder = BUILDERS[builderName];
  if (!builder) {
    throw new Error(
      `未找到 entry builder: "${builderName}"，已注册: ${Object.keys(BUILDERS).join(', ')}`,
    );
  }
  return builder(config);
}
