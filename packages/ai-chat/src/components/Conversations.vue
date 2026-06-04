<template>
  <div :class="ns.b()">
    <button type="button" :class="ns.e('new')" @click="emit('create')">
      <Add />
      <span>{{ newButtonText || t.newConversation }}</span>
    </button>

    <div :class="ns.e('list')">
      <template v-for="grp in grouped" :key="grp.key || '__default'">
        <div v-if="grp.key" :class="ns.e('group')">{{ grp.key }}</div>
        <div
          v-for="item in grp.items"
          :key="item.id"
          :class="[ns.e('item'), ns.is('active', item.id === activeKey)]"
          @click="select(item.id)"
        >
          <input
            v-if="editingId === item.id"
            :ref="setEditInput"
            :class="ns.e('edit-input')"
            :value="editingLabel"
            :aria-label="t.renameConversation"
            @click.stop
            @keydown.enter.prevent="confirmRename"
            @keydown.esc.prevent="cancelRename"
            @blur="confirmRename"
            @input="editingLabel = ($event.target as HTMLInputElement).value"
          />
          <template v-else>
            <span :class="ns.e('label')">{{ item.label }}</span>
            <span :class="ns.e('actions')">
              <button
                type="button"
                :class="ns.e('action')"
                :aria-label="t.renameConversation"
                :title="t.renameConversation"
                @click.stop="startRename(item)"
              >
                <Edit />
              </button>
              <button
                type="button"
                :class="ns.e('action')"
                :aria-label="t.deleteConversation"
                :title="t.deleteConversation"
                @click.stop="emit('delete', item.id)"
              >
                <Delete />
              </button>
            </span>
          </template>
        </div>
      </template>
      <div v-if="items.length === 0" :class="ns.e('empty')">{{ t.noConversations }}</div>
    </div>
  </div>
</template>

<script lang="ts">
import type { ConversationItem } from '../types';

export interface ConversationsProps {
  /** 会话列表元数据（来自 useConversations.items） */
  items: ConversationItem[];
  /** 是否按 group 字段分组渲染，默认 false */
  groupable?: boolean;
  /** 新建按钮文案，缺省取 locale */
  newButtonText?: string;
}
export interface ConversationsEmits {
  /** 点击新建 */
  (e: 'create'): void;
  /** 重命名（行内编辑确认），携带 id 与新标题 */
  (e: 'rename', id: string, label: string): void;
  /** 删除会话，携带 id */
  (e: 'delete', id: string): void;
}
</script>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { useLocale } from '@aix/hooks';
import { Add, Edit, Delete } from '@aix/icons';
import { locale } from '../locale';
import { useNamespace } from '../composables/useNamespace';

const props = withDefaults(defineProps<ConversationsProps>(), { groupable: false });
const emit = defineEmits<ConversationsEmits>();
// 当前激活会话 id（受控，v-model:activeKey）
const activeKey = defineModel<string>('activeKey', { default: '' });
const ns = useNamespace('conversations');
const { t } = useLocale(locale);

// 按 group 分组（保持首次出现顺序）；非分组态归为单组（key 为空，不渲染组标题）
const grouped = computed(() => {
  if (!props.groupable) return [{ key: '', items: props.items }];
  const map = new Map<string, ConversationItem[]>();
  for (const it of props.items) {
    const k = it.group ?? '';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(it);
  }
  return [...map.entries()].map(([key, items]) => ({ key, items }));
});

const select = (id: string) => {
  // 行内重命名期间不切换选中，避免误触
  if (editingId.value == null) activeKey.value = id;
};

// ===== 行内重命名 =====
const editingId = ref<string | null>(null);
const editingLabel = ref('');
const editInputRef = ref<HTMLInputElement | null>(null);
// v-for 内仅同时存在一个输入框（v-if 守卫），用回调 ref 取到它
const setEditInput = (el: unknown) => {
  editInputRef.value = (el as HTMLInputElement | null) ?? null;
};

const startRename = (item: ConversationItem) => {
  editingId.value = item.id;
  editingLabel.value = item.label;
  nextTick(() => editInputRef.value?.focus());
};

const confirmRename = () => {
  if (editingId.value == null) return; // enter 确认后 blur 再次触发时已为 null，安全跳过
  const id = editingId.value;
  const label = editingLabel.value.trim();
  editingId.value = null;
  if (label) emit('rename', id, label);
};

const cancelRename = () => {
  editingId.value = null;
};
</script>

<style lang="scss">
.aix-conversations {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--aix-paddingSM);
  gap: var(--aix-marginXS);
  background: var(--aix-colorBgContainer);

  &__new {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: var(--aix-marginXXS);
    height: var(--aix-controlHeight);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
    cursor: pointer;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      border-color: var(--aix-colorPrimaryBorderHover);
      color: var(--aix-colorPrimary);
    }
  }

  &__list {
    flex: 1;
    overflow-y: auto;
  }

  &__group {
    padding: var(--aix-paddingXS) var(--aix-paddingSM) var(--aix-paddingXXS);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
  }

  &__item {
    display: flex;
    align-items: center;
    height: var(--aix-controlHeight);
    padding: 0 var(--aix-paddingSM);
    transition: background-color var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    border-radius: var(--aix-borderRadius);
    color: var(--aix-colorText);
    cursor: pointer;
    gap: var(--aix-marginXXS);

    &:hover {
      background: var(--aix-colorFillTertiary);
    }

    &.is-active {
      background: var(--aix-colorFillSecondary);
      font-weight: var(--aix-fontWeightStrong);
    }
  }

  &__label {
    flex: 1;
    overflow: hidden;
    font-size: var(--aix-fontSize);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__edit-input {
    flex: 1;
    min-width: 0;
    padding: var(--aix-paddingXXS) var(--aix-paddingXS);
    border: 1px solid var(--aix-colorPrimary);
    border-radius: var(--aix-borderRadiusSM);
    outline: none;
    background: var(--aix-colorBgContainer);
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);
  }

  /* 操作按钮：默认隐藏，hover 会话项或键盘聚焦时显现 */
  &__actions {
    display: inline-flex;
    flex: none;
    align-items: center;
    transition: opacity var(--aix-motionDurationFast) var(--aix-motionEaseInOut);
    opacity: 0;
    gap: var(--aix-marginXXS);
  }

  &__item:hover &__actions,
  &__actions:focus-within {
    opacity: 1;
  }

  @media (hover: none) {
    &__actions {
      opacity: 1;
    }
  }

  &__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--aix-controlHeightSM);
    height: var(--aix-controlHeightSM);
    padding: 0;
    border: none;
    border-radius: var(--aix-borderRadiusSM);
    background: transparent;
    color: var(--aix-colorTextTertiary);
    cursor: pointer;

    svg {
      width: 14px;
      height: 14px;
    }

    &:hover {
      background: var(--aix-colorFill);
      color: var(--aix-colorText);
    }
  }

  &__empty {
    padding: var(--aix-padding);
    color: var(--aix-colorTextTertiary);
    font-size: var(--aix-fontSizeSM);
    text-align: center;
  }
}
</style>
