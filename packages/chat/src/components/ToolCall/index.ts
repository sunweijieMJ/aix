/**
 * @fileoverview ToolCall 组件统一导出
 *
 * 注意: ToolCall, ToolCallStatus 请直接从 @aix/chat-sdk 导入
 */

import ToolCallList from './ToolCallList.vue';
import ToolCallUI from './ToolCallUI.vue';

export type {
  ToolCallUIProps,
  ToolCallUISlots,
  ToolCallListProps,
  ToolCallListEmits,
} from './types';

export { ToolCallUI, ToolCallList };
export default ToolCallUI;
