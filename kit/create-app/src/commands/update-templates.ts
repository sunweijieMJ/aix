import * as p from '@clack/prompts';
import { TemplateResolver } from '../core/resolver';
import { DEFAULT_TEMPLATES } from '../config/defaults';
import { handleError } from '../utils/logger';

export async function updateTemplates(): Promise<void> {
  try {
    p.intro('刷新模板缓存');
    const resolver = new TemplateResolver();

    for (const [platform, info] of Object.entries(DEFAULT_TEMPLATES)) {
      const spinner = p.spinner();
      spinner.start(`拉取 ${platform} 模板...`);
      try {
        await resolver.fetch(info.source, { force: true });
        spinner.stop(`${platform} 模板已更新`);
      } catch (err) {
        spinner.stop(`${platform} 模板更新失败`, 1);
        p.log.warn(err instanceof Error ? err.message : String(err));
      }
    }

    p.outro('模板缓存刷新完成');
  } catch (err) {
    handleError(err);
  }
}
