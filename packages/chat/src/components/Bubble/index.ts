/**
 * @fileoverview Bubble 组件统一导出
 */

import BubbleAvatar from './BubbleAvatar.vue';
import BubbleContent from './BubbleContent.vue';
import BubbleDivider from './BubbleDivider.vue';
import BubbleEditable from './BubbleEditable.vue';
import BubbleList from './BubbleList.vue';
import BubbleMarkdown from './BubbleMarkdown.vue';
import BubbleSystem from './BubbleSystem.vue';
import Bubble from './index.vue';
import MultiModalContent from './MultiModalContent.vue';

export type {
  BubbleProps,
  BubbleEmits,
  BubbleListProps,
  BubbleAvatarProps,
  BubbleContentProps,
  BubbleContentEmits,
  BubbleTypingOption,
  BubbleShape,
  BubbleEditableConfig,
  BubbleDividerProps,
  BubbleDividerType,
  BubbleSystemProps,
  BubbleSystemEmits,
  BubbleSystemType,
  RoleConfig,
  RoleConfigFunction,
  RolesConfig,
  // 动画类型
  BubbleAnimationType,
  BubbleAnimationConfig,
  // 分组类型
  BubbleGroupConfig,
  // 处理后的消息类型（用于 BubbleList 插槽）
  ProcessedMessage,
} from './types';

// 组合导出 - 使用类型断言避免类型导出问题
const BubbleWithSubComponents = Object.assign(Bubble, {
  List: BubbleList,
  Avatar: BubbleAvatar,
  Content: BubbleContent,
  Markdown: BubbleMarkdown,
  MultiModal: MultiModalContent,
  Editable: BubbleEditable,
  Divider: BubbleDivider,
  System: BubbleSystem,
}) as typeof Bubble & {
  List: typeof BubbleList;
  Avatar: typeof BubbleAvatar;
  Content: typeof BubbleContent;
  Markdown: typeof BubbleMarkdown;
  MultiModal: typeof MultiModalContent;
  Editable: typeof BubbleEditable;
  Divider: typeof BubbleDivider;
  System: typeof BubbleSystem;
};

export default BubbleWithSubComponents;
export {
  Bubble,
  BubbleList,
  BubbleAvatar,
  BubbleContent,
  BubbleMarkdown,
  MultiModalContent,
  BubbleEditable,
  BubbleDivider,
  BubbleSystem,
};

// Context API
export {
  provideBubbleContext,
  useBubbleContext,
  BubbleContextKey,
  type BubbleContextValue,
  type CreateBubbleContextOptions,
} from './context';

// 角色预设配置
export {
  defaultRoles,
  minimalRoles,
  roundRoles,
  chatRoles,
  shadowRoles,
  compactRoles,
  createRolesConfig,
} from './presets';
