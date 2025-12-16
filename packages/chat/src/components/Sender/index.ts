/**
 * @fileoverview Sender 组件统一导出
 */

import { withSubComponents } from '../../utils/withSubComponents';
import Sender from './index.vue';
import SenderHeader from './SenderHeader.vue';

export type {
  SenderProps,
  SenderEmits,
  SpeechConfig,
  ModelOption,
  SubmitType,
  SlotConfigType,
  TextSlotConfig,
  InputSlotConfig,
  SelectSlotConfig,
  TagSlotConfig,
  CustomSlotConfig,
  SlotValues,
  SkillConfig,
  SenderHeaderProps,
  SenderHeaderEmits,
  SenderHeaderExpandDirection,
  SenderHeaderExpandTrigger,
} from './types';

// 组合导出
const SenderWithSubComponents = withSubComponents(Sender, {
  Header: SenderHeader,
});

export { Sender, SenderHeader };
export default SenderWithSubComponents;
