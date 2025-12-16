<template>
  <div
    :class="[
      'aix-conversations',
      { 'aix-conversations--disabled': disabled },
      className,
      classNames?.root,
    ]"
    :style="styles?.root"
  >
    <!-- 头部 -->
    <div
      :class="['aix-conversations__header', classNames?.header]"
      :style="styles?.header"
    >
      <h3 class="aix-conversations__title">{{ title || t.conversations }}</h3>
      <button v-if="showNew" class="aix-conversations__new" @click="handleNew">
        {{ newText || t.newChat }}
      </button>
    </div>

    <!-- 会话列表 -->
    <div
      :class="['aix-conversations__list', classNames?.list]"
      :style="styles?.list"
    >
      <!-- 分组模式 -->
      <template v-if="groupable && groupedItems.length > 0">
        <div
          v-for="group in groupedItems"
          :key="group.key"
          :class="['aix-conversations__group', classNames?.group]"
          :style="styles?.group"
        >
          <!-- 分组标题 -->
          <div
            :class="['aix-conversations__group-title', classNames?.groupTitle]"
            :style="styles?.groupTitle"
          >
            <slot name="groupTitle" :group="group" :count="group.items.length">
              <component
                :is="
                  () => groupTitleRender!({ group, count: group.items.length })
                "
                v-if="groupTitleRender"
              />
              <template v-else>
                {{ group.title }}
                <span class="aix-conversations__group-count"
                  >({{ group.items.length }})</span
                >
              </template>
            </slot>
          </div>

          <!-- 分组内的会话 -->
          <template v-for="item in group.items" :key="item.id">
            <component
              :is="
                () =>
                  itemRender!({
                    item,
                    active: item.id === activeId,
                    onClick: () => handleSelect(item),
                    onDelete: () => handleDelete(item.id),
                  })
              "
              v-if="itemRender"
            />
            <div
              v-else
              :class="[
                'aix-conversations__item',
                {
                  'aix-conversations__item--active': item.id === activeId,
                  'aix-conversations__item--pinned': item.pinned,
                },
                classNames?.item,
              ]"
              :style="styles?.item"
              @click="handleSelect(item)"
            >
              <slot name="item" :item="item" :active="item.id === activeId">
                <!-- 会话图标 -->
                <div v-if="showIcon" class="aix-conversations__icon">
                  <span v-if="typeof icon === 'string'">{{ icon }}</span>
                  <component :is="icon" v-else-if="icon" />
                  <span v-else>💬</span>
                </div>

                <!-- 会话内容 -->
                <div class="aix-conversations__content">
                  <div class="aix-conversations__item-title">
                    {{ item.title }}
                  </div>
                  <div
                    v-if="item.lastMessage"
                    class="aix-conversations__preview"
                  >
                    {{ item.lastMessage }}
                  </div>
                  <div
                    v-if="item.lastMessageTime"
                    class="aix-conversations__time"
                  >
                    {{ date.relative(new Date(item.lastMessageTime)) }}
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="aix-conversations__actions">
                  <slot name="itemActions" :item="item">
                    <button
                      class="aix-conversations__action"
                      :title="t.delete"
                      @click.stop="handleDelete(item.id)"
                    >
                      <Delete />
                    </button>
                  </slot>
                </div>
              </slot>
            </div>
          </template>
        </div>
      </template>

      <!-- 非分组模式 -->
      <template v-else>
        <template v-for="item in sortedItems" :key="item.id">
          <component
            :is="
              () =>
                itemRender!({
                  item,
                  active: item.id === activeId,
                  onClick: () => handleSelect(item),
                  onDelete: () => handleDelete(item.id),
                })
            "
            v-if="itemRender"
          />
          <div
            v-else
            :class="[
              'aix-conversations__item',
              {
                'aix-conversations__item--active': item.id === activeId,
                'aix-conversations__item--pinned': item.pinned,
              },
              classNames?.item,
            ]"
            :style="styles?.item"
            @click="handleSelect(item)"
          >
            <slot name="item" :item="item" :active="item.id === activeId">
              <!-- 会话图标 -->
              <div v-if="showIcon" class="aix-conversations__icon">
                <span v-if="typeof icon === 'string'">{{ icon }}</span>
                <component :is="icon" v-else-if="icon" />
                <span v-else>💬</span>
              </div>

              <!-- 会话内容 -->
              <div class="aix-conversations__content">
                <div class="aix-conversations__item-title">
                  {{ item.title }}
                </div>
                <div v-if="item.lastMessage" class="aix-conversations__preview">
                  {{ item.lastMessage }}
                </div>
                <div
                  v-if="item.lastMessageTime"
                  class="aix-conversations__time"
                >
                  {{ date.relative(new Date(item.lastMessageTime)) }}
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="aix-conversations__actions">
                <slot name="itemActions" :item="item">
                  <button
                    class="aix-conversations__action"
                    :title="t.delete"
                    @click.stop="handleDelete(item.id)"
                  >
                    <Delete />
                  </button>
                </slot>
              </div>
            </slot>
          </div>
        </template>
      </template>

      <!-- 空状态 -->
      <div v-if="items.length === 0" class="aix-conversations__empty">
        <slot name="empty">
          <div class="aix-conversations__empty-icon"><Message /></div>
          <div class="aix-conversations__empty-text">{{ t.noData }}</div>
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @fileoverview Conversations 会话列表组件
 * 支持分组显示、自定义渲染、快捷键等功能
 * @see ./types.ts - 导出类型定义
 */
import { useLocale } from '@aix/hooks';
import { Delete, Message } from '@aix/icons';
import { computed, onMounted, onUnmounted } from 'vue';
import { chatLocale } from '../../locale';
import type {
  ConversationsProps,
  ConversationsEmits,
  ConversationItem,
  ConversationGroup,
  GroupableFunction,
} from './types';
import { BUILT_IN_GROUPS } from './types';

const props = withDefaults(defineProps<ConversationsProps>(), {
  items: () => [],
  showNew: true,
  showIcon: true,
  disabled: false,
});

const emit = defineEmits<ConversationsEmits>();

/* 国际化 */
const { t, date } = useLocale(chatLocale);

/* ===== 快捷键系统 ===== */

/**
 * 处理快捷键按下
 */
function handleKeyDown(e: KeyboardEvent) {
  // 检查是否启用快捷键
  if (!props.shortcutKeys || props.shortcutKeys.enabled === false) return;

  // 忽略在输入框中的按键
  const target = e.target as HTMLElement;
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  ) {
    return;
  }

  // 检查是否是数字键 1-9
  const key = e.key;
  if (!/^[1-9]$/.test(key)) return;

  const keyNum = parseInt(key, 10);
  const { creation, items: itemKeys } = props.shortcutKeys;

  // 新建会话快捷键
  if (creation === keyNum) {
    e.preventDefault();
    handleNew();
    return;
  }

  // 切换会话快捷键
  if (itemKeys && itemKeys.length > 0) {
    const index = itemKeys.indexOf(keyNum);
    const item = sortedItems.value[index];
    if (index !== -1 && item) {
      e.preventDefault();
      handleSelect(item);
    }
  }
}

// 挂载/卸载键盘事件监听
onMounted(() => {
  if (props.shortcutKeys && props.shortcutKeys.enabled !== false) {
    window.addEventListener('keydown', handleKeyDown);
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

/**
 * 默认分组函数（按时间分组）
 */
function defaultGroupable(params: {
  item: ConversationItem;
  now: number;
}): ConversationGroup {
  const { item, now } = params;
  const time = item.lastMessageTime || 0;

  if (!time) return BUILT_IN_GROUPS.older;

  const diff = now - time;
  const oneDay = 24 * 60 * 60 * 1000;

  // 今天
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  if (time >= todayStart) {
    return BUILT_IN_GROUPS.today;
  }

  // 昨天
  const yesterdayStart = todayStart - oneDay;
  if (time >= yesterdayStart) {
    return BUILT_IN_GROUPS.yesterday;
  }

  // 最近 7 天
  if (diff < 7 * oneDay) {
    return BUILT_IN_GROUPS.last7days;
  }

  // 最近 30 天
  if (diff < 30 * oneDay) {
    return BUILT_IN_GROUPS.last30days;
  }

  // 更早
  return BUILT_IN_GROUPS.older;
}

/**
 * 排序后的会话列表（置顶 + 时间排序）
 */
const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    // 置顶优先
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // 按时间倒序
    const timeA = a.lastMessageTime || 0;
    const timeB = b.lastMessageTime || 0;
    return timeB - timeA;
  });
});

/**
 * 分组后的会话列表
 */
const groupedItems = computed(() => {
  if (!props.groupable) return [];

  const now = Date.now();
  const groupFn: GroupableFunction =
    typeof props.groupable === 'function' ? props.groupable : defaultGroupable;

  // 分组
  const groupMap = new Map<
    string,
    { group: ConversationGroup; items: ConversationItem[] }
  >();

  for (const item of sortedItems.value) {
    const group = groupFn({ item, now });
    if (!groupMap.has(group.key)) {
      groupMap.set(group.key, { group, items: [] });
    }
    groupMap.get(group.key)!.items.push(item);
  }

  // 转为数组并排序
  return Array.from(groupMap.values())
    .sort((a, b) => (a.group.order ?? 999) - (b.group.order ?? 999))
    .map(({ group, items }) => ({
      ...group,
      items,
    }));
});

/**
 * 选择会话
 */
function handleSelect(item: ConversationItem) {
  if (props.disabled) return;
  emit('select', item);
}

/**
 * 删除会话
 */
function handleDelete(id: string) {
  if (props.disabled) return;
  emit('delete', id);
}

/**
 * 新建会话
 */
function handleNew() {
  if (props.disabled) return;
  emit('new');
}
</script>

<style scoped lang="scss">
.aix-conversations {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--colorBorder, #d9d9d9);
  background-color: var(--colorBgContainer, #fff);

  &--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--padding, 12px);
    border-bottom: 1px solid var(--colorBorderSecondary, #f0f0f0);
  }

  &__title {
    margin: 0;
    color: var(--colorText, #000);
    font-size: var(--fontSize, 14px);
    font-weight: 600;
  }

  &__new {
    padding: var(--paddingXXS, 4px) var(--paddingXS, 8px);
    transition: all 0.2s;
    border: none;
    border-radius: var(--borderRadiusXS, 4px);
    background-color: var(--colorPrimary, #1677ff);
    color: var(--colorTextLight, #fff);
    font-size: var(--fontSizeXS, 12px);
    cursor: pointer;

    &:hover {
      background-color: var(--colorPrimaryHover, #4096ff);
    }

    &:active {
      background-color: var(--colorPrimaryActive, #0958d9);
    }
  }

  &__list {
    flex: 1;
    padding: var(--paddingXS, 8px);
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-thumb {
      border-radius: 2px;
      background: var(--colorBorder, #d9d9d9);
    }
  }

  /* 分组样式 */
  &__group {
    margin-bottom: var(--paddingSM, 12px);

    &:last-child {
      margin-bottom: 0;
    }
  }

  &__group-title {
    display: flex;
    align-items: center;
    margin-bottom: var(--paddingXXS, 4px);
    padding: var(--paddingXXS, 4px) var(--paddingXS, 8px);
    color: var(--colorTextSecondary, #666);
    font-size: var(--fontSizeXS, 12px);
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    gap: var(--paddingXXS, 4px);
  }

  &__group-count {
    color: var(--colorTextTertiary, #999);
    font-weight: 400;
  }

  &__item {
    display: flex;
    position: relative;
    align-items: flex-start;
    margin-bottom: var(--paddingXXS, 4px);
    padding: var(--paddingXS, 8px);
    transition: all 0.2s;
    border-radius: var(--borderRadiusXS, 4px);
    cursor: pointer;
    gap: var(--paddingXS, 8px);

    &:hover {
      background-color: var(--colorBgTextHover, rgb(0 0 0 / 0.06));

      .aix-conversations__actions {
        opacity: 1;
      }
    }

    &--active {
      background-color: var(--colorPrimaryBg, #e6f4ff);
    }

    &--pinned::before {
      content: '📌';
      position: absolute;
      top: 4px;
      right: 4px;
      font-size: 10px;
    }

    &-title {
      margin-bottom: 2px;
      overflow: hidden;
      color: var(--colorText, #000);
      font-size: var(--fontSize, 14px);
      font-weight: 500;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  &__icon {
    flex-shrink: 0;
    font-size: var(--fontSizeLG, 16px);
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__preview {
    margin-bottom: 2px;
    overflow: hidden;
    color: var(--colorTextSecondary, #999);
    font-size: var(--fontSizeXS, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__time {
    color: var(--colorTextTertiary, #999);
    font-size: var(--fontSizeXS, 12px);
  }

  &__actions {
    display: flex;
    transition: opacity 0.2s;
    opacity: 0;
    gap: var(--paddingXXS, 4px);
  }

  &__action {
    padding: 2px 4px;
    transition: all 0.2s;
    border: none;
    border-radius: var(--borderRadiusXS, 4px);
    background: transparent;
    cursor: pointer;

    &:hover {
      background-color: var(--colorErrorBg, #fff1f0);
    }
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--paddingLG, 24px);
    color: var(--colorTextTertiary, #999);
  }

  &__empty-icon {
    margin-bottom: var(--paddingXS, 8px);
    font-size: 48px;
  }

  &__empty-text {
    font-size: var(--fontSize, 14px);
  }
}

/* 响应式设计 */
@media (width <= 768px) {
  .aix-conversations {
    border-right: none;
    border-bottom: 1px solid var(--colorBorder, #d9d9d9);
  }
}
</style>
