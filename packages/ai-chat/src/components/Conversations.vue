<template>
  <div :class="ns.b()">
    <button type="button" :class="ns.e('new')" @click="emit('create')">
      <Add />
      <span>{{ newButtonText || t.newConversation }}</span>
    </button>

    <div v-if="searchable" :class="ns.e('search')">
      <Search :class="ns.e('search-icon')" />
      <input
        v-model="searchQuery"
        type="text"
        :class="ns.e('search-input')"
        :placeholder="searchPlaceholder || t.conversationsSearchPlaceholder"
        :aria-label="searchPlaceholder || t.conversationsSearchPlaceholder"
      />
    </div>

    <div :class="ns.e('list')">
      <Skeleton v-if="loading" :rows="5" />
      <template v-for="grp in grouped" v-else :key="grp.key || '__default'">
        <div v-if="grp.key" :class="ns.e('group')">{{ grp.key }}</div>
        <!-- 行是无语义容器：它内部有重命名 / 删除按钮与重命名输入框，而 ARIA 禁止 button
             角色包含交互式后代。主操作（选中）交给下面的原生 <button>，键盘可达性由平台负责。 -->
        <div
          v-for="item in grp.items"
          :key="item.id"
          :class="[ns.e('item'), ns.is('active', item.id === activeKey)]"
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
            <button
              type="button"
              :class="ns.e('label')"
              :aria-current="item.id === activeKey ? 'true' : undefined"
              @click="select(item.id)"
            >
              {{ item.label }}
            </button>
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
      <div v-if="!loading && filteredItems.length === 0" :class="ns.e('empty')">
        {{ items.length === 0 ? t.noConversations : t.conversationsSearchEmpty }}
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export interface ConversationsProps {
  /** 会话列表元数据（来自 useConversations.items） */
  items: ConversationItem[];
  /** 加载态：为 true 时列表区域渲染骨架占位，忽略 items，默认 false */
  loading?: boolean;
  /** 是否按 group 字段分组渲染，默认 false */
  groupable?: boolean;
  /** 是否显示内置搜索框（按 label 模糊匹配、大小写不敏感，纯本地过滤），默认 false */
  searchable?: boolean;
  /** 搜索框 placeholder，缺省取 locale */
  searchPlaceholder?: string;
  /** 新建按钮文案，缺省取 locale */
  newButtonText?: string;
  /**
   * 当前激活会话 id（v-model:activeKey）。可选；不传走非受控，由组件内部维护选中态。
   * 注意：不要设默认值——受控/非受控判定依赖此 prop 是否为 undefined（兼容 Vue 3.3 的 emit-only useModel），
   * 默认值交由 useControllable 的 defaultValue 兜底。
   */
  activeKey?: string;
}
export interface ConversationsEmits {
  /** 点击新建 */
  (e: 'create'): void;
  /** 重命名（行内编辑确认），携带 id 与新标题 */
  (e: 'rename', id: string, label: string): void;
  /** 删除会话，携带 id */
  (e: 'delete', id: string): void;
  /** 激活会话变化（v-model:activeKey） */
  (e: 'update:activeKey', id: string): void;
}
</script>

<script setup lang="ts">
import { useLocale } from '@aix/hooks';
import { useNamespace, useControllable } from '@aix/hooks';
import { Add, Edit, Delete, IconSearch as Search } from '@aix/icons';
import { ref, computed, nextTick, watch } from 'vue';
import { locale } from '../locale';
import type { ConversationItem } from '../types';
import Skeleton from './Skeleton.vue';

const props = withDefaults(defineProps<ConversationsProps>(), {
  loading: false,
  groupable: false,
  searchable: false,
});
const emit = defineEmits<ConversationsEmits>();
// 当前激活会话 id（v-model:activeKey）。select() 会内部写入选中态，属「内部写入 + 支持非受控」场景，
// 故用 useControllable 兼容 Vue 3.3（useModel emit-only 非受控下本地写入会丢失）。prop activeKey 须无默认值。
const { state: activeKey } = useControllable<string>({
  prop: () => props.activeKey,
  defaultValue: '',
  onChange: (v) => emit('update:activeKey', v),
});
const ns = useNamespace('conversations');
const { t } = useLocale(locale);

// 内置搜索（纯本地过滤）：按 label 大小写不敏感子串匹配。searchable=false 时 searchQuery
// 恒为空串，filteredItems 退化为 props.items，与未开启搜索前行为完全一致（零破坏性）。
const searchQuery = ref('');
const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return props.items;
  return props.items.filter((it) => it.label.toLowerCase().includes(q));
});

// 按 group 分组（保持首次出现顺序）；非分组态归为单组（key 为空，不渲染组标题）。
// 基于过滤后的列表分组：先过滤再分组，搜索与分组可叠加使用。
const grouped = computed(() => {
  if (!props.groupable) return [{ key: '', items: filteredItems.value }];
  const map = new Map<string, ConversationItem[]>();
  for (const it of filteredItems.value) {
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

// 注：选中项的键盘激活（Enter/Space）不再由本组件处理——主操作已是原生 <button>，
// 由浏览器负责，连带消除了「子元素按键冒泡到行上误触选中 / 输入框空格被 preventDefault 吞掉」
// 这一类需要 target 守卫才能绕开的问题。

// ===== 行内重命名 =====
const editingId = ref<string | null>(null);
const editingLabel = ref('');
const editInputRef = ref<HTMLInputElement | null>(null);
// v-for 内仅同时存在一个输入框（v-if 守卫），用回调 ref 取到它
const setEditInput = (el: unknown) => {
  editInputRef.value = (el as HTMLInputElement | null) ?? null;
};

// 编辑中条目随 items prop 更新被外部移除时（聚焦中的行内 input 卸载不触发 blur，
// editingId 无法经 confirm/cancel 路径复位），裁剪残留编辑态——否则 select 守卫会
// 永久阻断会话切换。与 ThoughtChain 裁剪 openMap 的既有模式一致。
watch(
  () => props.items,
  (list) => {
    if (editingId.value != null && !list.some((it) => it.id === editingId.value)) {
      editingId.value = null;
    }
  },
);

const startRename = (item: ConversationItem) => {
  editingId.value = item.id;
  editingLabel.value = item.label;
  nextTick(() => editInputRef.value?.focus());
};

const confirmRename = (e: Event) => {
  if (editingId.value == null) return; // enter 确认后 blur 再次触发时已为 null，安全跳过
  const id = editingId.value;
  const label = editingLabel.value.trim();
  // 空标签是无效提交：Enter 时保持编辑态等用户修正（不静默吞掉重命名意图）；
  // blur（点击他处离开）则按取消处理，恢复原名。
  if (!label) {
    if (e.type === 'blur') editingId.value = null;
    return;
  }
  editingId.value = null;
  emit('rename', id, label);
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

  &__search {
    display: flex;
    position: relative;
    flex: none;
    align-items: center;
  }

  &__search-icon {
    position: absolute;
    left: var(--aix-paddingXS);
    width: 14px;
    height: 14px;
    color: var(--aix-colorTextTertiary);
    pointer-events: none;
  }

  &__search-input {
    width: 100%;
    height: var(--aix-controlHeight);
    padding: 0 var(--aix-paddingXS) 0 28px;
    border: 1px solid var(--aix-colorBorderSecondary);
    border-radius: var(--aix-borderRadiusLG);
    outline: none;
    background: transparent;
    color: var(--aix-colorText);
    font-size: var(--aix-fontSize);

    &:focus {
      border-color: var(--aix-colorPrimary);
    }

    &::placeholder {
      color: var(--aix-colorTextQuaternary);
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
    gap: var(--aix-marginXXS);

    &:hover {
      background: var(--aix-colorFillTertiary);
    }

    &.is-active {
      background: var(--aix-colorFillSecondary);
      font-weight: var(--aix-fontWeightStrong);
    }
  }

  /* 主操作（选中）：原生 button 去掉浏览器默认外观，铺满行内剩余空间。
     行本身不再可点，故 cursor / 聚焦环都落在这里。 */
  &__label {
    flex: 1;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--aix-borderRadius);
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--aix-fontSize);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    /* 键盘聚焦环（与 AttachmentsPanel 占位区一致）；列表项相邻，offset 内收避免环重叠 */
    &:focus-visible {
      outline: 2px solid var(--aix-colorPrimary);
      outline-offset: -2px;
    }
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

  /* 焦点落在行内任意位置（含主操作 button）即显现操作按钮：
     键盘用户 Tab 到会话行时就能看到重命名 / 删除，而不必先盲跳进去才显形。 */
  &__item:hover &__actions,
  &__item:focus-within &__actions {
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
