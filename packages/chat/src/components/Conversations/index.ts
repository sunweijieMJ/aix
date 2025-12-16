/**
 * @fileoverview Conversations 组件统一导出
 */

import Conversations from './index.vue';

export type {
  ConversationsProps,
  ConversationsEmits,
  ConversationItem,
  ConversationGroup,
  ConversationMeta,
  GroupableParams,
  GroupableFunction,
  GroupTitleRenderProps,
  GroupTitleRender,
  ConversationItemRenderProps,
  ConversationItemRender,
  BuiltInGroupType,
  ConversationMenuItem,
  ScrollLoadConfig,
  ConversationMenuConfig,
  ShortcutKeysConfig,
} from './types';

export { BUILT_IN_GROUPS } from './types';

export { Conversations };
export default Conversations;
