import type { ResolvedConfig } from '../config';
import { createFrameworkAdapter } from '../adapters';
import type { FrameworkAdapter } from '../adapters';
import { FileProcessor } from './FileProcessor';

/**
 * 需要 AST 策略链的处理器基类
 *
 * 在 FileProcessor 之上注入 FrameworkAdapter（封装 TextExtractor / Transformer /
 * RestoreTransformer / ImportManager / ComponentInjector）。仅 Generate / Restore
 * 等真正需要解析与改写源代码的处理器才应继承本类。
 *
 * 构造时通过工厂函数创建框架适配器（也可由外部注入用于测试），不再依赖具体的
 * ReactAdapter / VueAdapter 类，新增框架无需修改本类。
 */
export abstract class BaseProcessor extends FileProcessor {
  /** 框架适配器（核心抽象，所有 i18n 操作通过此接口完成） */
  protected adapter: FrameworkAdapter;

  /**
   * @param config - 已解析的配置
   * @param isCustom - 是否为定制目录
   * @param adapter - 可选的框架适配器，未提供则按 config.framework 自动构建（测试可注入 mock）
   */
  constructor(config: ResolvedConfig, isCustom: boolean = false, adapter?: FrameworkAdapter) {
    super(config, isCustom);
    this.adapter = adapter ?? createFrameworkAdapter(config);
  }
}
