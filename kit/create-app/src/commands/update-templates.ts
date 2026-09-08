import * as p from '@clack/prompts';
import { TemplateResolver } from '../core/resolver';
import { loadTemplateRegistry } from '../config/defaults';
import { isLocalSource } from '../core/resolver';
import { CreateAppError } from '../utils/errors';
import { handleError } from '../utils/logger';

/** 刷新注册表里所有远端模板的缓存：单条失败不中断其余，最终以非零退出反映失败 */
export async function updateTemplates(): Promise<void> {
  try {
    p.intro('刷新模板缓存');
    const resolver = new TemplateResolver();

    let total = 0;
    const failed: string[] = [];

    for (const entry of loadTemplateRegistry()) {
      // 本地路径模板不走缓存，无需刷新
      if (isLocalSource(entry.source)) continue;

      total += 1;
      // refresh: true = 重新 clone 一份完整的顶掉旧缓存
      const spinner = p.spinner();
      spinner.start(`拉取 ${entry.label} 模板...`);
      try {
        await resolver.fetch(entry.source, { refresh: true });
        spinner.stop(`${entry.label} 模板已更新`);
      } catch (err) {
        spinner.stop(`${entry.label} 模板更新失败`);
        failed.push(entry.label);
        p.log.warn(err instanceof Error ? err.message : String(err));
      }
    }

    if (failed.length > 0) {
      // 逐条病因已 warn，这里只交代总账并走统一错误出口
      throw new CreateAppError(
        'E_TEMPLATE_FETCH_FAILED',
        `模板缓存刷新失败 ${failed.length}/${total}：${failed.join('、')}`,
        '失败原因见上方逐条警告；旧缓存未被删除，仍可用 --offline 继续生成',
      );
    }

    p.outro('模板缓存刷新完成');
  } catch (err) {
    handleError(err);
  }
}
