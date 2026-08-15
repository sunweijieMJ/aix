import type { BlockRenderers } from '../../types';
import AttachmentBlock from './AttachmentBlock.vue';
import ChartBlock from './ChartBlock.vue';
import ImageBlock from './ImageBlock.vue';
import QuoteBlock from './QuoteBlock.vue';
import ReasoningBlock from './ReasoningBlock.vue';
import SourcesBlock from './SourcesBlock.vue';
import TextBlock from './TextBlock.vue';
import ThoughtChainBlock from './ThoughtChainBlock.vue';
import ToolUseBlock from './ToolUseBlock.vue';
import UserConfirmBlock from './UserConfirmBlock.vue';

/**
 * 内置块渲染器注册表：块类型 → 组件。Bubble 与 props.blockRenderers 合并后分发（用户优先，可覆盖内置）。
 *
 * 单独成模块而非留在 Bubble.vue 内，是为了让契约测试能**遍历**它：
 * 每个渲染器都要按 `BlockRendererProps` 声明 block/info/typing/onBlockAction/onBlockIntent，
 * 而这份声明是逐文件手抄的，漏抄或抄窄不会报错（如 typing 收窄成 boolean → 传节奏配置对象时
 * 每次渲染打 dev 告警）。测试遍历本表即可对**全部**内置渲染器统一断言，新增块自动纳入覆盖，
 * 不依赖"记得同步补一条单点用例"——这类手工清单漂移正是它要防的问题本身。
 * 见 `__test__/blockRendererProps.test.ts`。
 */
export const BUILTIN_BLOCK_RENDERERS: BlockRenderers = {
  text: TextBlock,
  reasoning: ReasoningBlock,
  'thought-chain': ThoughtChainBlock,
  sources: SourcesBlock,
  attachment: AttachmentBlock,
  tool_use: ToolUseBlock,
  chart: ChartBlock,
  image: ImageBlock,
  quote: QuoteBlock,
  user_confirm: UserConfirmBlock,
};
