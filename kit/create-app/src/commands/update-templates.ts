import * as p from '@clack/prompts';
import { TemplateResolver } from '../core/resolver';
import { TEMPLATE_REGISTRY } from '../config/defaults';
import { isLocalSource } from '../core/resolver';
import { handleError } from '../utils/logger';

export async function updateTemplates(): Promise<void> {
  try {
    p.intro('刷新模板缓存');
    const resolver = new TemplateResolver();

    for (const entry of TEMPLATE_REGISTRY) {
      // 本地路径模板不走缓存，无需刷新
      if (isLocalSource(entry.source)) continue;

      // force: true 对 git 源 = 删掉缓存目录重新 clone，对 giget 源 = 重新下载
      const spinner = p.spinner();
      spinner.start(`拉取 ${entry.label} 模板...`);
      try {
        await resolver.fetch(entry.source, { force: true });
        spinner.stop(`${entry.label} 模板已更新`);
      } catch (err) {
        spinner.stop(`${entry.label} 模板更新失败`);
        p.log.warn(err instanceof Error ? err.message : String(err));
      }
    }

    p.outro('模板缓存刷新完成');
  } catch (err) {
    handleError(err);
  }
}
