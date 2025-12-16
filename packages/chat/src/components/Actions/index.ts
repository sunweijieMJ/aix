/**
 * @fileoverview Actions 组件统一导出
 */

import { withSubComponents } from '../../utils/withSubComponents';
import ActionCopy from './ActionCopy.vue';
import ActionFeedback from './ActionFeedback.vue';
import Actions from './index.vue';

export type {
  ActionsProps,
  ActionsEmits,
  ActionItem,
  ActionVariant,
  ActionStatus,
  FeedbackValue,
  ActionCopyProps,
  ActionCopyEmits,
  ActionFeedbackProps,
  ActionFeedbackEmits,
  ActionAudioProps,
  ActionAudioEmits,
} from './types';

// 组合导出
const ActionsWithSubComponents = withSubComponents(Actions, {
  Copy: ActionCopy,
  Feedback: ActionFeedback,
});

export default ActionsWithSubComponents;
export { Actions, ActionCopy, ActionFeedback };
