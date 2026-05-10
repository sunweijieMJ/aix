import type { ExtractedString } from '../../utils/types';
import type { ITextExtractor } from '../../adapters/FrameworkAdapter';

/**
 * 文本提取器抽象基类
 *
 * 提供 extractFromFiles 的默认串行实现，子类只需实现 extractFromFile。
 * 之前 Vue/React 各自维护一份相同的 for-await 样板，统一到本基类。
 *
 * 放置在 strategies/base/ 而非 adapters/，以维持"策略层提供具体实现、
 * 适配器层定义抽象接口"的分层语义。adapters/ 仍然导出此类作为公共出口。
 */
export abstract class BaseTextExtractor implements ITextExtractor {
  abstract extractFromFile(filePath: string): Promise<ExtractedString[]>;

  async extractFromFiles(filePaths: string[]): Promise<ExtractedString[]> {
    const all: ExtractedString[] = [];
    for (const filePath of filePaths) {
      all.push(...(await this.extractFromFile(filePath)));
    }
    return all;
  }
}
