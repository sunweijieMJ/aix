/**
 * @fileoverview Sources 组件统一导出
 */

import type { Component } from 'vue';
import Sources from './index.vue';
import SourceItem from './SourceItem.vue';

export type {
  SourcesProps,
  SourcesEmits,
  SourceItem as SourceItemType,
  SourceItemProps,
  SourceItemEmits,
} from './types';

// 组合导出
const SourcesWithSubComponents = Sources as typeof Sources & {
  Item: Component;
};

SourcesWithSubComponents.Item = SourceItem;

export default SourcesWithSubComponents;
export { Sources, SourceItem };
