<template>
  <div class="aix-rich-text-editor__toolbar">
    <template v-for="(group, groupIdx) in toolbarGroups" :key="group.id">
      <ToolbarDivider v-if="groupIdx > 0" />
      <div class="aix-rich-text-editor__toolbar-group">
        <template v-for="item in group.items" :key="item.key">
          <!-- 普通按钮 -->
          <ToolbarButton
            v-if="item.type === 'button'"
            :icon="item.icon"
            :title="item.label"
            :active="item.isActive()"
            :disabled="item.isDisabled()"
            @click="item.action"
          />

          <!-- 下拉选择 -->
          <ToolbarDropdown
            v-else-if="item.type === 'dropdown'"
            :icon="item.icon"
            :title="item.label"
            :disabled="item.isDisabled()"
            :options="item.options ?? []"
            :current-value="item.currentValue?.()"
            :display-label="item.displayLabel?.()"
            @select="(val: string) => item.onSelect?.(val)"
          />

          <!-- 颜色选择器 -->
          <ToolbarColorPicker
            v-else-if="item.type === 'color-picker'"
            :icon="item.icon"
            :title="item.label"
            :disabled="item.isDisabled()"
            :current-color="item.currentColor?.()"
            :colors="item.colors"
            :clear-label="locale?.clearColor ?? 'Clear'"
            @select="(color: string) => item.onColorSelect?.(color)"
          />
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { ToolbarGroup } from '../composables/useEditorToolbar';
import type { RichTextEditorLocale } from '../locale/types';
import ToolbarButton from './ToolbarButton.vue';
import ToolbarColorPicker from './ToolbarColorPicker.vue';
import ToolbarDivider from './ToolbarDivider.vue';
import ToolbarDropdown from './ToolbarDropdown.vue';

defineProps<{
  toolbarGroups: ToolbarGroup[];
  locale?: RichTextEditorLocale;
}>();
</script>
